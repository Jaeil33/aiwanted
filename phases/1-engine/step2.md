# Step 2: engine-game

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` ("핵심 계약"의 확률)
- `/docs/ADR.md` (ADR-002)
- 이전 step 산출물: `src/engine/rng.ts`, `matchup.ts`, `knobs.ts`, `effects.ts`, `transitions.ts`, `count.ts`, `index.ts`
- 계약: `src/types/domain.ts`(`GameState`, `Transition`, `GameOver`, `EngineEffect`, `Mode`), `src/test/fixtures/appData.ts`
- 이식 원본(읽기만): `reference/tmi-prototype/engine.js`의 `halfInning`, `halfSummary`, `createGame`, `gaugesAtCount`, `reference/tmi-prototype/app.js`의 `applyPlay`, `reference/tmi-prototype/engine.test.js`의 반이닝·경기 테스트

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

### `src/engine/halfInning.ts` (테스트 먼저)
- `RMAX = 15`
- `halfInning(dists: readonly ArrayLike<number>[], start: { slot: number; outs: number; bases: Bases }, firstDist?: ArrayLike<number>): Float64Array` — engine.js 그대로. 반환 배열의 `r*9 + s` = 지금부터 r점을 더 내고 다음 반이닝 선두 타순이 s일 확률. `firstDist`는 첫 타석에만 쓰는 분포.
- `halfSummary(hd: ArrayLike<number>): { pScore: number; expRuns: number; total: number }`

### `src/engine/game.ts` (테스트 먼저)
- `MAX_INN = 11`, `DMAX = 20`
- 타입:
  - `LineupSlot { id: string; rel: EventVector }`
  - `TeamConfig { lineup: LineupSlot[]; bullpen: LineupSlot }` (lineup은 타순 0~8의 9명)
  - `GameConfig { lg: EventVector; away: TeamConfig; home: TeamConfig; effects: readonly EngineEffect[]; mode: Mode; countTable: number[][] | null }`
  - `AfterEvent { winHome: number; tie: number; winAway: number; inningScore: number }`
  - `Evaluation { batSide: Side; pa: Float64Array; batterWin: number; pitcherWin: number; inningScore: number; expRuns: number; winHome: number; tie: number; winAway: number; after: AfterEvent[]; count: CountModel | null }`
  - `EvaluateOptions { first?: boolean; detail?: boolean }`
  - `Game = { evaluate(st: GameState, pitcher: LineupSlot, opts?: EvaluateOptions): Evaluation }`
- `createGame(cfg: GameConfig): Game`
  - engine.js `createGame`을 옮기되 효과 배수는 `effectMultipliers(cfg.effects, { batterId, pitcherId, batSide, first }, cfg.mode)`를 쓴다.
  - 현재 타석 분포 `pa`는 `first`(기본 true)로, 같은 반이닝의 나머지 타자와 이후 반이닝은 `first: false`로 계산한다.
  - `detail: false`이면 `after`는 `[]`, `count`는 `null`로 두고 그 계산을 건너뛴다(재생용 빠른 평가). 기본 true.
  - 규칙은 engine.js와 같다: 9회 이후 반이닝이 끝났을 때 점수가 다르면 종료, 11회말이 끝나면 무승부, 9회 이후 홈팀이 앞서면 말 공격 없음, 말 공격 중 홈팀이 앞서는 순간 끝내기. 이후 반이닝은 수비 팀 `bullpen`이 던진다.
- `gaugesAtCount(ev: Evaluation, balls: number, strikes: number): { dist: Float64Array; batterWin: number; inningScore: number; winHome: number; tie: number; winAway: number }` — engine.js 그대로. `ev.count`가 null이면 Error를 던진다.
- `applyTransition(state: GameState, tr: Transition): { state: GameState; over: GameOver | null }` — app.js `applyPlay` 그대로: 공격 팀 점수 += runs, outs·bases 갱신(3아웃이면 bases 0), 공격 팀 타순 +1, 끝내기·경기 종료·무승부·반이닝 종료 판정. 입력 state는 바꾸지 않는다.
- `startNextHalf(state: GameState): GameState` — 3아웃 뒤 다음 반이닝 시작 상태(초 → 같은 이닝 말, 말 → 다음 이닝 초, outs 0, bases 0, 점수·타순 유지).

### `src/engine/index.ts`
- 반이닝·경기 공개 API를 추가로 내보내고 `index.test.ts`를 갱신한다.

### 테스트
- `halfInning`: 픽스처 league로 만든 리그 평균 타선에서 정확 계산(득점 확률, 기대 득점, 다음 선두 타순 분포)이 같은 규칙(`sampleEvent` + `sampleTransition`)의 시드 몬테카를로 20만 반이닝과 3σ 이내. 질량 합은 1(1e-9).
- 픽스처 league 동일 타선의 9이닝 기대 득점(반이닝 기대 득점 × 9)이 3.0~6.5 사이.
- 두 팀 타선·불펜이 완전히 같으면 1회초 0:0 시작 상태에서 `winHome`과 `winAway`가 같다(1e-9). 세 확률 합은 1.
- 혼합 항등식: 여러 상태에서 `Σ pa[e] × after[e].winHome === winHome`(1e-9), tie·inningScore도 같다.
- `gaugesAtCount(ev, 0, 0)`의 batterWin·inningScore·winHome이 ev 값과 같다(1e-9).
- 경기 후반: 9회초 홈팀 5점 리드에서 `winHome > 0.97`. 9회말 동점 2사 만루에서 `after[HR].winHome === 1`. 11회말 동점 2사 주자 없음에서 `after[K].tie === 1`.
- 효과 전파: 장면 타자에게 `contact` +3(effects)을 주면 batterWin, inningScore, 공격 팀 승리확률이 모두 커진다. 만화 모드는 현실보다 더 커진다.
- `detail: false`의 winHome·tie가 `detail: true`와 같다.
- `applyTransition`·`startNextHalf`: 9회말 끝내기 판정(`walkoff: true`), 9회초 3아웃에 홈팀 리드면 경기 종료, 11회말 3아웃 동점이면 무승부, 반이닝 종료 후 `startNextHalf`의 이닝·초말.

createGame은 한 번에 수백 ms가 걸릴 수 있다. 같은 설정은 `describe` 안에서 한 번만 만들어 재사용하라.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/1-engine/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 경기 확률을 몬테카를로로 계산하지 마라. 이유: ADR-002, 작은 TMI 효과가 잡음에 묻힌다.
- `RMAX`, `DMAX`, `MAX_INN` 값과 경기 규칙을 바꾸지 마라. 이유: KBO 정규시즌 규칙과 프로토타입 검증 결과를 따른다.
- 재생(playout)·실측 변수 코드를 만들지 마라. 이유: 다음 step의 범위다.
- `src/types`, `src/domain`을 수정하지 마라. 이유: 공용 계약이다.
- 기존 테스트를 깨뜨리지 마라.
