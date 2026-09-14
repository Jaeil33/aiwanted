# Step 1: app-snapshot

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` ("데이터 흐름", "데이터 (src/types/data.ts ↔ pipeline)")
- `/docs/ADR.md` (ADR-005)
- `/docs/PRD.md` (핵심 기능 1 명장면)
- 출력 모양의 기준: `src/types/data.ts` (`CoreData`, `PitchData`, `SceneRecord`, `PitchRow`, `PlayerRecord`, `BullpenRecord`)
- 이전 step 산출물: `pipeline/tmi_pipeline/io.py`, `relay.py`, `stats.py`, `build.py`, `contract.py`, `pipeline/tests/fixtures/`
- 이식 원본(읽기만): `reference/tmi-prototype/build_data.py`의 `SCENARIOS`, `main()`(카운트 표, 장면 조립, 라인업·타순 계산, 투수 손 추정)

원자료는 `RAW_DIR`(환경변수 `TMI_RAW_DIR`)에 있다. git worktree에서 실행 중이면 `TMI_RAW_DIR="C:/Users/김재일/Desktop/aiwanted/data/raw"`를 붙인다. 테스트는 합성 픽스처만 쓴다.

## 작업

### `pipeline/tmi_pipeline/snapshot.py` (테스트 먼저 `pipeline/tests/test_snapshot.py`)
- `CURATED`: build_data.py `SCENARIOS` 4개를 그대로 옮긴다(`id`, `game`, `inning`, `half`, `batter`, `title`).
- `count_table(games: list[dict]) -> list[list[float]]` — 12행(인덱스 balls*3+strikes) × 5열 [B, T, S, F, X] 비율, 소수 넷째 자리.
- `pitches_by_pitcher(games) -> dict[str, list[list]]` — 모든 추적 투구 행. 투수는 투구 textOption의 `currentGameState.pitcher`, 없으면 타석 시작 투수.
- `infer_throws(rows) -> str` — x0 중앙값 > 0이면 "L", 아니면 "R". 행이 없으면 "R".
- `sample_rows(rows, cap: int, seed: int) -> list` — (code, stance) 층의 비율을 유지하며 최대 cap개. 같은 seed면 같은 결과, cap 이하면 전부.
- `situation_text(inning, half, outs, bases) -> str` — "9회말 2사 만루", "8회초 무사 1·3루", "3회초 1사 주자 없음"(아웃: 무사·1사·2사, 주자: 주자 없음·만루·"1·2루" 형식).
- `scene_candidates(games, exclude_game_ids: set[str], top_n: int = 12) -> list[tuple[dict, int]]` — 6회 이후이고 `wpa`가 유효하며, 타석 시작 시점에 양 팀 타순 1~9번이 모두 한 번 이상 나온 타석. |wpa| 큰 순, 경기당 1개, 상위 top_n개 (game, 타석 인덱스).
- `build_scene(game, pa_index, source, title, rates, throws_by_pitcher) -> dict` — `SceneRecord` 모양:
  - `lineups`: 그 타석까지 각 타순의 마지막 타자(이번 타자 포함). `state.slotAway/slotHome`: 공격 팀은 이번 타자 `batOrder − 1`, 상대 팀은 상대의 마지막 `batOrder % 9`.
  - `state`: 타석 시작 상태(inning, half, outs, bases, away, home) + slot 두 개.
  - `actual`: `result`(13·23 문장), `event`, `runs`, `notes`(14·24 문장), `pitches`(그 타석의 추적 투구 행), `wpAfterHome`(유효하면 /100, 아니면 None).
  - `naverWpBeforeHome`: 직전 유효 타석의 홈 승리확률 /100, 없으면 None.
  - `leverage`: |wpa|. `title`: 선정 장면은 CURATED 제목, 자동 장면은 `situation_text`.
  - `context`: `tempC: None`, `windMs: None`(날씨는 다음 step에서 채움), `dayGame`: `gameDateTime` 시각 < 17, `dome`: `stadium == "고척"`.
  - `away`/`home`: `{code, name, final}`.
- `build_snapshot(raw_dir: Path) -> dict` — `{"core": CoreData, "pitches": PitchData, "scenes": list[SceneRecord]}`:
  - 2026 시즌 기록으로 `season_rates`.
  - scenes: CURATED 4개(경기나 타자를 못 찾으면 경고를 출력하고 건너뜀) + 자동 후보 12개(선정 장면의 경기 제외). 날짜순 정렬.
  - players: 모든 장면의 라인업 타자와 장면 투수. 시즌 기록이 없으면 `rel: [1]*7`, `line: {}`, 이름은 relay `batterRecord`에서. 타자 `bats`는 hitType("양타" → S, "좌타" → L, 그 외 R), 투수 `throws`는 `infer_throws`.
  - bullpens: 장면에 나오는 모든 팀(key = 팀 코드).
  - `league`: 2026 타자 리그 비율(길이 7), `countTable`, `meta`: season 2026, relayRange [첫 경기일, 마지막 경기일], relayGames, generatedAt(UTC ISO), sources `["네이버 스포츠 KBO 문자중계·기록", "TMI 야구 파이프라인"]`.
  - pitches: `pitchTypes`, `byPitcher`(장면 투수만, 각 `sample_rows(cap=300)`), `pools.L`/`pools.R`(모든 투수의 투구를 투수 손별로 모아 `sample_rows(cap=600)`).
- `build.py`에 stage 등록: `STAGES["snapshot"]` → `BUILD_DIR/app/core.json`, `pitches.json`, `scenes.json`을 쓰고 요약(장면 수, 선수 수, 파일별 KB)을 돌려준다.

### 테스트 (합성 픽스처)
- `count_table` 행 합 1, `pitches_by_pitcher` 투수 귀속, `infer_throws`, `sample_rows` 결정성·cap·층 비율.
- `situation_text` 예시 3개.
- `build_scene`: 픽스처 경기 한 타석의 state·lineups·slot·actual·wp 값.
- `build_snapshot` 결과의 키 집합이 `src/types/data.ts` 필드 이름과 같다(테스트 안에 기대 키 목록을 적는다).

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
npm run data -- --only snapshot
.venv/Scripts/python -c "import json; s=json.load(open('data/build/app/scenes.json',encoding='utf-8')); c=json.load(open('data/build/app/core.json',encoding='utf-8')); assert 12<=len(s)<=16, len(s); assert all(p in c['players'] for x in s for p in x['lineups']['away']+x['lineups']['home']+[x['batter'],x['pitcher']]); print('scenes', len(s), 'players', len(c['players']))"
```

(worktree에서는 `npm run data` 앞에 `TMI_RAW_DIR="C:/Users/김재일/Desktop/aiwanted/data/raw"`를 붙인다.)

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 출력 JSON 필드 이름이 `src/types/data.ts`와 같은가?
   - ADR-007 의존성만 쓰는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (`data/build`가 git에 안 들어감)
3. 결과에 따라 `phases/2-data/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`(장면 수·파일 크기 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 실제 결과가 드러나는 제목(예: "끝내기 만루포")을 자동 장면 제목에 쓰지 마라. 이유: 결과는 한 판이 끝날 때 공개한다(PRD).
- 선수 사진·엠블럼 URL을 출력에 넣지 마라. 이유: ADR-005.
- 네이버 API를 새로 호출하지 마라. 이유: 캐시된 원자료만 쓴다.
- `src/`를 수정하지 마라. 이유: 계약 변경은 이 phase의 범위가 아니다.
- 기존 테스트를 깨뜨리지 마라.
