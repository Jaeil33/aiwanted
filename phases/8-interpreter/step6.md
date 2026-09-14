# Step 6: ai-repair

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` (AI)
- `/docs/ADR.md` (ADR-003, ADR-006, ADR-013)
- `/docs/UI_GUIDE.md` (문구)
- `src/ai/normalize.ts`, `src/ai/normalize.test.ts`, `src/ai/interpret.ts`, `src/ai/interpret.test.ts`, `src/ai/prompts.ts`, `src/ai/prompts.test.ts`
- `src/ai/providers/artifact.ts`, `src/ai/providers/http.ts`, `src/ai/providers/errors.ts`
- `api/_lib/anthropic.ts` (`extractJson` — 이번 step에서 순수 파서를 `src/ai`로 옮겨 공유한다)
- step 1~5 산출물: `src/ai/text.ts`, `safety.ts`, `targets.ts`, `lexicon.ts`, `rules.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 배경 (감사)

그럴듯한 AI 응답 46개 중 20개는 효과가 전부 버려졌다. 그중 16개는 명백히 합리적인 응답이었다.

- **버려진 원인**:
  - 세기가 −0.5면 반올림이 0이 된다.
  - 유니코드 마이너스를 숫자로 읽지 못한다.
  - "35도"를 숫자로 읽지 못한다.
  - knob 이름이 "체력"·"Stamina"다.
  - subject가 "투수"이거나 없다.
  - kind가 없다.
  - `parts` 대신 `effects` 키를 쓴다.
  - 실측 변수 이름이 "temperature"다.
  - refused가 문자열 "true"다.
- **구조 문제**: 효과가 전부 버려져도 빈 해석이 "AI 해석" 라벨과 ±0.00%p로 알림 없이 나간다. 안전 검사가 AI보다 먼저 돌아서, AI가 있어도 과잉 거부를 살릴 수 없다.

## 작업

### `src/ai/json.ts` (새 파일, 순수)
- `parseJsonLoose(text: string): unknown | null`: 코드펜스, 앞뒤 설명문, 최상위 배열을 처리한다. 첫 번째 완결 JSON 객체·배열을 찾는다.
- `api/_lib/anthropic.ts`의 `extractJson`은 이 함수를 쓰도록 바꾼다. 동작은 같거나 더 넓어야 한다.

### `src/ai/normalize.ts` 복구 규칙
`normalizeInterpretation(raw: unknown, ctx?: PromptContext): Interpretation | null`

- **입력 모양**: raw가 문자열이면 `parseJsonLoose`로 읽는다. 배열이면 `{ parts: 배열 }`로 본다. 효과 목록 키는 `parts` / `effects` / `changes` / 단일 객체를 모두 받는다.
- **kind**: 없으면 추론한다. knob이 있으면 knob, variable이 있으면 measured다. 대소문자는 무시한다.
- **knob 동의어**: `KNOB_META.label`(한국어), 영어 id, 흔한 표현(체력·스태미나·제구·커맨드·구위·멘탈·컨택·파워·장타·선구안·집중·주루·스피드·수비·비거리·미끄러운 공·시야·분위기)을 받는다.
- **subject 동의어**:
  - 타자·투수·공격팀·수비팀·모두, 영어 표기
  - "원정팀"·"홈팀"은 ctx가 있으면 공격·수비로 바꾼다.
  - subject가 없거나 조합이 맞지 않으면 knob의 기본 대상(`SUBJECTS_FOR[who][0]`)으로 고친다. 버리지 않는다.
- **strength**: 유니코드 마이너스, "+2", "−1", "2단계", 소수를 읽는다. |n| ≥ 0.25면 부호 × max(1, round(|n|))이고 ±3으로 자른다. |n| < 0.25만 버린다.
- **measured**: 변수 동의어(temperature·기온→`temp_c`, wind·바람→`wind_ms`, rain·강수→`rain_pre3h`, travel·이동→`travel_km`, day game·낮 경기→`day_game`, weekend·주말→`weekend`, off day·휴식일→`after_off_day`)를 받는다. value는 "35도" 같은 문자열에서 숫자를 뽑는다.
- **refused**: `true`, `"true"`, `"yes"`를 거부로 본다.
- 결과가 null인 경우는 객체로 읽을 수 없을 때뿐이다.

