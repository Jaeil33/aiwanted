# Step 9: verdict-rules

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/PRD.md` (핵심 기능 7 판정소)
- `/docs/ADR.md` (ADR-003, ADR-004, ADR-013)
- `src/ai/rules.ts` (`rulesVerdict`), `src/ai/verdict.ts`, `src/ai/verdict.test.ts`
- `src/ai/lexicon.ts` (step 4: `Concept.category`, `Concept.measured`)
- `src/types/data.ts` (`EvidenceData`), `src/domain/measured.json`
- `src/test/fixtures/tmiCorpus.ts` (step 5)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 배경 (감사)

규칙 판정은 거부되지 않은 490건 중 95%가 '잴 수 없음'이었다. `rulesVerdict`가 날씨·일정 변수 9개의 원문 표현만 보기 때문이다. 판정소가 이름만 있고 거의 쓸모가 없었다.

## 작업

### `src/ai/rules.ts`의 `rulesVerdict`
```ts
export function rulesVerdict(text: string, interpretation: Interpretation, evidence: EvidenceData | null): VerdictResult;
```
- 판정할 변수는 두 곳에서 찾는다.
  1. 해석의 MeasuredPart 변수
  2. KnobPart를 만든 개념의 `Concept.measured` 변수(해석에서 개념 id를 알 수 없으면 `matchConcepts(prepareText(text))`로 다시 찾는다)
- 판정 결과는 evidence 행이 정한다: `real`은 진짜 효과, `maybe`는 애매해요, `useless`는 쓸모없음.
  - 설명에는 그 행의 숫자(득점 변화 %, 95% 구간, 검증 시즌 개선 여부)만 인용한다.
  - evidence가 null이면 '잴 수 없음'이고, "판정 데이터가 아직 없어요"라고 쓴다.
- 이어지는 변수가 없으면 '잴 수 없음'이다. 설명에 이유와 바꿔 볼 방향을 쓴다.
  - 이유: "기록에 남는 변수(기온·바람·비·낮 경기·주말·이동 거리·휴식일·선발 휴식)만 잴 수 있어요. '<개념 범주 이름>' 이야기는 경기 기록에 남지 않아요."
  - 바꿔 볼 방향: 그 범주와 가까운 측정 가능 변수 하나를 제안한다. 예: 음식 → "원정 이동 거리로 바꿔 보면 잴 수 있어요"
- 헤드라인은 판정마다 다르게 쓰되 결정적이어야 한다.

### 테스트 (`src/ai/verdict.test.ts` 또는 `rules.test.ts`)
- 합성 evidence(real·maybe·useless 각 1개 이상)로 다음을 확인한다.
  - 날씨·이동·휴식 개념이 해당 판정으로 이어진다.
  - 설명의 숫자가 evidence 값과 같다(형식은 기존 formatSigned 규칙).
  - 음식·잠 개념은 '잴 수 없음'이고 범주 이름과 제안이 들어간다.
  - evidence null.
- 말뭉치에서 날씨·이동·휴식 범주 입력의 90% 이상이 측정 가능한 판정이다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/ai
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - 설명의 모든 숫자가 evidence에서 오는가(ADR-003)?
   - `src/ai`가 순수 모듈인가?
3. `phases/8-interpreter/index.json`의 step 9를 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- evidence에 없는 숫자를 설명에 쓰지 마라. 이유: 제출물 허위 기재 위험, ADR-003.
- AI 판정 경로(`judgeTmi`의 도구 호출)를 바꾸지 마라. 이유: 이번 step은 AI 없음 경로 개선이다.
- 기존 테스트를 깨뜨리지 마라.
