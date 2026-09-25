# Step 7: pa-playback

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ARCHITECTURE.md`(확률), `/docs/ADR.md`(ADR-002, ADR-014, ADR-016, ADR-033, ADR-035)
- `src/engine/playout.ts`, `src/game/playback.ts`, `src/game/situation.ts`, `src/game/engineClient.ts`, `src/app/usePlayback.ts`
- `phases/13-situation/step3.md`(이 step이 흡수한 원안)

테스트를 먼저 쓴다.

## 원안에서 달라지는 것

원안의 `usePaPlayback`·`PitchAnimator`는 만들지 않는다. `src/app/usePlayback.ts`(한 구·타석 끝까지·경기
끝까지)와 `PitchTracker`가 이미 그 일을 하고, 새 화면도 같은 플레이 화면을 쓴다. 남은 진짜 구멍 둘만 메운다.

1. **투수가 팀 불펜 평균이다.** 상황 반이닝 뒤로는 `teamConfig.bullpen`(구원 합성 선수)이 던진다.
   "9회 마무리가 올라오는" 승부처를 되돌려보는데 마무리가 나오지 않는다(Q16 b: 실제 투수 순서).
2. **투구 표본이 시즌 단위다.** `pitches.byPitcher`는 step 10에서 비운다(ADR-035). 그 경기에서 실제로
   던진 공이 중계에 들어 있으니 그것을 먼저 쓴다.

## 작업

### `src/types/domain.ts`
`PitcherPlanEntry { inning, half, outs, pitcher }`. `outs`는 그 투수가 그 반이닝에서 처음 던진 타석의 아웃 수다.

### `src/engine/relief.ts` (새 파일, 순수)
`pitcherAt(plan, state)`: 이닝·초말로 찾고, 그 반이닝 안에서는 아웃 수로 가른다(2사에 올라온 구원은
되돌려본 경기에서도 2사에 올라온다). 그 반이닝 기록이 우리보다 늦은 아웃에서 시작하면 앞 투수가 아직 던지고 있다.
실제 경기보다 뒤 이닝이면 그 편 마지막 투수가 계속 던진다. 모르면 null.

### `src/game/pitchers.ts` (새 파일, 순수)
- `pitcherPlanOf(game: LiveGame)`: 투수가 바뀐 지점만 시간순으로.
- `gameRowsOf(game: LiveGame)`: 투수 id → 그 경기에서 던진 투구 행.

### `src/game/situation.ts`
- `SituationExtra`에 `pitcherPlan`·`gameRows`, `SituationSetup`에 `pitcherPlan`·`pitcherSlots`·`gameRows`.
- `pitcherFor`: 상황 반이닝은 상황 투수, 그 뒤는 `pitcherAt`, 모르면 팀 불펜. `pitcherSlots`는 조립할 때 한 번만 찾는다(`pitcherFor`는 core를 받지 않는다).

### `src/game/playback.ts`
`pitchRowsFor(data, setup, pitcherId, throws)`: 그 경기 표본이 `MIN_GAME_ROWS`(12) 이상이면 그것,
모자라면 시즌 표본과 합치고, 그래도 모자라면 리그 표본을 뒤에 붙인다.

### `src/engine/playout.ts`·`src/game/engineClient.ts`·`src/app/usePlayback.ts`
`PlayoutInput.relief?: { plan, slots }`(**함수가 아니라 값**이다: 요청이 워커로 구조화 복제된다).
카운트 모델 키를 `scene|bullpen`에서 투수 id로 바꾼다.

## 확률 모델은 그대로 둔다

`game.evaluate`가 셈하는 "이후 반이닝"은 여전히 팀 불펜 평균이다(ARCHITECTURE 확률).
실제 투수는 **지금 치르는 타석의 상대로만** 쓴다. 승률 DP까지 투수 차례를 넣으면 신뢰도 보정·근거 표가
함께 흔들린다. 바꾸려면 따로 ADR을 세운다.

## Acceptance Criteria

- `npm run test`·`npx tsc -b`·`npm run lint`·`npm run build`·`npm run check:relay` 통과.
- `pitcherAt`이 실제 경기의 모든 타석에서 그 타석의 진짜 투수를 돌려준다(픽스처 왕복 테스트).

## 금지사항

- 승률 계산(`game.evaluate`)의 불펜 가정을 바꾸지 마라(별도 ADR).
- `relief`를 함수로 넘기지 마라(워커로 복제되지 않는다).
- 확률 숫자를 표본으로 만들지 마라(ADR-002).
