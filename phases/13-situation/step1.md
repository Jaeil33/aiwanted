# Step 1: situation-setup

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ARCHITECTURE.md`(상황, 효과, 확률), `/docs/ADR.md`(ADR-014, ADR-016, ADR-021)
- `src/types/live.ts`, `src/types/data.ts`, `src/data/appData.ts`(`hitterOf`·`pitcherOf`)
- `src/game/scene.ts`와 테스트, `src/game/share.ts`와 테스트, `src/domain/format.ts`(`situationText`), `src/domain/teams.ts`
- `src/engine/game.ts`(`LineupSlot`, `TeamConfig`), `src/test/fixtures/live.ts`
- `phases/13-situation/index.json`의 step 0 summary

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

### `src/game/situation.ts` (순수)
```ts
export interface SituationSetup { /* SceneSetup과 같은 필드에서 scene 대신 situation */ }
export function buildSituationSetup(core: CoreData, situation: Situation): SituationSetup;
export function situationFromPa(game: LiveGame, no: number, kind: 'live' | 'past'): Situation | null;
export function customSituation(core: CoreData, form: CustomForm, today: string): Situation;
export function validateCustomForm(core: CoreData, form: unknown): { ok: true; form: CustomForm } | { ok: false; problems: string[] };
export function encodeCustomForm(form: CustomForm): string;   // base64url(JSON)
export function decodeCustomForm(text: string): CustomForm | null;
```
- `buildSituationSetup`: `scene.ts`의 `buildSceneSetup` 규칙을 그대로 따른다(타선 rel, 불펜, 이름·손, 진영, `sceneContext`, `promptContext`, 팀 색). 차이:
  - 선수 조회는 타선·타자는 `hitterOf`, 투수는 `pitcherOf`(기록 없으면 rel 1).
  - 이름·손은 core에 없으면 상황의 `LiveGame` 이름을 쓸 수 없으므로, `situationFromPa`가 만든 상황에는 `names`·`hands`를 함께 넘길 수 있게 `buildSituationSetup(core, situation, extra?: { names; hands })`로 받는다.
  - `promptContext.situation`에 볼카운트가 0-0이 아니면 "1볼 2스트라이크"를 붙인다.
- `situationFromPa`: ARCHITECTURE 규칙. `no`가 없으면 null. `actual`은 `complete && event !== null`일 때만. `dayGame`은 `summary.time < '17:00'`, `dome`은 구장 "고척".
- `customSituation`: ARCHITECTURE 규칙(팀 기본 타선, 없으면 그 팀 `line.pa` 상위 9명, 고른 타자 자리 바꾸기, 공격 팀 slot = form.slot, 수비 팀 slot 0, count = form).
- `validateCustomForm`: 팀 코드, 서로 다른 팀, inning 1~11, half 0·1, outs 0~2, bases 0~7, 점수 0~30 정수, balls 0~3, strikes 0~2, 타자가 공격 팀·투수가 수비 팀 소속(core 기록 기준), slot 0~8. 9회말 이후 홈팀이 앞선 상태처럼 경기 규칙상 불가능한 상태도 거부한다(`engine`의 상태 검사와 같은 규칙).
- 테스트: 픽스처 LiveGame의 모든 타석으로 상황 만들기(교체 반영·반이닝 넘어감·끊긴 타석 actual null), 팀 기본 타선 없는 팀, 타자가 이미 타선에 있을 때 자리 바꾸기, 인코딩 왕복, 잘못된 입력 20종 거부, 그리고 `buildSceneSetup`과 같은 입력이면 같은 엔진 설정이 나오는 동등성 테스트.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - `src/game`이 순수한가(DOM·fetch·타이머·Math.random 없음)?
   - 기존 `scene.ts`와 화면 동작이 그대로인가?
3. `phases/13-situation/index.json`의 step 1을 업데이트한다(completed + summary / error / blocked).

## 금지사항

- `scene.ts`와 기존 화면을 지우거나 바꾸지 마라. 이유: 16-broadcast-ui가 한 번에 바꾼다.
- 확률 숫자를 여기서 만들지 마라. 이유: 엔진만 계산한다.
- 실존 선수 이름을 테스트에 쓰지 마라.
