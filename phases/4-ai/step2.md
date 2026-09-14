# Step 2: api-functions

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL: API 키는 `api/` 함수의 환경변수로만)
- `/docs/ARCHITECTURE.md` ("데이터 흐름"의 배포 서버리스)
- `/docs/ADR.md` (ADR-003, ADR-006)
- 이전 step 산출물: `src/ai/prompts.ts`, `normalize.ts`, `safety.ts`, `src/ai/providers/types.ts`, `src/ai/providers/http.ts`(요청·응답 형식), `src/ai/index.ts`
- 0-setup 산출물: `tsconfig.node.json`(`api/**/*.ts` 포함), `vitest.config.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, `http` 프로바이더가 보내는 요청 형식과 정확히 맞춘다.

## 작업

배포용 서버리스 함수 두 개를 만든다. 서버가 **구조화된 입력으로 프롬프트를 직접 만든다**(클라이언트가 보낸 프롬프트를 그대로 쓰지 않는다 — 범용 LLM 프록시로 악용되지 않게). 모든 파일은 테스트를 먼저 쓰고, 테스트 파일 첫 줄에 `// @vitest-environment node`를 둔다.

### `api/_lib/anthropic.ts`
- `callMessages(args: { apiKey: string; model: string; system?: string; messages: Message[]; tools?: ToolDef[]; maxTokens: number }, fetchImpl: typeof fetch): Promise<MessagesResponse>` — `POST https://api.anthropic.com/v1/messages`, 헤더 `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`. 429 → `AiHttpError('rate_limited')`, 5xx·네트워크 오류 → `'upstream'`, 그 외 4xx → `'bad_request'`.
- `firstText(res): string`, `extractJson(text: string): unknown` — 코드펜스 제거 후 첫 `{`부터 짝이 맞는 `}`까지 JSON.parse, 실패하면 `AiHttpError('bad_response')`.
- `runToolLoop(args, tools: Array<{ def: ToolDef; execute(input: unknown): unknown }>, fetchImpl, maxRounds = 4): Promise<string>` — `stop_reason === 'tool_use'`면 tool_use 블록마다 execute 결과를 `tool_result`로 붙여 다시 호출, 끝나면 마지막 텍스트를 돌려준다. 라운드를 넘기면 `bad_response`.

### `api/_lib/rateLimit.ts`
- `createRateLimiter(opts: { limit: number; windowMs: number; now: () => number }): { check(key: string): { ok: boolean; retryAfterMs: number } }` — 고정 창 카운터. 오래된 키는 정리한다.

### `api/_lib/handlers.ts`
- `Deps { env: { ANTHROPIC_API_KEY?: string; TMI_MODEL_INTERPRET?: string; TMI_MODEL_VERDICT?: string }; fetch: typeof fetch; limiter: ReturnType<typeof createRateLimiter> }`
- `handleInterpret(request: Request, deps: Deps): Promise<Response>`
  - POST가 아니면 405. 본문 4KB 초과면 413. JSON이 아니거나 형식이 틀리면 400.
  - 입력 `{ text: string(1~80자), ctx: PromptContext, measuredAvailable: boolean }` — ctx 문자열 필드는 각 40자, `lineupNames` 최대 20개로 검증.
  - IP(`x-forwarded-for` 첫 값, 없으면 `'anon'`)당 분당 10회 초과면 429(`retry-after` 헤더).
  - 키가 없으면 503 `{ error: 'ai_unconfigured' }`.
  - `checkSensitive(text)`에 걸리면 AI를 부르지 않고 200 `{ raw: { refused: true, reason } }`.
  - `buildInterpretPrompt`로 프롬프트를 만들어 모델 `TMI_MODEL_INTERPRET ?? 'claude-haiku-4-5-20251001'`, `max_tokens` 700으로 호출하고, 200 `{ raw: extractJson(text) }`. 검증(normalize)은 클라이언트가 한 번 더 하지만 서버도 `normalizeInterpretation`이 null이면 502 `{ error: 'bad_response' }`.
  - 업스트림 오류는 502(`upstream`·`bad_response`) 또는 429(`rate_limited`)로 옮긴다.
- `handleVerdict(request: Request, deps: Deps): Promise<Response>`
  - 입력 `{ text, interpretation: Interpretation, ctx: PromptContext, evidence: EvidenceData }` — 본문 16KB 이하, evidence items는 `MEASURED` id만·숫자 필드는 유한수만 허용.
  - 같은 IP 제한, 키 확인, 거부된 interpretation이면 AI 없이 200 `{ raw: null }`.
  - `buildVerdictPrompt` + `VERDICT_TOOL`로 `runToolLoop`(execute = `evidenceToolResult(evidence, input.variable)`), 모델 `TMI_MODEL_VERDICT ?? 'claude-sonnet-5'`, `max_tokens` 900. 200 `{ raw: extractJson(text) }`.
- 응답은 모두 `content-type: application/json; charset=utf-8`. 오류 응답·로그에 API 키나 요청 원문 전체를 넣지 마라.

### `api/interpret.ts`, `api/verdict.ts`
- `export async function POST(request: Request): Promise<Response>` — 모듈 수준에서 한 번 만든 limiter와 `process.env`, 전역 `fetch`로 핸들러를 부른다(Vercel Web 표준 함수 형식).

### 테스트
- anthropic: 요청 헤더·본문 모양, 429·500 오류 매핑, extractJson(코드펜스, 앞뒤 잡담), runToolLoop가 도구를 실행하고 두 번째 호출 결과 텍스트를 돌려줌, 라운드 초과.
- rateLimit: 창 안 limit 초과 → ok false·retryAfterMs, 창이 지나면 다시 허용.
- handlers(가짜 fetch): 405, 413, 400(빈 text·81자), 429, 503(키 없음), 민감 문장 → AI 호출 없이 refused, 정상 → `{ raw }`, AI가 이상한 JSON → 502, verdict 정상 흐름에서 도구 결과가 evidence 값으로 채워짐.
- 응답 본문 어디에도 테스트용 API 키 문자열이 없다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - API 키를 읽는 곳이 `api/` 안뿐인가? (`grep -r "ANTHROPIC_API_KEY" src` 결과가 없어야 한다)
   - 서버가 클라이언트 프롬프트 원문을 그대로 모델에 넘기지 않는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/4-ai/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 실제 Anthropic API를 호출하는 테스트를 만들지 마라. 이유: 키가 없고 비용이 든다. 가짜 fetch만 쓴다.
- `@anthropic-ai/sdk`, `@vercel/node` 등 패키지를 설치하지 마라. 이유: ADR-007, fetch로 충분하다.
- `vercel.json`이나 배포 설정을 만들지 마라. 이유: 배포는 사용자 계정이 필요한 별도 작업이다.
- `src/types`, `src/domain`, `src/engine`을 수정하지 마라.
- 기존 테스트를 깨뜨리지 마라.
