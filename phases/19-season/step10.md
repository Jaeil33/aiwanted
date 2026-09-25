# Step 10: cutover

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ADR.md`(**ADR-032**, ADR-023, ADR-035), `/docs/ARCHITECTURE.md`
- `src/game/scene.ts`, `src/app/screens/LobbyScreen.tsx`, `src/components/SceneCard.tsx`·`SituationCard.tsx`
- `src/types/data.ts`, `src/data/appData.ts`, `pipeline/tmi_pipeline/snapshot.py`·`context.py`

## 배경

새 경로가 다 섰다(step 9). 이제 옛 경로를 지운다. 두 벌로 두면 같은 일을 하는 코드가 어긋난다.

## 작업

### 지우는 것
- `src/game/scene.ts`, `src/app/useSceneSwings.ts`, `src/app/screens/LobbyScreen.*`, `src/components/SceneCard.*`·`SituationCard.*`(+ 각 테스트).
  `weekdayOf`는 `src/domain/format.ts`로 옮긴다(App·GameScreen이 쓴다).
- 타입 `SceneRecord`·`SceneTeam`, `AppData.scenes`, `PitchData.byPitcher`.
- `appData.ts`의 장면 검사와 `todaySceneIndex`.
- 라우트 `#/scene/:id`와 `GameActions.openScene`.
- 파이프라인: `scenes.json`을 더 만들지 않고 이미 있으면 지운다. `pitches.byPitcher`도 만들지 않는다.
  `context.enrich_scenes_weather`(장면에 날씨 채우기)도 없앤다.

### 테스트 픽스처
`fixtureAppData.scenes[0]` → `fixtureSituation`(같은 값의 `Situation`) + `FIXTURE_TITLE`·`FIXTURE_FINAL` + `fixtureSetup()`.
`buildSceneSetup(fixtureAppData, 'fixture-walkoff')`를 쓰던 자리는 전부 `fixtureSetup()`이다.

## 결과

앱 데이터 493KB → **232KB**(core 123KB + pitches 98KB + evidence 5KB + trust 1KB).
JS 번들 972KB → **709KB**(gzip 322KB → 232KB).

## 두 가지 값을 치른다 (ADR-036·037)

1. **아티팩트 미리보기로 더 플레이할 수 없다.** 단일 HTML에는 서버가 없어 `/api/game`을 부를 수 없고,
   번들에는 이제 되돌려볼 타석이 없다. ADR-032가 이미 받아들인 값이다. 되살리는 길은 두 가지(ADR-036).
2. **지난 경기 타석의 기온·바람이 null이다.** 임의의 경기 날씨를 앱에 줄 경로가 없다(ADR-037).
   낮 경기·돔은 그대로 채워지고, 사용자가 쓴 "35도"는 여전히 계산된다.

## Acceptance Criteria

- `npm run test`·`npx tsc -b`·`npm run lint`·`npm run build`·`npm run build:artifact`·`npm run check:relay` 통과.
- `npm run data`가 `scenes.json` 없이 `core.json`·`pitches.json`만 쓰고, 남아 있던 `scenes.json`을 지운다.
- `src` 어디에도 `SceneRecord`·`buildSceneSetup`·`byPitcher`가 남지 않는다.
- `npm run dev`에서 홈 → 타석까지 실제 데이터로 이어진다.

## 금지사항

- 장면 경로를 일부만 남기지 마라(두 벌이 되면 어긋난다).
- `data/build/app/*.json` 말고 `data/`의 다른 것을 커밋하지 마라(ADR-023).