### `src/ai/interpret.ts` 흐름 (ADR-013)
1. `prepareText` → `assessSafety(prepared, ctx)`.
2. block이면 거부(source 'rules').
3. 프로바이더가 없으면 `ruleInterpret(clean, ctx, { measuredAvailable, safety })`.
4. AI를 부른다. 오류 코드별 규칙 대체는 기존대로 둔다.
5. AI가 거부했을 때: `safety.level === 'allow'`면 규칙 해석을 쓰고 note는 "AI가 계산을 거절해 규칙으로 계산했어요"다. review면 거부를 받아들인다.
6. `normalizeInterpretation(raw, ctx)`가 null이면 규칙 해석(기존 note)이다.
7. 거부가 아닌데 효과가 0개면 규칙 해석의 효과로 채운다. AI 해설이 있으면 쓰고, `source`는 `'rules'`, note는 "AI가 효과를 찾지 못해 규칙으로 채웠어요"다.
8. 절이 효과보다 많으면(`prepared.clauses.length > parts.length`) note에 "N개 중 M개를 계산했어요"를 더한다.

### `src/ai/prompts.ts`
- 해석 프롬프트에 네 가지를 넣는다.
  - "거부가 아니면 항상 효과를 1개 이상 낸다. 억지로 잇는 경우 evidence는 fun, 세기 ±1, scope pa"
  - 예시 5개: 은어, 부정어, 여러 TMI, 선수 아닌 사람, 질문
  - 두 팀 타순을 팀별로(`battingLineup`·`fieldingLineup`)
  - 거부 범위를 CLAUDE.md 범주와 똑같이
- 기존 출력 JSON 모양은 유지한다.

### `src/ai/providers/artifact.ts`
- `sample.json`이 JSON이 아닌 텍스트 때문에 실패하면, 같은 응답 텍스트가 오류에 담겨 있을 때 `parseJsonLoose`로 한 번 더 읽는다(재호출은 하지 않는다).

### 테스트
- `src/test/fixtures/aiVariants.ts`에 AI 응답 변형 45개 이상과 기대 결과를 둔다. 감사의 모든 버려짐 원인을 포함하고, 가상 이름을 쓴다.
- normalize 복구 테스트.
- interpret 흐름 테스트(가짜 프로바이더):
  - allow인데 AI 거부 → 규칙
  - review인데 AI 거부 → 거부
  - 효과 0 → 규칙 효과로 채움
  - 일부만 계산 note
- `parseJsonLoose` 테스트. `api/_lib/anthropic.test.ts`가 그대로 통과해야 한다.
- 프롬프트 스냅샷성 테스트: 필수 문장과 팀별 타순이 들어 있다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/ai api
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - AI 응답의 숫자를 확률로 쓰지 않는가(세기·실측 입력값만)?
   - `src/ai`(providers 제외)가 순수 모듈인가?
   - API 키가 코드·로그에 없는가?
3. `phases/8-interpreter/index.json`의 step 6을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"` (변형 통과율 포함)
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- AI 호출을 재시도하지 마라. 이유: ADR-006(비용·호출 제한).
- `api/_lib/handlers.ts`의 흐름을 바꾸지 마라(`extractJson` 교체만 허용). 이유: step 7의 범위다.
- 네트워크로 실제 AI를 부르는 테스트를 쓰지 마라. 이유: 키 없음·비용. 가짜 프로바이더만 쓴다.
- 기존 테스트를 깨뜨리지 마라(바뀐 흐름에 맞춰 기대값을 고치는 것은 허용).
