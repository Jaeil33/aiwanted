# Step 4: play-screen

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/PRD.md` (한 판의 흐름, 핵심 기능 2~5, 성공 기준)
- `/docs/UI_GUIDE.md` (레이아웃: 휴대폰 순서와 1024px 2단)
- `/docs/ADR.md` (ADR-002, ADR-009)
- 이전 step 산출물: `src/app/GameProvider.tsx`, `src/app/platform.ts`, `src/app/screens/PlayScreen.tsx`(자리 표시), `src/components/*`(Scorebug, ProbabilityTiers, ModeToggle, TmiComposer, InterpretationCard, PlayControls, PlayLog, WpChart)
- `src/game/*` (특히 `engineClient.ts`, `playback.ts`, `selectors.ts`, `session.ts`, `effects.ts`, `scene.ts`)
- `src/stage/index.ts` (`BallparkStage`, `StageController`)
- `src/engine/index.ts` (`gaugesAtCount`, `applyTransition`, `startNextHalf`, `pickHighlights`, `createRng`)
- 참고(읽기만): `reference/tmi-prototype/app.js`의 재생 흐름(`playOnePitch`, `runPitch`, `finishPA`, `autoPlay`, `pushChart`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 모든 파일은 테스트를 먼저 쓴다.

## 작업

### `src/app/useSceneEvaluations.ts`
- `useSceneEvaluations(): { base: Evaluation | null; tmi: Evaluation | null; baseGauge: GaugeLike | null; tmiGauge: GaugeLike | null; pending: boolean }`
  - `useGame()`의 setup·session·engine·data로 요청을 만든다: base = 효과 없음·현실 모드, tmi = `compileSessionEffects(session.tmis)`·`session.mode`. 둘 다 `live.state`와 `pitcherFor(setup, live.state)`, `first: live.paIndex === 0`.
  - 요청 키(specKey + 상태 + first)가 바뀌면 다시 계산, 늦게 도착한 옛 결과는 버린다.
  - 게이지는 현재 카운트의 `gaugesAtCount`(count가 있을 때), 없으면 evaluation 값.

### `src/app/usePlayback.ts`
- `usePlayback(stageRef: RefObject<StageController | null>, opts?: { sleep?: (ms: number) => Promise<void> }): { throwPitch(): Promise<void>; finishPa(): Promise<void>; finishGame(): Promise<void>; busy: boolean }`
  - 난수: `createRng(session.seed * 100003 + 누적 투구 수)`처럼 seed에서 결정적으로.
  - `throwPitch`: tmi evaluation(count 필요)으로 `samplePitchCode` → `resolvePitch` → 끝났으면 `applyTransition`·`headline` → `playbackFor`로 연출 명령 → `animationStart` → `await stage.playPitch` → `pitchApplied` → 타석이 끝났으면 `paFinished`(반이닝 종료면 `startNextHalf` 상태, log의 `wpHomeAfter`는 다음 상태 tmi evaluation의 winHome 또는 경기 종료 값) → 경기 종료면 `gameFinished`. stage가 없으면 연출 없이 진행한다.
  - 전광판 `setBoard`: 1줄 "타자 이름 vs 투수 이름", 2줄 "직구 148km"(투구 행의 구종·구속, 없으면 빈 줄).
  - `finishPa`: 타석이 끝날 때까지 `throwPitch` 반복.
  - `finishGame`: 타석 중간이면 먼저 `finishPa`. 그다음 `engine.playout({ spec, start: live.state, scenePitcher, seed })` — **장면 첫 타석이 이미 끝났으면 `scope: 'pa'` 효과를 spec에서 뺀다**. `pickHighlights`로 고른 타석은 그 타석의 투구를 차례로 연출(마지막 공만 보통 속도, 앞 공은 `fast`), 나머지 타석은 연출 없이 log만 추가하고 `sleep(150)`. 끝나면 `gameFinished`.
  - 진행 중 다시 부르면 무시한다(busy).

### `src/app/screens/PlayScreen.tsx` (자리 표시 교체)
- 구성(휴대폰 순서): 장면 머리(제목, "8월 25일 · 사직", "실제 결과는 경기가 끝나면 공개돼요") → `BallparkStage`(scene은 `stageSceneFor`, bases는 live.state.bases) → `Scorebug` → `ProbabilityTiers`(base/tmi 게이지 → `selectTiers`) → `ModeToggle` → `TmiComposer`(예시 4개: `josa`로 "`<투수>`이/가 경기 전 짜장면 곱빼기를 먹었다", "`<타자>`이/가 새 배트를 들고 나왔다", "오늘 기온 35도, 폭염", "원정팀이 버스로 5시간 이동했다") → `InterpretationCard` 목록 → `WpChart`(시작 tmi 승리확률 + log의 wpHomeAfter를 공격 팀 기준으로, baseline은 시작 base 값) → `PlayLog` → `PlayControls`(하단 고정).
- 1024px 이상: 좌 1.5fr(머리·경기장·스코어버그·조작·기록·차트) / 우 1fr(확률판·모드·TMI·해석 카드).
- 편집 잠금은 `canEditTmi(session)`. 판정 버튼은 거부되지 않은 entry에만.
- 경기가 끝나면(`status finished`) result 라우트로 이동.

### 테스트
- `useSceneEvaluations`: 픽스처 + 지역 엔진으로 base·tmi 계산, 만화 모드에서 차이가 더 큼, 옛 결과 무시.
- `usePlayback`: 가짜 StageController(호출 기록, 즉시 resolve)와 고정 seed로 `throwPitch`가 카운트를 바꾸고 playPitch를 부름, `finishPa`가 log 1개를 추가, `finishGame`이 `gameFinished`까지 가고 result로 이동할 상태가 됨, 이미 끝난 첫 타석 뒤에는 pa 범위 효과가 빠짐.
- `PlayScreen`: 픽스처 장면을 열고 "오늘 폭염" TMI를 걸면 해석 카드와 변화 칩이 보임, "한 구 던지기" 클릭 후 스코어버그 카운트 또는 log 변화, 편집 잠금 안내.
- createGame이 느리므로 이 파일들의 테스트 제한 시간을 30초로 늘린다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 모든 확률이 엔진 클라이언트 결과에서 오는가?
   - 재생 난수가 session seed에서 결정적으로 나오는가?
   - UI_GUIDE 휴대폰 순서·2단 레이아웃·하단 고정 조작 바를 따르는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/5-app/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 결과 화면·공유·판정소를 만들지 마라. 이유: 다음 step의 범위다.
- `Math.random`으로 재생 결과를 뽑지 마라. 이유: 같은 seed는 같은 경기여야 한다(ADR-002).
- 장면 도중 실제 결과를 보여주지 마라. 이유: PRD.
- 엔진·AI·스테이지·game 모듈의 공개 API를 바꾸지 마라. 필요하면 blocked로 보고하라.
- 기존 테스트를 깨뜨리지 마라.
