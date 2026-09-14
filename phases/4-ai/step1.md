# Step 1: ai-providers

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` ("핵심 계약"의 AI: 프로바이더 선택 순서)
- `/docs/ADR.md` (ADR-003, ADR-006)
- 이전 step 산출물: `src/ai/safety.ts`, `normalize.ts`, `rules.ts`, `prompts.ts`, `index.ts`
- 계약: `src/types/domain.ts`(`Interpretation`, `PromptContext`, `VerdictResult`), `src/types/data.ts`(`EvidenceData`), `src/test/fixtures/appData.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 아티팩트 런타임 `sample` 계약 (이 요약대로 구현한다)
- 아티팩트 안에서는 `const sample = await window.claude.use('sample')`이 함수 또는 `null`(런타임 없음·쓸 수 없음)을 준다. 아티팩트 밖에서는 `window.claude` 자체가 없다.
- `sample.json(input: string, options?: { modelTier?: 'quick' | 'default' | 'complex'; signal?: AbortSignal; tools?: SampleTool[] })` → 파싱된 JSON 값. 실패는 `{ code, message, text? }` **평범한 객체**로 reject한다(Error 아님).
- `SampleTool = { name: string; description: string; inputSchema?: { type: 'object'; properties?: object; required?: string[] }; execute(input: Record<string, unknown>, context: { signal: AbortSignal }): unknown }`. `execute`의 반환값이 Claude에게 간다. tools를 쓸 때는 `cache` 옵션을 넘기지 않는다.
- 에러 코드: 기능을 영구히 숨김 `not_granted`, `sampling_disabled`, `not_declared`, `capability_disabled`, `capability_removed` / 도구만 못 씀 `tools_unavailable` / 사용자에게 알림 `rate_limited`, `session_expired`, `refused`, `empty_completion`, `invalid_json`, `image_rejected` / 취소 `cancelled` / 그 외·모르는 코드는 `upstream_error`로 취급. 코드에서 재시도하지 않는다.
- 첫 호출 때 보는 사람에게 동의를 묻고 기다리므로 **아티팩트 경로에는 페이지 쪽 제한 시간을 두지 않는다**(ADR-006).

## 작업

모든 구현 파일은 테스트를 먼저 쓴다.

### `src/ai/providers/types.ts` (타입만)
```ts
import type { Interpretation, PromptContext } from '../../types/domain';
import type { EvidenceData } from '../../types/data';

export type AiErrorCode =
  | 'unavailable' | 'tools_unavailable' | 'rate_limited' | 'refused'
  | 'bad_response' | 'cancelled' | 'timeout' | 'network' | 'upstream';

export interface InterpretRequest { text: string; ctx: PromptContext; measuredAvailable: boolean }
export interface VerdictRequest { text: string; interpretation: Interpretation; ctx: PromptContext; evidence: EvidenceData }

export interface AiProvider {
  readonly name: 'artifact' | 'http';
  interpret(req: InterpretRequest, signal?: AbortSignal): Promise<unknown>;
  verdict(req: VerdictRequest, signal?: AbortSignal): Promise<unknown>;
}
```

### `src/ai/providers/errors.ts`
- `class AiError extends Error { readonly code: AiErrorCode; readonly permanent: boolean }`
- `fromSampleError(e: unknown): AiError` — 기능 숨김 코드 → `unavailable`(permanent true), `session_expired` → `unavailable`(permanent false), `tools_unavailable` → `tools_unavailable`, `rate_limited` → `rate_limited`, `refused` → `refused`, `invalid_json`·`empty_completion` → `bad_response`, `cancelled` → `cancelled`, 그 외 → `upstream`.

### `src/ai/providers/artifact.ts`
- `export interface SampleLike { json(input: string, options?: Record<string, unknown>): Promise<unknown> }`
- `createArtifactProvider(sample: SampleLike): AiProvider`
  - `interpret`: `sample.json(buildInterpretPrompt(req.text, req.ctx, { measuredAvailable: req.measuredAvailable }), { modelTier: 'quick', signal })`
  - `verdict`: tools = `[{ ...VERDICT_TOOL, execute: (input) => evidenceToolResult(req.evidence, input.variable) }]`, `sample.json(buildVerdictPrompt(req.text, req.interpretation, req.ctx), { modelTier: 'default', tools, signal })`
  - reject 값은 `fromSampleError`로 바꿔 던진다.
- `resolveArtifactSample(win: { claude?: { use?: (name: string) => Promise<unknown> } } | undefined): Promise<SampleLike | null>` — `win?.claude?.use`가 없으면 곧바로 null. 있으면 `use('sample')` 결과가 `json` 함수를 가졌을 때만 돌려주고, null·reject면 null.

