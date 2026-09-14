# Step 0: engine-pa

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` ("핵심 계약"의 효과·확률)
- `/docs/ADR.md` (ADR-002, ADR-009)
- 0-setup 산출물: `src/types/domain.ts`, `src/domain/knobs.ts`, `src/domain/events.ts`, `src/test/fixtures/appData.ts`, `vitest.config.ts`
- 이식 원본(읽기만): `reference/tmi-prototype/engine.js`의 `rng`, `matchup`, `batterWin`, `KNOBS`, `targets`, `effectMultipliers`, `buildTransitions`, `transitions`, `sampleEvent`, `sampleInPlay`, `sampleTransition`과 `reference/tmi-prototype/engine.test.js`

`src/engine`은 순수 모듈이다(CLAUDE.md CRITICAL). DOM, `window`, `Math.random`, `Date`를 쓰지 마라. 모든 파일은 같은 폴더의 `<이름>.test.ts`를 먼저 쓴다.

## 작업

프로토타입 `engine.js`의 타석 계층을 TypeScript로 옮기고, 새 효과 계약(`EngineEffect`)과 만화 모드를 더한다.

### `src/engine/rng.ts`
- `createRng(seed: number): () => number` — engine.js `rng`(mulberry32) 그대로. 같은 seed는 같은 수열을 낸다.

### `src/engine/matchup.ts`
- `matchup(bRel: EventVector, pRel: EventVector, lg: EventVector, mult?: ArrayLike<number>): Float64Array` — `w[i] = bRel[i] × pRel[i] × lg[i] × (mult?.[i] ?? 1)`을 합 1로 정규화한다.
- `batterWin(dist: ArrayLike<number>): number` — `1 − dist[K] − dist[OUT]`.

### `src/engine/knobs.ts`
- `STEP = 0.06`
- `KNOB_WEIGHTS: Record<KnobId, EventVector>` — engine.js `KNOBS`의 `w` 값 그대로(14개). 대상 종류(`who`)와 라벨은 여기 두지 않고 `src/domain/knobs.ts`의 `KNOB_META`를 쓴다.

### `src/engine/effects.ts`
- 상수 `REAL_LOG_CAP = 0.45`, `TOON_FACTOR = 6`, `TOON_LOG_CAP = 1.6`.
- `export interface PaContext { batterId: string; pitcherId: string; batSide: Side; first: boolean }`
- `fieldSideOf(batSide: Side): Side`
- `compileKnobPart(part: KnobPart, ctx: SceneContext, sourceId: string): EngineEffect[]`
  - 알 수 없는 knob, `SUBJECTS_FOR[KNOB_META[knob].who]`에 없는 subject, 유한수가 아닌 strength는 `[]`.
  - strength는 반올림 후 −3..3으로 자르고, 0이면 `[]`.
  - `logOdds[i] = STEP × strength × KNOB_WEIGHTS[knob][i]`, `scope = part.scope`, `sourceId`는 인자 그대로.
  - applies 규칙:
    - who `batter`: batter → `{ on: 'batter', id: ctx.batterId }`, battingTeam → `{ on: 'batting', side: ctx.batSide }`, everyone → `{ on: 'all' }`
    - who `pitcher`·`field`: pitcher → `{ on: 'pitcher', id: ctx.pitcherId }`, fieldingTeam → `{ on: 'fielding', side: fieldSideOf(ctx.batSide) }`, everyone → `{ on: 'all' }`
    - who `env`: 항상 `{ on: 'all' }`
    - who `team`(mood): 대상 팀 T(battingTeam이면 `ctx.batSide`, fieldingTeam이면 반대편)에 효과 2개를 만든다 — `{ on: 'batting', side: T }`에 `+logOdds`, `{ on: 'fielding', side: T }`에 `−logOdds`. 그 팀이 공격할 때 유리하고 수비할 때 상대 타자에게 불리하다(engine.js team 부호 규칙과 같다).
- `appliesTo(applies: EffectApplies, pa: PaContext): boolean`
- `effectMultipliers(effects: readonly EngineEffect[], pa: PaContext, mode: Mode): Float64Array` — 적용되는 효과의 logOdds를 더하고(`scope: 'pa'`는 `pa.first`일 때만), toon이면 `TOON_FACTOR`를 곱하고, real은 ±0.45·toon은 ±1.6으로 자른 뒤 `exp`. 효과가 없으면 전부 1.

### `src/engine/transitions.ts`
- `transitions(bases: Bases, outs: number, e: EventIndex): readonly Transition[]` — engine.js `buildTransitions`를 그대로 옮긴 사전 계산 표(outs 0~2 × bases 0~7 × 사건 7).
- `sampleEvent(dist: ArrayLike<number>, r: () => number): EventIndex`, `sampleInPlay(pa: ArrayLike<number>, r: () => number): EventIndex`, `sampleTransition(bases: Bases, outs: number, e: EventIndex, r: () => number): Transition` — engine.js 그대로.

### `src/engine/index.ts`
- 위 공개 함수·상수·타입을 다시 내보낸다. `index.test.ts`는 공개 API 이름이 모두 있는지 확인한다.

### 테스트 (engine.test.js에서 해당 부분을 옮기고 보강)
- matchup: rel이 모두 1이고 배수가 없으면 리그 분포와 같다(1e-12). 합은 1.
- compileKnobPart: 타자 손잡이는 그 타자에게만, 공격팀 손잡이는 그 진영이 공격할 때만, env는 모든 타석, mood는 공격 때 +·수비 때 −. 잘못된 subject·knob·strength는 `[]`. strength 5는 3으로 잘린다.
- effectMultipliers: `scope: 'pa'`는 `first`일 때만 적용, 현실 상한 `exp(0.45)`, 만화는 로그 오즈 6배와 상한 `exp(1.6)`, 효과가 없으면 1.
- transitions: 모든 (outs, bases, e)에서 확률 합 1(1e-12). 3아웃이 아닌 모든 분기에서 주자 보존: `이전 주자 수 + 1 = 이후 주자 수 + runs + (이후 outs − 이전 outs)`. `moves`를 동시에 적용(출발 루에서 모두 빼고 도착 루 1~3에 놓고, moves에 없는 주자는 제자리)한 결과가 `bases` 비트와 같다.
- 샘플러: 고정 seed로 20만 번 뽑은 빈도가 분포와 3σ 이내.

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
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (`src/engine`에 DOM·`Math.random` 없음)
3. 결과에 따라 `phases/1-engine/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 주루·병살 확률 상수, 손잡이 가중치, STEP 값을 바꾸지 마라. 이유: ADR-002, 프로토타입 결과와 맞춰야 한다.
- `src/types`, `src/domain`의 계약을 수정하지 마라. 이유: 다른 phase가 동시에 쓰고 있다. 계약이 부족하면 blocked로 보고하라.
- 볼카운트·반이닝·경기 계산을 이 step에서 만들지 마라. 이유: 다음 step의 범위다.
- 기존 테스트를 깨뜨리지 마라.
