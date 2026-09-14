# Step 5: rules-v2

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` (AI, 효과)
- `/docs/ADR.md` (ADR-003, ADR-004, ADR-009, ADR-013)
- `/docs/UI_GUIDE.md` (문구)
- `src/ai/text.ts` (step 1), `src/ai/safety.ts` (step 2), `src/ai/targets.ts` (step 3), `src/ai/lexicon.ts` (step 4)
- `src/ai/rules.ts`, `src/ai/rules.test.ts`, `src/ai/normalize.ts` (손잡이·대상 조합 검증), `src/domain/knobs.ts`, `src/domain/measured.json`
- `src/game/effects.ts`, `src/engine/effects.ts` (해석이 엔진 효과가 되는 과정)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 배경 (감사)

규칙 해석은 무해한 입력 237개 중 27%에서만 뜻에 맞는 효과를 냈다. 문제는 네 가지였다.

- **무효과**: 52%가 효과 없음이었다.
- **해설 반복**: 거부되지 않은 490건 중 290건이 같은 해설 문장을 썼다.
- **부정어 무시**: "투수가 전혀 피곤하지 않다"가 체력▼▼가 됐다.
- **여러 TMI 뭉개기**: 한 문장의 여러 TMI가 한 대상으로 합쳐지거나 사라졌다.

## 작업

### `src/ai/rules.ts` 다시 조립
```ts
export function ruleInterpret(
  text: string,
  ctx: PromptContext,
  opts: { measuredAvailable: boolean; safety?: SafetyAssessment },
): Interpretation;
```
처리 순서:
1. **입력 정리**: `prepareText(text)`.
2. **안전 판정**: `opts.safety`가 있으면 그것을, 없으면 `assessSafety(prepared, ctx)`를 쓴다.
   - block은 `refused: true`에 그 문구다.
   - review는 AI가 없는 경로라 거부한다(ADR-013). 문구는 block과 같다.
3. **절 분석**: 절마다 `resolveTarget` → `matchConcepts`(step 4)를 거친다.
   - 개념의 손잡이가 대상과 맞지 않으면 개념이 정한 기본 대상으로 바꾼다. 예: 투수 손잡이인데 대상이 batter면 pitcher.
   - `teamOnly` 대상은 개인 손잡이 대신 해당 팀 `mood`(또는 개념이 정한 팀 손잡이)로 옮긴다.
4. **세기**: 개념 기본 세기 × 부정어(뒤집기 또는 없애기) × 강도(`prepared.intensity`, 1이면 그대로, 2면 한 단계 더). 결과는 −3..3 정수이고 0은 버린다.
5. **숫자**: `prepared.numbers`와 개념이 정한 실측 변수가 맞으면 MeasuredPart로 만든다(`opts.measuredAvailable`이고 `applicable`인 변수만).
   - 기온은 섭씨 값 그대로다. 체온 문맥은 안전 판정에서 이미 걸러진다.
   - 바람은 m/s다.
   - 이동은 시간이 있으면 시간 × 80km, 없으면 개념 기본값이다.
   - 낮 경기·주말·휴식일 다음은 1이다.
6. **합치기**: 같은 손잡이·같은 대상은 세기를 더해 ±3으로 자른다. 최대 3개이고, 실측 → |세기| 큰 순서로 고른다.
7. **대체 해석**: 거부가 아닌데 효과가 0개면 문장 분위기(긍정·부정 사전)로 방향을 정한다.
   - 대상이 사람이면 `focus`, 팀·관중이면 `mood`에 ±1을 넣는다. 범위 `pa`, 등급 `fun`이다.
   - 분위기 단서가 없으면 정리된 문장의 FNV-1a 해시 홀짝으로 방향을 정한다.
   - 이유(why)는 "딱 맞는 규칙이 없어 문장 분위기로 살짝 이었어요"다.
8. **해설(comment)**: 개념마다 다른 템플릿으로 만들고 개념어·대상 이름표를 넣는다. 예: "'짜장면 곱빼기' → 박투수 몸이 무거워진다고 봤어요". 같은 문장은 같은 해설을 낸다(결정적).
9. **결과 검증**: 결과는 항상 `normalizeInterpretation`을 통과하는 모양이어야 한다(손잡이·대상 조합, 세기 정수, 최대 3개).

`rulesVerdict`는 이번 step에서 바꾸지 않는다(step 9).

### 말뭉치 픽스처 `src/test/fixtures/tmiCorpus.ts`
- 가상 이름 컨텍스트 두 개(원정 공격·홈 공격)와 입력 220개 이상을 둔다.
- 각 입력에 기대값을 붙인다: `refused`, 허용 대상 목록, 허용 손잡이 목록, 세기 부호(선택).
- 범주는 감사와 같게 나눈다:
  - 앱 예시
  - 이름·별명
  - 팀·포지션·사람·응원
  - 환경·숫자
  - 음식·잠·이동·가족·징크스
  - 명령·질문
  - 부정·강도
  - 영어·은어·이모지·짧은 입력
  - 긴 문장·여러 TMI
  - 민감(40개 이상)
  - 무해한 경계(30개 이상)
- 실존 선수 이름을 쓰지 않는다.

### 테스트 (`src/ai/rules.test.ts` 다시 쓰기)
- 무해한 입력:
  - 거부 0건
  - 효과 1개 이상 100%
  - 기대값(대상·손잡이·부호) 일치 95% 이상. 일치하지 않은 사례는 테스트 출력에 목록으로 남긴다.
- 민감 입력은 거부 100%다.
- 무해한 경계 입력은 거부 0건이다.
- 여러 TMI 문장(절 2~3개)은 효과 대상이 절마다 맞다.
- 결정성: 같은 입력은 같은 결과다.
- 모든 결과가 `normalizeInterpretation`을 통과한다.
- 해설 다양성: 무해한 입력의 서로 다른 해설 문장이 입력 수의 60% 이상이다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/ai src/game
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - 확률 숫자를 해석기가 만들지 않는가(세기·실측 값만)?
   - `src/ai`가 순수 모듈인가(난수는 해시로만)?
   - 대체 효과에 'fun' 등급이 붙는가?
3. summary에 말뭉치 수치(무해 일치율, 대체 해석 비율, 민감 거부율, 경계 거부 수)를 적는다.
4. `phases/8-interpreter/index.json`의 step 5를 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 기대값을 결과에 맞춰 고치지 마라. 규칙을 고쳐라. 이유: 말뭉치는 "어떻게 입력하든 알아서"를 재는 기준이다.
- `Math.random`을 쓰지 마라. 이유: 순수 모듈 규칙·결정성.
- 테스트·픽스처에 실존 선수 이름을 쓰지 마라. 이유: 공개 저장소.
- `interpret.ts`·`normalize.ts`·`prompts.ts`를 고치지 마라. 이유: step 6의 범위다.
- 기존 테스트를 깨뜨리지 마라(규칙 해석 기대값이 바뀌는 기존 테스트는 새 기준으로 고친다).