### `src/ai/providers/http.ts`
- `createHttpProvider(opts: { baseUrl: string; fetch: typeof fetch; interpretTimeoutMs?: number; verdictTimeoutMs?: number }): AiProvider` (기본 8,000ms / 60,000ms)
  - `POST ${baseUrl}/interpret` 본문 `InterpretRequest`, `POST ${baseUrl}/verdict` 본문 `VerdictRequest`, `content-type: application/json`.
  - 200 `{ raw }` → `raw`를 돌려준다. 429 → `rate_limited`, 503 → `unavailable`(permanent), 그 외 비정상 → `upstream`, fetch 예외 → `network`, 제한 시간 초과 → `timeout`. 제한 시간은 내부 AbortController + `setTimeout`으로 만들고 외부 `signal`이 abort되면 `cancelled`.

### `src/ai/interpret.ts`
- `interpretTmi(text: string, ctx: PromptContext, provider: AiProvider | null, opts: { measuredAvailable: boolean; signal?: AbortSignal }): Promise<{ interpretation: Interpretation; note: string; disableProvider: boolean }>`
  1. 앞뒤 공백을 지우고 80자로 자른다. 빈 문자열이면 Error를 던진다.
  2. `checkSensitive`에 걸리면 provider를 부르지 않고 `{ source: 'rules', refused: true, reason, comment: '', parts: [] }`.
  3. provider가 null이면 `ruleInterpret`.
  4. `provider.interpret` 결과를 `normalizeInterpretation`으로 검증. 성공이면 그대로, null이면 `ruleInterpret` + note "AI 응답을 읽지 못해 규칙으로 계산했어요."
  5. `AiError` 처리: `unavailable` → 규칙 + "AI 해석을 쓸 수 없어 규칙으로 계산했어요." + `disableProvider: permanent` / `rate_limited` → 규칙 + "AI 호출 한도에 걸려 규칙으로 계산했어요. 잠시 뒤 다시 해 보세요." / `refused` → `{ source: 'ai', refused: true, reason: 'AI가 이 문장은 계산하지 않기로 했어요.', ... }` / `timeout` → 규칙 + "AI 응답이 늦어 규칙으로 계산했어요." / `cancelled` → 그대로 다시 던진다 / 그 외 → 규칙 + "AI 해석에 실패해 규칙으로 계산했어요."

### `src/ai/verdict.ts`
- `judgeTmi(text: string, interpretation: Interpretation, ctx: PromptContext, evidence: EvidenceData | null, provider: AiProvider | null, signal?: AbortSignal): Promise<{ verdict: VerdictResult; note: string; disableProvider: boolean }>`
  - interpretation이 refused면 `unmeasurable`, headline "판정하지 않는 문장이에요"(source rules).
  - evidence나 provider가 null이면 `rulesVerdict`.
  - `provider.verdict` 결과를 `normalizeVerdict(raw, evidence)`로 검증, null이면 `rulesVerdict` + note "AI 판정을 읽지 못해 기록표로 판정했어요."
  - 오류 매핑은 interpret와 같게 하되 `tools_unavailable` → `rulesVerdict` + note "이 화면에서는 AI 판정을 쓸 수 없어 기록표로 판정했어요."(disableProvider false).

### `src/ai/providers/index.ts`, `src/ai/index.ts`
- `pickProvider(env: { artifactSample: SampleLike | null; apiBase: string | null; fetch?: typeof fetch }): AiProvider | null` — 아티팩트 → http(apiBase와 fetch가 있을 때) → null 순서.
- 공개 API 재내보내기와 `index.test.ts` 갱신.

### 테스트 (가짜 sample·가짜 fetch만)
- artifact: interpret가 `quick` tier이고 프롬프트에 사용자 문장이 들어감. verdict가 `default` tier, tools에 `lookupEvidence`, `cache` 옵션 없음, `execute`가 evidence 요약을 돌려줌. sample 에러 코드 → AiError 매핑 표.
- resolveArtifactSample: win 없음·claude 없음·use가 null·use reject → null, 정상 → SampleLike.
- http: 요청 URL·본문, 200 → raw, 429·503·502 매핑, fetch 예외, 제한 시간(`vi.useFakeTimers`), 외부 abort → cancelled.
- interpretTmi: 민감 문장은 provider 호출 없음, provider null → rules, AI 정상, normalize 실패, AiError 코드별 note·disableProvider, cancelled 재던짐.
- judgeTmi: refused, evidence null, AI가 evidence와 다른 verdict를 말하면 evidence로 덮임, tools_unavailable.
- pickProvider 순서.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `fetch`·`setTimeout`·`window` 접근이 `src/ai/providers` 안에만 있는가?
   - AI 출력이 항상 normalize를 거치는가? (ADR-003)
   - 아티팩트 경로에 페이지 쪽 제한 시간이 없는가? (ADR-006)
3. 결과에 따라 `phases/4-ai/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 오류가 났을 때 코드에서 AI 호출을 재시도하지 마라. 이유: 보는 사람의 사용량을 쓰고, 플랫폼 지침이 금지한다.
- 클라이언트에서 Anthropic API를 직접 부르거나 API 키를 다루지 마라. 이유: CLAUDE.md CRITICAL.
- 서버리스 함수(`api/`)를 만들지 마라. 이유: 다음 step의 범위다.
- `src/types`, `src/domain`, `src/engine`을 수정하지 마라.
- 기존 테스트를 깨뜨리지 마라.
