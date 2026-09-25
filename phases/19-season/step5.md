# Step 5: situation-setup

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ARCHITECTURE.md`(상황, 효과, 확률), `/docs/ADR.md`(ADR-014, ADR-016, ADR-032, ADR-035)
- `src/game/scene.ts`와 테스트, `src/types/data.ts`(`Situation`), `src/types/live.ts`, `src/domain/players.ts`
- `phases/13-situation/step1.md`(이 step이 흡수한 원안. `customSituation`·`validateCustomForm`은 뺀다)

테스트를 먼저 쓴다.

## 배경과 원안에서 달라지는 것

원안은 `situation.ts`를 `scene.ts` **옆에** 새로 만들고 16-broadcast-ui가 한꺼번에 갈아타는 그림이었다.
그러면 같은 조립 규칙(타선 rel·불펜·이름·손·진영·프롬프트 맥락·팀 색)이 두 벌 생기고, 둘이 어긋나면
화면과 확률이 다른 경기를 가리킨다. 그래서 **반대로 한다**: `Situation`을 바닥으로 놓고 `SceneRecord`를
그 위에 얹는다. `buildSceneSetup`은 `situationFromScene` → `buildSituationSetup`을 부르는 다리만 남는다.
step 10이 장면 경로를 지울 때 이 다리만 없애면 된다.

`SceneSetup.scene`(SceneRecord)은 `SituationSetup.situation`(Situation)이 된다. `SceneRecord`에만 있던
표시용 값은 조립 결과로 옮긴다: `title`, `actualFinal`. `leverage`는 옮기지 않는다(장면 선정용, 화면 표시 금지 ADR-014).

## 작업

### `src/game/situation.ts` (새 파일, 순수)
```ts
export interface SituationSetup { situation; title; actualFinal; lg; countTable; away; home; scenePitcher; batSide; fieldSide; sceneContext; promptContext; names; hands; teamColors }
export interface SituationExtra { names?; hands?; actualFinal?; title? }
export function situationTitle(situation: Situation): string;
export function situationFromPa(game: LiveGame, no: number, kind: SituationKind): Situation | null;
export function situationFromScene(scene: SceneRecord): Situation;
export function buildSituationSetup(core: CoreData, situation: Situation, extra?: SituationExtra): SituationSetup;
export function batterStanceFor / nameOf / throwsOf / pitcherFor / batterFor
```
- `situationFromPa`: count 0-0(ADR-016), `before` 상태, 그 타석 타선·투수. `actual`은 `complete`이고 `event !== null`일 때만. `dayGame`은 시작 17:00 이전, `dome`은 고척.
- `situationTitle`: `situationText` + 11회면 ", 마지막 이닝". **대타 꼬리표는 짐작하지 않는다**(교체 기록이 있어야 안다, ADR-014). 아는 쪽이 `extra.title`로 넘긴다.
- `buildSituationSetup`: `scene.ts`의 규칙을 그대로 따르되 두 가지를 고친다.
  - `core.players`의 겸업 키(`<id>:H`)를 꼬리 없는 id로 합쳐 `names`·`hands`에 넣는다. 지금은 겸업 선수의 타격 손이 이름표에서 빠진다(ADR-035).
  - 2026 기록이 없는 선수(신인·군 복귀·외국인 교체)는 `extra.names`·`extra.hands`(중계에서 모은 값)로 채운다. core가 먼저다.
  - 볼카운트가 0-0이 아니면 `promptContext.situation`에 "1볼 2스트라이크"를 붙인다.

### `src/game/scene.ts` (다리로 줄인다)
`buildSceneSetup(data, sceneId)` 하나만 남기고 `buildSituationSetup`에 넘긴다. `title`·`actualFinal`을 함께 준다.

### 부르는 쪽
`setup.scene` → `setup.situation`, `SceneSetup` → `SituationSetup`으로 바꾼다(`selectors`·`broadcast`·`playback`·`effects`·`usePlayback`·`useSceneSwings`·`useTmiContributions`·`useSceneEvaluations`·`PlayScreen`·`ResultScreen`과 테스트).
`ResultScreen`의 실제 결과 줄·최종 점수 줄은 `situation.actual`이 null일 수 있고 `actualFinal`이 없을 수 있다.

## Acceptance Criteria

- `buildSceneSetup`과 `buildSituationSetup(core, situationFromScene(scene))`이 **같은 엔진 설정**을 낸다(동등성 테스트).
- `npm run test`·`npx tsc -b`·`npm run lint`·`npm run build` 전부 통과, 기존 테스트 수가 줄지 않는다.
- 화면 동작이 그대로다(App·PlayScreen·ResultScreen 테스트).

## 금지사항

- `customSituation`·`validateCustomForm`·`encode/decodeCustomForm`을 만들지 마라(ADR-032, 범위 밖).
- 확률 숫자를 여기서 만들지 마라(ADR-002).
- `leverage`를 화면에 흘리지 마라(ADR-014).
- 실존 선수 이름을 테스트에 쓰지 마라.
