# Step 1: engine-client

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` ("패턴": 무거운 createGame은 인라인 Web Worker)
- `/docs/ADR.md` (ADR-001, ADR-002)
- 이전 step 산출물: `src/game/scene.ts`, `effects.ts`, `selectors.ts`, `session.ts`, `index.ts`
- 엔진 공개 API: `src/engine/index.ts` (`createGame`, `Evaluation`, `playout`, `PlayoutResult`, `pickHighlights`, `nextCount`, `transitions`, `sampleInPlay`, `sampleTransition`, `applyTransition`, `startNextHalf`, `createRng`, `EV`)
- 스테이지 타입: `src/stage/render/types.ts` (`StageScene`, `PitchPlayback`)
- 이식 원본(읽기만): `reference/tmi-prototype/app.js`의 `pickPitch`, `countBucket`, `headline`, `playOnePitch`, `runPitch`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 모든 파일은 테스트를 먼저 쓴다.

## 작업

### `src/game/engineClient.ts`
- 타입:
  - `GameSpec { lg: EventVector; away: TeamConfig; home: TeamConfig; countTable: number[][] | null; effects: EngineEffect[]; mode: Mode }`
  - `EvaluateRequest { spec: GameSpec; state: GameState; pitcher: LineupSlot; first: boolean }`
  - `PlayoutRequest { spec: GameSpec; start: GameState; scenePitcher: LineupSlot; seed: number; maxPlateAppearances?: number }`
  - `EngineClient { evaluate(req: EvaluateRequest): Promise<Evaluation>; playout(req: PlayoutRequest): Promise<PlayoutResult>; dispose(): void }`
  - 워커 메시지: `EngineRequestMessage = { id: number; kind: 'evaluate' | 'playout'; req: EvaluateRequest | PlayoutRequest }`, `EngineResponseMessage = { id: number; ok: true; result: Evaluation | PlayoutResult } | { id: number; ok: false; error: string }`
- `specKey(spec: GameSpec): string` — 선수 id·rel·불펜·lg·효과·모드가 같으면 같은 키.
- `createLocalEngineClient(opts?: { maxCachedGames?: number; createGameImpl?: typeof createGame }): EngineClient` — 같은 스레드에서 계산. `specKey`로 createGame 결과를 최근 사용 순서로 최대 4개 캐시. playout은 `createRng(seed)`로 결정적.
- `handleEngineMessage(client: EngineClient, msg: EngineRequestMessage): Promise<EngineResponseMessage>` — 예외는 `ok: false`로.
- `createWorkerEngineClient(worker: { postMessage(m: unknown): void; addEventListener(type: 'message', fn: (e: { data: unknown }) => void): void; terminate(): void }): EngineClient` — id로 요청·응답을 짝지어 resolve/reject, dispose 시 terminate하고 대기 중 요청을 reject.

### `src/game/engine.worker.ts`
- 워커 진입점: 지역 클라이언트를 만들고 `self.addEventListener('message', ...)`에서 `handleEngineMessage` 결과를 `postMessage`한다. 테스트(`engine.worker.test.ts`)는 가짜 `self`를 전역에 두고 모듈을 import해 메시지 왕복을 확인한다.

### `src/game/playback.ts`
- `samplePitchCode(ev: Evaluation, balls: number, strikes: number, r: () => number): PitchCode` — `ev.count.rates[balls*3+strikes]` 누적 확률로 뽑는다(count가 없으면 Error).
- `resolvePitch(ev: Evaluation, state: GameState, balls: number, strikes: number, code: PitchCode, r: () => number): { balls: number; strikes: number; ended: null | { event: EventIndex; transition: Transition } }` — `nextCount` 기준. K → `transitions(bases, outs, K)[0]`, BB → `transitions(..., BB)[0]`, X → `sampleInPlay(ev.pa, r)` 후 `sampleTransition`.
- `countBucket(balls: number, strikes: number): number`, `pickPitchRow(rows: readonly PitchRow[], code: PitchCode, balls: number, strikes: number, stance: 'L' | 'R', r: () => number): PitchRow | null` — app.js `pickPitch` 단계 규칙 그대로(같은 결과·같은 손·같은 카운트 유형 → 결과·손 → 결과 → 아무거나).
- `pitchRowsFor(data: AppData, pitcherId: string, throws: 'L' | 'R'): readonly PitchRow[]` — `pitches.byPitcher[pitcherId]`, 없으면 `pitches.pools[throws]`.
- `headline(event: EventIndex, transition: Transition, over: GameOver | null): string` — app.js `headline` 그대로("끝내기 만루 홈런!", "밀어내기 볼넷", "병살타", "2타점 적시타" 등).
- `stageSceneFor(setup: SceneSetup, state: GameState): StageScene` — 공격·수비 팀 색, 홈 여부, 타자 스탠스, 투수 손.
- `playbackFor(args: { setup: SceneSetup; data: AppData; state: GameState; code: PitchCode; balls: number; strikes: number; number: number; ended: { event: EventIndex; transition: Transition } | null; over: GameOver | null; fast: boolean; r: () => number }): PitchPlayback` — 스테이지에 넘길 연출 명령(투구 행, 타구 play, 주자 moves, basesAfter, 결과 배너 문구·톤: 홈런·끝내기·2점 이상이면 big).
- `logEntryFor(args: { setup; index; before: GameState; after: GameState; batterId; pitcherId; headline; wpHomeAfter: number | null; highlight: boolean }): PlayLogEntry`

### `src/game/index.ts`
- 공개 API 추가, `index.test.ts` 갱신.

### 테스트
- 지역 클라이언트: evaluate 결과가 엔진 직접 호출과 같다(1e-12), 같은 spec 두 번이면 createGame 한 번(주입한 createGameImpl 호출 수), 캐시 한도 초과 시 오래된 것 제거, playout이 같은 seed에서 같은 결과.
- 워커 프로토콜: 메모리 안의 가짜 워커 쌍으로 요청·응답 왕복, 오류 전파, dispose 후 대기 요청 reject.
- playback: samplePitchCode 빈도(고정 seed, 3σ), resolvePitch의 삼진·볼넷·인플레이 분기, pickPitchRow 단계 규칙, headline 예시(끝내기 만루 홈런, 밀어내기 볼넷, 병살타, 2타점 적시타), playbackFor 배너 톤.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 확률 계산이 엔진 호출로만 이뤄지는가?
   - `src/game`의 난수는 인자로 받은 `r`/seed만 쓰는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/5-app/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `?worker` import를 `src/game` 안에서 하지 마라. 이유: 테스트 환경에서 깨진다. 워커 생성은 다음 step의 `src/app/platform.ts`가 맡는다.
- 엔진·스테이지·AI 코드를 수정하지 마라. 필요한 API가 없으면 blocked로 보고하라.
- 기존 테스트를 깨뜨리지 마라.
