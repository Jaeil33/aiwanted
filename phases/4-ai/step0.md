# Step 0: interpret-core

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL: AI 응답 검증, 순수 모듈, 민감 내용 거부)
- `/docs/ARCHITECTURE.md` ("핵심 계약"의 AI)
- `/docs/ADR.md` (ADR-003, ADR-006)
- `/docs/PRD.md` (핵심 기능 2 TMI 걸기, 7 판정소)
- `/docs/UI_GUIDE.md` ("문구")
- 계약: `src/types/domain.ts`(`Interpretation`, `EffectPart`, `KnobPart`, `MeasuredPart`, `PromptContext`, `VerdictResult`), `src/types/data.ts`(`EvidenceData`, `EvidenceItem`), `src/domain/knobs.ts`(`KNOB_META`, `SUBJECTS_FOR`, `SUBJECT_LABEL`), `src/domain/measured.ts`(`MEASURED`, `measuredById`), `src/domain/format.ts`, `src/test/fixtures/appData.ts`
- 이식 원본(읽기만): `reference/tmi-prototype/app.js`의 `RULES`, `ruleInterpret`, `TARGETS`, `normalizeAI`, `buildPrompt`, `KNOB_HINT`, `WHO_TEXT`와 `reference/tmi-prototype/app.test.js`

`src/ai`(단 `src/ai/providers` 제외)는 순수 모듈이다. 네트워크·타이머·`window`를 쓰지 마라. 모든 파일은 테스트를 먼저 쓴다.

## 작업

### `src/ai/safety.ts`
- `checkSensitive(text: string): { blocked: boolean; reason: string }` — 아래 범주가 보이면 막고 reason은 "실존 인물에게 민감한 내용이라 계산하지 않았어요."
  - 범죄·중독: 음주운전, 도박, 폭행, 폭력, 마약, 약물, 도핑, 불법, 체포
  - 음주: 술에 취, 만취, 음주, 숙취는 허용하지 않는다(실존 선수 대상일 수 있음)
  - 질병·부상·사망: 아프, 병원, 입원, 수술, 부상, 다쳤, 골절, 암 진단, 사망, 죽었, 자살
  - 사생활: 이혼, 불륜, 바람피, 바람을 피, 열애, 임신, 장례
  - 성적 내용, 신체·장애·지역·성별 비하어
- "바람이 분다", "바람이 세다" 같은 날씨 문장은 막지 않는다.

### `src/ai/normalize.ts`
- `normalizeInterpretation(raw: unknown): Interpretation | null` — `source: 'ai'`.
  - 객체가 아니면 null. `refused === true`면 `{ source: 'ai', refused: true, reason, comment: '', parts: [] }`(reason 80자, 비면 safety의 기본 문구).
  - `parts`(배열이 아니면 빈 배열)를 앞에서부터 검사해 통과한 것만 최대 3개:
    - `kind: 'knob'`: `KNOB_META`에 있는 knob. env 손잡이는 subject를 `everyone`으로 바꾸고, 그 외는 `SUBJECTS_FOR[who]`에 없으면 버림. strength는 반올림 후 −3..3, 0이면 버림. scope는 `'pa'`가 아니면 `'game'`. evidence는 `plausible`·`fun`만 허용하고 `measured`는 `plausible`로, 그 외는 `fun`으로. why 60자.
    - `kind: 'measured'`: `MEASURED`에 있고 `applicable`인 variable. value는 유한수여야 하고 linear는 min·max로 자르고 indicator는 0/1로. subject는 who `env` → `everyone`으로 바꿈, `team` → batter·pitcher·battingTeam·fieldingTeam·everyone 중 하나, `opponentStarter` → pitcher·fieldingTeam·batter·battingTeam 중 하나. why 60자.
    - (kind, knob 또는 variable, subject)가 같은 중복은 첫 번째만.
  - comment 90자. 모든 문자열에서 제어 문자를 지운다.
