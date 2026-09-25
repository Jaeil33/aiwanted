# Step 0: app-data

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ARCHITECTURE.md`(데이터 흐름, 데이터 계약), `/docs/ADR.md`(ADR-005, ADR-021, ADR-023, **ADR-035**)
- `pipeline/tmi_pipeline/stats.py`, `snapshot.py`, `build.py`, `contract.py`와 각 테스트, `pipeline/tests/fixtures/`
- `src/types/data.ts`(`CoreData`, `PlayerRecord`), `src/data/appData.ts`(검증·로딩), `src/game/scene.ts`(선수 조회)
- `phases/15-data-v2/step0.md`(이 step이 흡수한 원안. `teamLineups`는 빼고 읽는다)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다(pytest + Vitest).

## 배경

`stats.py`의 `season_rates`는 시즌 기록만으로 2026 전 선수의 `rel`을 계산할 수 있는데, `snapshot.py`(366-375줄)가 **16개 장면에 나온 선수만 남겨** `core.json`에 146명뿐이다. 시즌 아무 타석이나 열려면(ADR-032) 그 타석의 타자·투수가 번들에 있어야 하므로 필터를 없앤다. 원자료 `data/raw/naver/stats/stats_2026_{HITTER,PITCHER}_all.json`에 이미 전 선수가 있어 **추가 수집은 없다**.

선수를 다 실으면 같은 id가 타자·투수 둘 다인 경우(투타 겸업·대타로 나온 투수)가 생긴다. 지금은 146명으로 걸러져 충돌이 드러나지 않았다. 키 규칙을 세우지 않으면 `core.players[batterId]`가 **투수 레코드를 조용히 돌려줘** 능력치가 틀어진다.

`byPitcher` 비우기와 `scenes.json` 중단은 ADR-035의 결정이지만 이 step에서 하지 않는다. `appData.ts`가 `scenes`를 필수로 검증해서(`isScenes`는 `length > 0`까지 요구한다) 지금 배포된 로비가 즉시 깨진다. 축소는 step 10(cutover)에서 한 번에 한다.

## 작업

### `pipeline/tmi_pipeline/snapshot.py`
- `players`: 2026 시즌 기록이 있는 모든 타자(타석 > 0)·투수(이닝 > 0). 장면 참여자 필터를 없앤다.
- 키 규칙: 같은 id가 둘 다면 **투수 `<id>`, 타자 `<id>:H`**. 레코드 안의 `id` 필드는 원래 id 그대로 둔다. 한 역할뿐이면 `<id>`.
- 손: 시즌 기록 파일의 투타 필드가 있으면 그것, 없으면 기존 추정(투구 손은 릴리스 위치)을 유지한다. 원천별 개수를 build 로그에 남긴다.
- `line`(화면 표시용 시즌 기록)은 기존 필드를 유지한다. 수치는 소수 4자리.
- 크기 예산: `core.json` **200KB 이하**(넘으면 build 실패).
- `scenes.json`·`pitches.json`은 지금까지대로 만든다(step 10이 정리한다).

### `pipeline/tmi_pipeline/contract.py`
- `<id>:H` 키 규칙을 계약에 넣고 pytest로 고정한다. `teamLineups`는 넣지 않는다(범위 밖).

### `src/data/appData.ts`
- core 검증이 `<id>:H` 키를 받아들인다.
- 조회 헬퍼를 더한다: `hitterOf(core, id)` — `<id>:H`가 있으면 그것, 없으면 `<id>`. `pitcherOf(core, id)` — `<id>`.
- 둘 다 없으면 `null`을 돌려준다(호출부가 기존처럼 rel 1로 떨어뜨린다).

### `src/game/scene.ts`
- 타자 조회를 `hitterOf`, 투수 조회를 `pitcherOf`로 바꾼다. **이것을 빠뜨리면 id가 충돌하는 장면에서 타자 능력치가 투수 것이 된다.**

### 테스트(먼저 쓴다)
- pytest(합성 픽스처): 모든 선수가 들어감, 0타석 타자 제외, 0이닝 투수 제외, id 충돌 시 `<id>`/`<id>:H` 분리, 레코드 `id`는 원래 값, 크기 예산 초과 시 실패.
- Vitest: `appData` 검증이 `:H` 키를 통과시킴, `hitterOf`가 충돌 시 타자를 돌려줌, 충돌 없을 때 `<id>`로 떨어짐, 없으면 `null`. `src/game/scene.test.ts`에 충돌 id를 가진 합성 장면을 더해 타자 rel이 투수 것이 아님을 확인.

## Acceptance Criteria

- `npm run data` 뒤 `core.json`의 선수 수가 500명 이상이고 200KB 이하다.
- 같은 id가 타자·투수 둘 다인 사례가 실제 데이터에 있고, `<id>`와 `<id>:H`로 갈려 있다.
- `npm run test`(Vitest + pytest) 전부 통과.
- `npm run build` 통과. 기존 로비(`#/`)와 16개 장면이 **그대로 동작한다**.
- `data/build/app/scenes.json`과 `pitches.json`은 이전과 같은 모양으로 남아 있다.

## 검증 절차

1. `npm run test`
2. `npm run data` → `core.json` 선수 수·바이트 수 출력으로 확인
3. `npm run build`
4. `npm run dev`로 로비에서 장면 하나를 끝까지 치러 본다(타자 이름·시즌 기록 줄이 맞는지)

## 금지사항

- `scenes.json`·`pitches.json`의 생성을 멈추거나 모양을 바꾸지 마라(step 10).
- `teamLineups`·`matchups.json`을 만들지 마라(범위 밖, ADR-035).
- `data/raw`·`data/build`의 비앱 산출물을 커밋하지 마라(ADR-023).
- 네트워크를 부르지 마라. 이 step은 이미 있는 원자료만 쓴다.
- 테스트 픽스처에 실존 선수 이름을 쓰지 마라(공개 저장소).
