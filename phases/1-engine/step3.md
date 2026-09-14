# Step 3: engine-playout

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` ("핵심 계약"의 효과·확률)
- `/docs/ADR.md` (ADR-002, ADR-004, ADR-009)
- `/docs/PRD.md` (핵심 기능 5 다시 치르기, 6 결과)
- 이전 step 산출물: `src/engine/rng.ts`, `matchup.ts`, `knobs.ts`, `effects.ts`, `transitions.ts`, `count.ts`, `halfInning.ts`, `game.ts`, `index.ts`
- 계약: `src/types/domain.ts`(`MeasuredPart`, `EffectPart`, `EngineEffect`, `SceneContext`, `GameOver`), `src/types/data.ts`(`EvidenceData`, `EvidenceItem`), `src/domain/measured.ts`(`MEASURED`, `measuredById`, `transformValue`), `src/test/fixtures/appData.ts`
- 참고(읽기만): `reference/tmi-prototype/app.js`의 `playOnePitch`, `finishPA`, `autoPlay` 흐름

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

### `src/engine/measured.ts` (테스트 먼저)
- `OFFENSE_W: EventVector` = `KNOB_WEIGHTS.mood` (공격 전반 벡터).
- `runsElasticity(lg: EventVector): number` — 리그 평균 타선(9명 rel 모두 1, 투수 rel 1)의 모든 타석에 배수 `exp(k × OFFENSE_W)`를 줬을 때 `d ln(무사 주자 없음 반이닝 기대 득점) / dk`를 k=0에서 중앙 차분(h=0.01)으로 구한다. lg 값 문자열을 키로 결과를 캐시한다.
- `measuredRunsRatio(def: MeasuredDef, item: EvidenceItem, value: number): number` = `exp(item.beta × transformValue(def, value))`
- `compileMeasuredPart(part: MeasuredPart, ctx: SceneContext, evidence: EvidenceData | null, lg: EventVector, sourceId: string): EngineEffect[]`
  - def가 `applicable: false`이거나, evidence가 null이거나 해당 item이 없거나, value가 유한수가 아니면 `[]`.
  - `scale = ln(ratio) / runsElasticity(lg)`, `logOdds = scale × OFFENSE_W`, `scope: 'game'`.
  - applies:
    - who `env` → `{ on: 'all' }`
    - who `team`(그 팀의 득점에 대한 효과): subject batter·battingTeam → `{ on: 'batting', side: ctx.batSide }`, pitcher·fieldingTeam → `{ on: 'batting', side: 반대편 }`, everyone → `{ on: 'all' }`
    - who `opponentStarter`(그 선발을 상대하는 팀의 득점에 대한 효과): subject pitcher·fieldingTeam → `{ on: 'fielding', side: 반대편 }`, batter·battingTeam → `{ on: 'fielding', side: ctx.batSide }`, everyone → `[]`
- `compileEffects(parts: readonly EffectPart[], ctx: SceneContext, opts: { sourceId: string; evidence: EvidenceData | null; lg: EventVector }): EngineEffect[]` — knob은 `compileKnobPart`, measured는 `compileMeasuredPart`로 바꿔 순서대로 이어 붙인다.

### `src/engine/playout.ts` (테스트 먼저)
- 타입:
  - `PlayoutInput { game: Game; start: GameState; scenePitcher: LineupSlot; away: TeamConfig; home: TeamConfig; lg: EventVector; effects: readonly EngineEffect[]; mode: Mode; countTable: number[][] | null; rng: () => number; trackWinProbability?: boolean; maxPlateAppearances?: number }` (기본값 true, 300)
  - `PlayoutPA { index: number; before: GameState; after: GameState; batSide: Side; batterId: string; pitcherId: string; event: EventIndex; transition: Transition; pitches: PitchSample[]; wpHomeBefore: number | null; wpHomeAfter: number | null; tieAfter: number | null; over: GameOver | null }`
  - `PlayoutResult { plateAppearances: PlayoutPA[]; final: GameState; winner: Side | 'tie'; walkoff: boolean; truncated: boolean }`
- `playout(input: PlayoutInput): PlayoutResult`
  - 투수: `start`와 같은 이닝·같은 초말이면 `scenePitcher`, 그 뒤로는 수비 팀 `bullpen`.
  - 타석 분포: `matchup(batter.rel, pitcher.rel, lg, effectMultipliers(effects, { batterId, pitcherId, batSide, first: index === 0 }, mode))`.
  - `countTable`이 있으면 `simulatePA(calibrateCount(pa, countTable), pa, rng)`로 투구까지 뽑고, 없으면 `sampleEvent(pa, rng)`로 사건만 뽑고 `pitches: []`.
  - `sampleTransition` → `applyTransition`. `over.kind === 'half'`면 다음 타석 전에 `startNextHalf`, `over.kind === 'game'`이면 끝.
  - `trackWinProbability`일 때: `wpHomeBefore = game.evaluate(before, pitcher, { first: index === 0, detail: false }).winHome`. `wpHomeAfter`는 경기 종료면 홈 승 1·원정 승 0·무승부 0(`tieAfter` 1), 반이닝 종료면 다음 반이닝 시작 상태를 그 반이닝 투수로, 아니면 같은 투수로 `first: false` 평가한다. 다음 타석의 `wpHomeBefore`는 직전 `wpHomeAfter`를 재사용한다. false면 셋 다 null.
  - `maxPlateAppearances`를 넘으면 `truncated: true`로 멈춘다.
- `pickHighlights(result: PlayoutResult, max = 6): number[]` — 첫 타석(0)과 마지막 타석은 항상 넣고, 나머지는 `|wpHomeAfter − wpHomeBefore| ≥ 0.05`이거나 7회 이후 득점한 타석을 변화량이 큰 순으로 채운다. 길이 ≤ max, 오름차순. 승리확률이 null이면 득점 많은 타석 순.
- `expectedCounts(probs: { winHome: number; tie: number; winAway: number }, n = 1000): { home: number; tie: number; away: number }` — 내림 후 남는 수를 소수부가 큰 순(같으면 home → tie → away)으로 나눠 합이 정확히 n.

### `src/engine/index.ts`
- measured·playout 공개 API를 추가로 내보내고 `index.test.ts`에서 엔진 공개 API 전체 목록을 확인한다.

### 테스트
- `runsElasticity`는 양수이고, 같은 lg로 두 번 부르면 같은 값(캐시).
- `compileMeasuredPart`: 득점 배수 1.10 효과를 모든 타자에 적용하면 무사 주자 없음 반이닝 기대 득점이 +10%(±1.5%p). `home`(applicable false)·evidence null·item 없음 → `[]`. who별 applies 규칙.
- `compileEffects`: knob·measured가 섞인 parts가 순서대로 합쳐진다.
- `playout`:
  - 같은 seed면 결과가 같다(JSON 비교).
  - 끝난 경기의 winner가 점수와 규칙(11회 무승부)에 맞다. 9회말 이후 끝내기로 끝나면 `walkoff: true`.
  - 시작 반이닝의 pitcherId는 scenePitcher, 이후는 불펜 id.
  - 모든 wp 값은 0~1. 첫 타석 `wpHomeBefore`가 `game.evaluate(start, scenePitcher, { detail: false }).winHome`과 같다(1e-9).
  - 통계 일치: 픽스처 장면 상태(9회말 2사 만루 동점)에서 `trackWinProbability: false`로 3,000번 돌린 홈 승리 비율이 `evaluate(start, scenePitcher).winHome`과 3σ 이내(count 모델 포함). 너무 느리면 1,500번까지 줄여도 된다.
- `pickHighlights`: 0과 마지막 포함, 길이 ≤ max, 오름차순.
- `expectedCounts`: 합이 n, `{ winHome: 0.2845, tie: 0.035, winAway: 0.6805 }` → `{ home: 285, tie: 35, away: 680 }`.

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
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (난수는 `input.rng`로만)
3. 결과에 따라 `phases/1-engine/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 확률(evaluate)을 표본으로 바꾸지 마라. 이유: ADR-002. playout은 재생 전용이다.
- 선수 교체·대타·도루·투수 교체 규칙을 넣지 마라. 이유: ADR-002의 모델 범위 밖이다.
- evidence 값을 코드에 하드코딩하지 마라. 이유: 실측 효과는 파이프라인 산출물(evidence.json)에서만 온다(ADR-004).
- `src/types`, `src/domain`을 수정하지 마라. 이유: 공용 계약이다.
- 기존 테스트를 깨뜨리지 마라.