- `normalizeVerdict(raw: unknown, evidence: EvidenceData): VerdictResult | null` — `source: 'ai'`. `variables`는 evidence items에 있는 id만 최대 3개. **verdict는 첫 변수의 evidence item verdict로 덮어쓴다**(AI가 다르게 말해도 데이터 판정이 이긴다). variables가 비면 `unmeasurable`. headline 40자, body 220자. 객체가 아니면 null.

### `src/ai/rules.ts`
- `ruleInterpret(text: string, ctx: PromptContext, opts: { measuredAvailable: boolean }): Interpretation` — `source: 'rules'`.
  - 사람 규칙: app.js `RULES`의 음식·든든·수면·기분 좋음·마음 흔들림·징크스·방해 요소·배트·장비·가족 규칙을 `KnobPart`로 옮긴다(knob·세기·scope·why 그대로, evidence `data`는 `plausible`로).
  - 대상: 투수 이름이나 "투수|포수|마무리|선발|불펜|마운드"가 있고 타자 이름이나 "타자|대타|타석"이 없으면 pitcher, 아니면 batter.
  - 날씨·일정 규칙: `measuredAvailable`이면 `MeasuredPart`, 아니면 괄호 안 손잡이로 대신한다.
    - "숫자 + 도"(예: 34도) → `temp_c` 그 값 / 폭염·무더위·더워·더운 → `temp_c` 32 / 쌀쌀·추워·추운·한파 → `temp_c` 8 (대체: carry ±2, everyone, plausible)
    - 강풍·바람이 세·태풍 → `wind_ms` 9, "숫자 m/s" → 그 값 (대체 없음)
    - 비가·비 온·빗방울·우천·젖은·습한 → `rain_pre3h` 3 (대체: slick +2, everyone, plausible)
    - 낮 경기·땡볕·햇빛 → `day_game` 1 (대체: glare +1, everyone, scope pa, plausible)
    - 주말·토요일·일요일 → `weekend` 1 (대체 없음)
    - 원정길·장거리 이동·버스로 → `travel_km` 350, subject battingTeam (대체: mood −1, battingTeam, fun)
    - 푹 쉬·휴식일·쉬고 온 → `after_off_day` 1, subject battingTeam (대체: mood +1, battingTeam, fun)
    - "선발" + 짧게 쉬·당겨서·덜 쉬 → `starter_short_rest` 1, subject pitcher (대체: stamina −1, pitcher, plausible)
    - "선발" + 오래 쉬·열흘·복귀 → `starter_long_rest` 1, subject pitcher (대체: control −1, pitcher, fun)
  - 관중·함성·응원·만석·매진 → mood +1, 홈 팀이 공격 중(`ctx.battingTeam === ctx.homeName`)이면 battingTeam, 아니면 fieldingTeam.
  - 최대 3개. 아무것도 없으면 `parts: []`, comment "승부와 이어 붙일 방법이 없는 변수로 판정했어요. 차이는 0이에요."
  - 첫 규칙의 why를 comment로 쓴다.
- `rulesVerdict(text: string, interpretation: Interpretation, evidence: EvidenceData | null): VerdictResult` — `source: 'rules'`. 후보 변수 = interpretation의 measured parts의 variable + 위 날씨·일정 키워드로 찾은 변수(중복 제거).
  - evidence가 null → `unmeasurable`, headline "판정 데이터가 아직 없어요".
  - 후보 없음 → `unmeasurable`, headline "기록으로 잴 수 없는 변수예요", body "이런 이야기는 경기 기록에 남지 않아 실제 효과를 잴 수 없어요."
  - 후보 있음 → 첫 변수 item의 verdict, headline(`real` "기록으로 확인된 효과예요", `maybe` "있을 수도, 없을 수도 있어요", `useless` "쓸모없는 변수로 판정됐어요"), body는 item의 note.

