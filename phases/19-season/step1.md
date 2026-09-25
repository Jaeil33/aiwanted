# Step 1: contracts

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ARCHITECTURE.md`(실시간 경기 `src/types/live.ts`, 상황 `src/types/data.ts`), `/docs/ADR.md`(ADR-014, ADR-016, ADR-017, **ADR-028**, **ADR-032**, **ADR-033**, **ADR-035**)
- `src/types/domain.ts`(`GameState`·`EventIndex`·`Half`·`Bases`), `src/types/data.ts`(`TeamCode`·`PitchRow`·`CoreData`)
- `src/domain/players.ts`(step 0에서 만든 `hitterOf`·`pitcherOf`)
- `phases/13-situation/step0.md`(이 step이 흡수한 원안)

테스트를 먼저 쓴다(Vitest). 이 step은 **계약만** 고정한다. 화면·엔진 동작은 바꾸지 않는다.

## 배경

뒤 step 2~9가 모두 이 계약에 기댄다. 여기서 이름이나 모양이 틀리면 파서·서버 함수·화면이 따로 어긋난다. 타입 정의의 원본은 `docs/ARCHITECTURE.md`이고 이 step은 그것을 코드로 옮기는 것이다. **ARCHITECTURE에 없는 필드를 새로 만들지 마라.** 필요하면 step을 blocked로 보고한다.

범위에서 뺀 것(ADR-032·ADR-035): `CustomForm`(직접 만들기), `MatchupIndex`(매치업 찾기), `TallyKey`·`TallyRow`(인기 TMI 집계), `CoreData.teamLineups`. `SituationKind`의 `'custom'` 갈래는 ARCHITECTURE 그대로 둔다 — 지금은 아무도 만들지 않지만 좁혔다 넓히는 변경을 피한다.

`src/live`와 `src/types/live.ts`는 나중에 `api/game.ts`가 닿는다. 그래서 상대 import에 `.js` 확장자를 붙인다(ADR-028). `src/types/data.ts`가 이미 그렇게 한다.

## 작업

### `src/types/live.ts` (새 파일)
`docs/ARCHITECTURE.md`의 블록을 그대로 옮긴다: `GameStatus`, `TeamLine`, `GameSummary`, `PaRecord`, `LiveGame`. `TeamCode`·`PitchRow`는 `./data.js`, `GameState`·`EventIndex`는 `./domain.js`에서 가져온다.

### `src/types/data.ts` (추가)
`SituationKind`, `Situation`을 ARCHITECTURE 그대로 더한다. `SceneRecord`·`AppData.scenes`는 그대로 둔다(step 10이 지운다).

### `src/test/fixtures/live.ts` (새 파일, 합성 데이터만)
- `fixtureGameSummaries()`: 경기 전·진행 중·끝난 경기 셋.
- `fixtureLiveGame()`: 타석 8개 — 삼진, 볼넷, 2점 홈런, 병살, 1루타, 대타 교체, 반이닝 전환, 주루사로 끊긴 타석(`complete: false`·`event: null`) — 과 진행 중 타석 `current` 하나.
- `fixtureSituations()`: `live`·`past` 각 하나(`custom`은 범위 밖).
- 실존 선수 이름을 쓰지 마라. 가상 이름(김타자, 박투수)과 가상 id를 쓴다.

### `src/test/fixtures/live.test.ts` (새 파일)
픽스처가 계약을 지키는지 고정한다: 타선 길이 9, `outs` 0~2, `PitchRow` 길이 16, `no` 오름차순, `Situation.id`가 `` `${gameId}-${no}` ``, 끊긴 타석은 `event`가 null이고 `complete`가 false, `PaRecord.pitches`의 볼카운트는 투구 **전** 값, `GameSummary.status`가 `GameStatus`에 있는 값.

## Acceptance Criteria

- `npx tsc -p tsconfig.app.json --noEmit` 통과.
- `npm run lint` 통과.
- `npm run test` 전부 통과. 기존 테스트 수가 줄지 않는다.
- `npm run build` 통과하고 기존 로비·장면이 그대로 동작한다.
- `src/types/live.ts`의 필드 이름·모양이 `docs/ARCHITECTURE.md`와 한 글자도 다르지 않다.

## 검증 절차

1. `npx tsc -p tsconfig.app.json --noEmit`
2. `npm run lint`
3. `npm run test`
4. `docs/ARCHITECTURE.md`의 타입 블록과 `src/types/live.ts`를 나란히 두고 대조

## 금지사항

- ARCHITECTURE에 없는 필드를 더하지 마라. 필요하면 blocked로 보고한다.
- `CustomForm`·`MatchupIndex`·`TallyKey`·`TallyRow`·`teamLineups`를 만들지 마라(범위 밖).
- 화면·엔진·기존 세션 동작을 바꾸지 마라. `src/game/session.ts`·`GameProvider`를 건드리지 마라.
- `src/types/live.ts`와 앞으로의 `src/live`에서 확장자 없는 상대 import를 쓰지 마라(ADR-028).
- 픽스처에 실존 선수 이름을 쓰지 마라(공개 저장소).
