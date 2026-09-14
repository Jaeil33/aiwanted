# Step 0: game-core

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` ("핵심 계약", "상태 관리")
- `/docs/PRD.md` (한 판의 흐름, 핵심 기능 2~6)
- `/docs/ADR.md` (ADR-002, ADR-003, ADR-009)
- 계약: `src/types/domain.ts`, `src/types/data.ts`, `src/domain/*.ts`, `src/test/fixtures/appData.ts`
- 엔진 공개 API: `src/engine/index.ts` (특히 `createGame`, `Evaluation`, `LineupSlot`, `TeamConfig`, `compileEffects`, `expectedCounts`)

`src/game`은 순수 모듈이다(CLAUDE.md CRITICAL). DOM·타이머·`Math.random`·네트워크를 쓰지 마라. 모든 파일은 테스트를 먼저 쓴다.

## 작업

### `src/game/scene.ts`
- `export interface SceneSetup { scene: SceneRecord; lg: EventVector; countTable: number[][]; away: TeamConfig; home: TeamConfig; scenePitcher: LineupSlot; batSide: Side; fieldSide: Side; sceneContext: SceneContext; promptContext: PromptContext; names: Record<string, string>; teamColors: { away: string; home: string } }`
- `buildSceneSetup(data: AppData, sceneId: string): SceneSetup` — 모르는 id면 Error.
  - lineup은 `scene.lineups`의 id를 `core.players[id].rel`로(없으면 rel 1 벡터), bullpen은 `core.bullpens[팀코드]`(없으면 `{ id: '<팀>-pen', rel: 1 벡터 }`).
  - `batSide` = `scene.state.half === 0 ? 'away' : 'home'`. `sceneContext = { batterId: scene.batter, pitcherId: scene.pitcher, batSide }`.
  - `promptContext`: 날짜·구장·팀 이름·점수, `situation = situationText(scene.state)`, 타자(이름·팀 이름·bats 없으면 R)·투수(이름·팀 이름·throws 없으면 R), 공격·수비 팀 이름, 두 팀 라인업 이름, `weather = scene.context`.
  - `names`: 모든 선수 id → 이름, 불펜 id → "<팀 이름> 불펜".
  - `teamColors`: `TEAMS[code].color`.
- `batterStanceFor(bats: 'L' | 'R' | 'S' | undefined, throws: 'L' | 'R'): 'L' | 'R'` — 스위치 타자는 투수와 반대손, 없으면 R.
- `pitcherFor(setup: SceneSetup, state: GameState): LineupSlot` — 장면과 같은 이닝·초말이면 장면 투수, 아니면 수비 팀 불펜.
- `batterFor(setup: SceneSetup, state: GameState): LineupSlot & { name: string; stance: 'L' | 'R' }`

### `src/game/effects.ts`
- `measuredAvailable(evidence: EvidenceData | null): boolean`
- `compileSessionEffects(entries: readonly TmiEntry[], setup: SceneSetup, evidence: EvidenceData | null): EngineEffect[]` — 거부된 해석은 건너뛰고, 각 entry를 `compileEffects(parts, setup.sceneContext, { sourceId: entry.id, evidence, lg: setup.lg })`로 바꿔 이어 붙인다.
- `effectsKey(effects: readonly EngineEffect[], mode: Mode): string` — 같은 효과·모드면 같은 문자열(캐시 키).

### `src/game/selectors.ts`
- `export interface GaugeLike { batterWin: number; inningScore: number; expRuns?: number; winHome: number; tie: number; winAway: number }`
- `battingWin(g: GaugeLike, batSide: Side): number`
- `export interface TierView { id: 'pa' | 'inning' | 'game'; title: string; leftLabel: string; leftValue: number; rightLabel: string; rightValue: number; extra: string | null; delta: number; deltaText: string }`
- `selectTiers(setup: SceneSetup, state: GameState, base: GaugeLike, tmi: GaugeLike): TierView[]` — 세 줄:
  - 타석: title "타석 승부", left "`<타자 이름>` 출루"(batterWin), right "`<투수 이름>` 아웃"(1 − batterWin)
  - 이닝: title "이닝 승부", left "`<공격 팀>` 득점"(inningScore), right "`<수비 팀>` 무실점", extra "기대 득점 1.23점"(expRuns가 있을 때)
  - 경기: title "경기 승부", left "`<공격 팀>` 승리"(battingWin), right "`<수비 팀>` 승리", extra "무승부 3.5%"
  - `delta = tmi.left − base.left`, `deltaText = formatDeltaPp(delta)`. 타자·투수는 `batterFor`·`pitcherFor(state)` 기준.
- `butterflyPp(base: GaugeLike, tmi: GaugeLike, batSide: Side): number` — 공격 팀 승리확률 차이(%p 단위 숫자, 예 0.6).
- `entryChips(entry: TmiEntry): Array<{ label: string; tone: 'measured' | 'plausible' | 'fun' | 'refused' }>` — 부분마다 "`<대상>` `<손잡이 라벨>` ▲▲"(세기 부호·크기만큼 ▲ 또는 ▼), measured는 "`<변수 라벨>` 33°C" + tone measured, 거부면 한 개 refused.

### `src/game/share.ts`
- `export interface SharePayload { sceneId: string; texts: string[]; mode: Mode }`
- `encodeShare(p: SharePayload): string` — UTF-8 JSON의 base64url.
- `decodeShare(s: string): SharePayload | null` — 형식이 틀리면 null. texts는 최대 3개·각 80자, mode는 real|toon.

### `src/game/session.ts`
- 타입:
  - `Screen = 'home' | 'play' | 'result' | 'evidence' | 'about'`
  - `PlayLogEntry { index: number; inning: number; half: Half; batterName: string; pitcherName: string; headline: string; score: { away: number; home: number }; wpHomeAfter: number | null; highlight: boolean }`
  - `LiveState { state: GameState; balls: number; strikes: number; paIndex: number; pitches: PitchSample[] }`
  - `SessionState { screen; sceneId: string | null; mode: Mode; seed: number; tmis: TmiEntry[]; interpreting: boolean; notice: string; providerDisabled: boolean; verdicts: Record<string, VerdictResult>; judgingId: string | null; live: LiveState | null; log: PlayLogEntry[]; status: 'ready' | 'animating' | 'finished'; final: { winner: Side | 'tie'; walkoff: boolean; state: GameState } | null }`
  - `SessionAction` 판별 유니온: `navigate{screen}`, `openScene{sceneId, startState, seed, tmis?, mode?}`, `setMode{mode}`, `interpretStart`, `interpretDone{entry, note, disableProvider}`, `interpretFailed{note}`, `removeTmi{id}`, `judgeStart{id}`, `judgeDone{id, verdict, note, disableProvider}`, `animationStart`, `pitchApplied{code, balls, strikes}`, `paFinished{entry, state}`, `gameFinished{winner, walkoff, state}`, `resetPlay{startState, seed}`
- `initialSession: SessionState`(screen home, mode real, seed 1, 나머지 비움)
- `canEditTmi(s: SessionState): boolean` — live가 있고 `paIndex === 0`, 이번 타석 투구 0개, status ready.
- `sessionReducer(s: SessionState, a: SessionAction): SessionState`
  - `navigate`: play·result인데 sceneId가 없으면 home으로.
  - `openScene`: 장면을 열고 live를 시작 상태로, log·final·verdicts·notice 초기화, tmis·mode는 주면 그 값.
  - `setMode`·`interpretStart`·`removeTmi`는 `canEditTmi`일 때만. `interpretStart`는 tmis가 3개면 무시.
  - `interpretDone`: 3개 미만일 때 추가, interpreting false, notice, `providerDisabled ||= disableProvider`.
  - `judgeStart`/`judgeDone`: 판정 결과 저장, `providerDisabled ||= disableProvider`.
  - `pitchApplied`: 던지기 전 카운트로 PitchSample을 쌓고 카운트 갱신.
  - `paFinished`: log에 추가, live.state 갱신, paIndex+1, 카운트·투구 초기화, status ready.
  - `gameFinished`: final 저장, status finished, screen result.
  - `resetPlay`: TMI는 두고 live·log·final을 시작 상태로, screen play.
  - 그 외 조건에 맞지 않는 액션은 상태를 그대로 돌려준다(같은 객체).

### `src/game/index.ts`
- 공개 API 재내보내기와 `index.test.ts`.

### 테스트 (픽스처 AppData 사용)
- scene: 픽스처 장면의 lineup·불펜·batSide·promptContext(상황 "9회말 2사 만루")·names, 없는 id Error, 스위치 타자 규칙, pitcherFor 반이닝 전환.
- effects: 거부 entry 제외, knob + measured 컴파일, effectsKey 안정성(같은 입력 같은 키, 모드가 다르면 다른 키).
- selectors: 세 줄 라벨·값·delta 문구, butterflyPp 부호, entryChips 표시.
- share: 한글 왕복, 잘못된 입력 null, 81자·4개 거절.
- session: 한 판 흐름 액션 시퀀스(열기 → TMI 추가 → 투구 → 타석 끝 → 경기 끝), 편집 잠금, 3개 제한, 무시되는 액션은 같은 객체.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/game`에 DOM·타이머·난수·네트워크가 없는가?
   - 확률 숫자를 엔진 밖에서 만들지 않는가? (selectors는 엔진 결과를 옮기고 뺄셈만)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/5-app/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- React·컴포넌트를 만들지 마라. 이유: 이후 step의 범위다.
- 엔진·AI·스테이지 코드를 수정하지 마라. 필요한 API가 없으면 blocked로 보고하라. 이유: 검증이 끝난 층이다.
- 브라우저 저장소를 쓰지 마라. 이유: ARCHITECTURE "상태 관리".
- 기존 테스트를 깨뜨리지 마라.