### `src/ai/prompts.ts`
- `buildInterpretPrompt(text: string, ctx: PromptContext, opts: { measuredAvailable: boolean }): string` — app.js `buildPrompt`를 새 스키마로 바꾼다: 역할("쓸데없는 변수 분석관"), 장면 한 줄, 손잡이 목록(KNOB_META의 id·label·대상·hint), `measuredAvailable`일 때만 실측 변수 목록(applicable인 것의 id·label·unit·perLabel), 규칙(세기 1은 사소함·대부분 ±1, 대상은 SUBJECTS_FOR에 맞춰, 범위, 근거 등급, 최대 3개, 실측 변수는 문장에 그 사실이 분명할 때만, 민감 내용이면 refused), 출력은 다른 글 없이 JSON 하나(`{"refused":false,"reason":"","comment":"...","parts":[{"kind":"knob",...},{"kind":"measured",...}]}` 예시), 마지막 줄에 `[시청자 변수] ${JSON.stringify(text)}`.
- `buildVerdictPrompt(text: string, interpretation: Interpretation, ctx: PromptContext): string` — 도구 `lookupEvidence`로 후보 변수를 최대 3개 조회하고, 도구 결과에 있는 숫자만 인용해 JSON `{"variables":[...],"verdict":"real|maybe|useless|unmeasurable","headline":"...","body":"..."}`로 답하라고 지시한다. 효과 크기를 추측하지 말 것, 맞는 변수가 없으면 `unmeasurable`.
- `VERDICT_TOOL = { name: 'lookupEvidence', description: string, inputSchema: { type: 'object', properties: { variable: { type: 'string', enum: [MEASURED id 10개] } }, required: ['variable'] } }`
- `evidenceToolResult(evidence: EvidenceData | null, variable: unknown): Record<string, unknown>` — 해당 item 요약(label, perLabel, runsPctPerUnit, 95% 구간을 퍼센트로, 2026 검증 개선량과 구간, verdict, note) 또는 `{ error: '...' }`.

### `src/ai/index.ts`
- 위 공개 API를 다시 내보낸다. `index.test.ts`에서 이름 목록을 확인한다.

### 테스트 (app.test.js를 옮기고 보강)
- safety: 범주별 민감 문장은 막고 "바람이 분다"는 통과.
- normalizeInterpretation: 잘못된 knob·subject·strength·scope·evidence 처리, env subject 강제, measured 값 자르기, `home`(applicable false) 제거, 중복 제거, 최대 3개, refused, 비객체 null, 긴 문자열 자르기.
- normalizeVerdict: AI가 `real`이라 해도 evidence가 `useless`면 `useless`, 모르는 variable 제거.
- ruleInterpret: "(투수 이름)이 경기 전 짜장면 곱빼기를 먹었다" → stamina −1 pitcher; "대타가 늦잠을 잤다" → focus −1 batter; "폭염" → measured temp_c 32(measuredAvailable) / carry +2(아님); 관중 응원 → 홈 팀 mood; 뜻 없는 문장 → parts [].
- prompts: 장면 이름과 손잡이 14개 포함, measuredAvailable에 따라 실측 목록 포함/제외, 따옴표가 든 사용자 문장이 JSON 문자열로 들어감.
- rulesVerdict 세 경우, evidenceToolResult 정상·오류.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/ai`(providers 제외)에 네트워크·타이머·window 코드가 없는가?
   - AI 출력이 normalize를 거치지 않고 쓰이는 경로가 없는가? (ADR-003)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/4-ai/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 규칙이나 프롬프트에서 확률 숫자를 만들지 마라. 이유: 숫자는 엔진만 계산한다(CLAUDE.md CRITICAL, ADR-003).
- 실측 효과 크기(%)를 코드에 적지 마라. 이유: evidence.json만이 출처다(ADR-004).
- 테스트에 실존 선수 이름을 쓰지 마라. 합성 이름만. 이유: 공개 저장소, ADR-005.
- 네트워크 호출·프로바이더를 만들지 마라. 이유: 다음 step의 범위다.
- `src/types`, `src/domain`, `src/engine`을 수정하지 마라.
- 기존 테스트를 깨뜨리지 마라.
