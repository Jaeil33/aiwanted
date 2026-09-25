# Step 8: carry-on

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ADR.md`(**ADR-033**, ADR-013, ADR-016, ADR-026)
- `src/game/session.ts`, `src/game/effects.ts`, `src/engine/effects.ts`, `src/app/GameProvider.tsx`
- `src/app/usePlayback.ts`, `src/app/useSceneEvaluations.ts`, `src/app/screens/PlayScreen.tsx`·`ResultScreen.tsx`

테스트를 먼저 쓴다.

## 배경

ADR-016은 "한 타석만 되돌려본다"였다. ADR-033이 그것을 뒤집었다: 개입한 타석이 끝나면 사용자가
**이어서 직접 치거나 · 시뮬레이션으로 끝까지 보거나 · 여기서 멈출 수 있다**(Q8 c).

2026-09-26 확인: 시뮬레이션(경기 끝까지)과 직접 이어 치기는 이미 돈다(`usePlayback`). 없는 것은 셋이다.

## 작업

### 1. 타석마다 TMI 다시 걸기 (Q13 b)
- `canEditTmi`: `paIndex === 0` 조건을 뺀다. 타석 첫 공 전이면 언제든 걸고 뗄 수 있다.
- 모드는 판 도중에 바꾸지 않는다: `canEditMode = canEditTmi && log.length === 0`. 이미 친 타석과 기준이 달라진다.
- 새로 걸지 않으면 앞 타석 TMI가 그대로 남는다. 대상이 이번 타자와 무관하면 `appliesTo`가 걸러 효과가 잠든다.

### 2. TMI를 건 타석에 묶기
- `TmiEntry`에 `paIndex?`·`context?`(건 순간의 타자·투수·진영).
- `compileSessionEffects(entries, setup, evidence, { paIndex? })`: 대상은 `entry.context`로 확정하고,
  `scope: 'pa'` 효과는 **그것을 건 타석에만** 남긴다. `scope: 'game'`은 판이 끝날 때까지 남는다.
- `GameProvider.submitTmi`: `currentSituation(setup, live.state)`로 그 타석의 프롬프트 맥락을 만들어 AI에 넘기고,
  `paIndex`·`context`를 entry에 적는다. 3번 타석에 "타자가…"라고 걸면 3번 타자에게 걸린다.
- 화면 확률(`useEvaluationPair`)·칩 기여도(`useTmiContributions`)도 지금 타석 기준으로 셈한다.
  엔진의 `first`는 "지금 타석"이라는 뜻으로만 쓴다(효과는 이미 걸러져 있다).

### 3. 여기까지 보기
- `SessionState.final`에 `stopped: boolean`, 액션 `stopHere`, 선택자 `canStopHere`(한 타석이라도 쳤고 첫 공 전).
- `PlayScreen`: 타석 사이에 이어가기 줄(마지막 타석 한 줄 + "처음부터" + "여기까지"). 도크의 "경기 끝까지"가 시뮬 분기다.
- `ResultScreen`: 멈춘 판은 이긴 팀을 적지 않는다. 머리말 "9회말까지", 눈썹 "여기까지 · 다시 치른 결과".

## Acceptance Criteria

- `npm run test`·`npx tsc -b`·`npm run lint`·`npm run build` 통과.
- 타석이 끝나면 이어가기 줄이 뜨고, TMI는 다시 걸 수 있고, 모드는 잠긴다.
- "여기까지"를 누르면 `final.stopped`가 true이고 결과 화면이 승패를 선언하지 않는다.

## 금지사항

- 승률 계산의 불펜 가정을 바꾸지 마라(step 7과 같은 이유).
- 한 판 TMI 상한(3개)을 늘리지 마라(PRD).
- 멈춘 판을 "경기 종료"로 적지 마라.
