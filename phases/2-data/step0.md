# Step 0: pipeline-io

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` ("데이터 흐름", "데이터 (src/types/data.ts ↔ pipeline)")
- `/docs/ADR.md` (ADR-004, ADR-005)
- 0-setup 산출물: `pipeline/tmi_pipeline/__init__.py`(ROOT, RAW_DIR, BUILD_DIR), `pipeline/tmi_pipeline/contract.py`, `pipeline/tests/`, `pytest.ini`, `scripts/run-python.ts`, `src/types/data.ts`
- 이식 원본(읽기만): `reference/tmi-prototype/build_data.py` (`f`, `innings`, `rel`, `season`, `bullpen`, `chrono`, `pitch_row`, `walk_pitches`, `event_of`와 relay JSON을 읽는 방식)

이 phase는 Python만 다룬다. 원자료는 `RAW_DIR`(환경변수 `TMI_RAW_DIR`, 없으면 `data/raw`)에 있고 git에 없다. 이 PC의 원자료는 `C:/Users/김재일/Desktop/aiwanted/data/raw`에 있으니, git worktree에서 실행 중이면 명령 앞에 `TMI_RAW_DIR="C:/Users/김재일/Desktop/aiwanted/data/raw"`를 붙인다. **테스트는 원자료를 읽지 않고** `pipeline/tests/fixtures/`의 합성 JSON만 쓴다.

원자료 구조(네이버 스포츠 비공식 API 응답을 그대로 저장한 파일):
- `naver/relay/<gameId>.json`: `{"game": {...일정 필드...}, "textRelays": [...]}`. textRelay마다 `homeOrAway`("0" 원정 공격, "1" 홈 공격), `inn`, `textOptions`, `ptsOptions`, `metricOption`(`homeTeamWinRate`, `awayTeamWinRate`, `wpaByPlate` — 그 타석이 **끝난 뒤** 값, 합이 100이 아니면 무효). textOption `type`: 8 타자 소개(`batterRecord`: `pcode`, `name`, `batOrder`, `hitType`; `currentGameState`: 타석 시작 상태 `out`, `base1..3`("0"이면 빈 루), `awayScore`, `homeScore`, `pitcher`, `batter`), 1 투구(`pitchNum`, `speed`, `stuff`, `pitchResult`, `ptsPitchId`), 13·23 결과 문장, 14·24 진루·득점 문장. ptsOption: `pitchId`, `x0`, `z0`, `vx0`, `vy0`, `vz0`, `ax`, `ay`, `az`, `topSz`, `bottomSz`, `stance`.
- `naver/schedule/sched_full_YYYY-MM.json`: `{"result": {"games": [...]}}`. 필드 `gameId`, `gameDate`, `gameDateTime`, `stadium`, `homeTeamCode`, `awayTeamCode`, `homeTeamScore`, `awayTeamScore`, `statusCode`("RESULT"), `cancel`, `suspended`, `roundCode`("kbo_r" 정규시즌), `homeStarterName`, `awayStarterName`.
- `naver/stats/stats_{2025,2026}_{HITTER,PITCHER}_all.json`: `{"result": {"seasonPlayerStats": [...]}}`. 타자 `playerId`, `playerName`, `teamId`, `hitterAb`, `hitterHit`, `hitterH2`, `hitterH3`, `hitterHr`, `hitterBb`, `hitterHp`, `hitterKk`, `hitterObp`, `hitterSlg` / 투수 `pitcherInning`("180 2/3"), `pitcherHit`, `pitcherHr`, `pitcherBb`, `pitcherHp`, `pitcherKk`, `pitcherGameCount`, `pitcherEra`, `pitcherWhip`, `pitcherSave`, `pitcherHold`.

## 작업

모든 모듈은 `pipeline/tests/test_<모듈>.py`를 먼저 쓴다. 합성 픽스처(`pipeline/tests/fixtures/`)를 먼저 만든다: 경기 1개짜리 relay(2이닝, 타석 5개 이상, 투구·PTS·metricOption 포함, 무효 WP 행 1개 포함), 일정 한 달 파일(정규시즌 완료·취소·포스트시즌 섞음), 타자·투수 시즌 기록 몇 명. 실존 선수 이름을 쓰지 마라.

### `pipeline/tmi_pipeline/io.py`
- `load_json(path) -> Any`(UTF-8), `write_json(path, obj) -> None`(UTF-8, `ensure_ascii=False`, 구분자 압축, 부모 폴더 생성)
- `relay_game_paths(raw_dir: Path) -> list[Path]`(이름순), `schedule_paths(raw_dir) -> list[Path]`, `season_stats_path(raw_dir, season: int, kind: str) -> Path`
- `load_schedule_games(raw_dir) -> list[dict]` — 모든 월 파일의 games를 합치고 `gameId`로 중복 제거(뒤 파일 우선)

### `pipeline/tmi_pipeline/relay.py` (build_data.py에서 이식)
- `chrono(game) -> list[dict]`, `sorted_options(relay) -> list[dict]`
- `walk_pitches(opts, pts_by_id)` — (textOption, pts 또는 None, 던지기 전 볼, 스트라이크)를 순서대로 낸다
- `pitch_row(t, p, balls, strikes) -> list` — `src/types/data.ts`의 `PitchRow` 순서(구종 인덱스는 `contract.PITCH_TYPES`, 없으면 "기타"; code는 `contract.PITCH_RESULT_CODE`; stance L=0·그 외 1; PTS 값은 소수 셋째 자리 반올림)
- `event_of(text: str) -> int` — build_data.py 그대로(삼진 0, 볼넷·고의4구·몸에 맞는 1, 홈런 2, 3루타 3, 2루타 4, 1루타·안타 5, 나머지 6)
- `bases_of(state: dict) -> int`, `valid_home_wp(metric: dict | None) -> float | None`(합이 99~101일 때만 `homeTeamWinRate / 100`)
- `@dataclass PlateAppearance`: `game_id, index, inning, half, side, batter_id, batter_name, bat_order, hit_type, state(타석 시작 GameState 모양 dict: inning, half, outs, bases, away, home), pitcher_id, options, pts_by_id, result_text, runs_in, event, wp_home_after, wpa`
- `plate_appearances(game) -> list[PlateAppearance]` — 타자 소개(type 8 + batterRecord)가 있는 textRelay만 시간순으로. `runs_in`은 14·24 문장 중 "홈인" 개수(+ 홈런이면 타자 1).

### `pipeline/tmi_pipeline/stats.py` (build_data.py에서 이식)
- `K_H = 200.0`, `K_P = 250.0`
- `innings(s) -> float`("180 2/3", "⅓", "⅔" 처리), `rel(counts, prior, lg) -> list[float]`
- `season_rates(hitters: list[dict], pitchers: list[dict]) -> SeasonRates` — `@dataclass SeasonRates(hitters: dict, pitchers: dict, league_hitting: list[float], league_pitching: list[float])`, 각 선수 dict에 `name, team, counts(길이 7), rel, line`
- `bullpen(rates: SeasonRates, team: str) -> dict` — `{id: f"{team}-pen", team, name: "불펜", rel, n}` (g ≥ 8, ip/g < 2)

### `pipeline/tmi_pipeline/build.py`
- `STAGES: dict[str, Callable[[Path, Path], dict]]` 등록부(이 step에서는 비어 있음). `main(argv: list[str] | None = None) -> int`: `--only a,b`(없으면 등록된 전부 순서대로), `--raw`(기본 RAW_DIR), `--out`(기본 BUILD_DIR). 모르는 stage 이름이면 사용 가능한 목록을 출력하고 2를 돌려준다. 각 stage가 돌려준 요약 dict를 출력한다.
- `if __name__ == "__main__": raise SystemExit(main())`

### 테스트
- chrono·plate_appearances가 픽스처 타석 수·순서·시작 상태(아웃, 주자, 점수)를 맞게 읽는다.
- walk_pitches의 볼·스트라이크 진행(2스트라이크 파울 유지), pitch_row 길이 16과 필드 값.
- event_of 매핑, bases_of, valid_home_wp(무효 행 → None).
- innings 파싱, rel(표본 0이면 모든 값 1), season_rates의 리그 비율 합 1, bullpen 필터.
- load_schedule_games 중복 제거, build.main의 모르는 stage → 2.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`pipeline/tmi_pipeline`, `pipeline/tests`)
   - ADR-007 의존성(numpy, pytest)만 쓰는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (테스트가 `data/`를 읽지 않음, 원자료 커밋 없음)
3. 결과에 따라 `phases/2-data/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- pandas, scikit-learn, lightgbm 같은 다른 패키지를 쓰지 마라. 이유: ADR-007.
- 네이버 API를 새로 호출하지 마라. 이유: 원자료는 이미 캐시돼 있고, 비공식 API 호출은 최소화한다(ADR-005).
- 픽스처에 원자료를 복사하거나 실존 선수 이름을 넣지 마라. 이유: 공개 저장소, ADR-005.
- `src/`와 `docs/`를 수정하지 마라. 이유: 이 phase의 범위가 아니다.
- 기존 테스트를 깨뜨리지 마라.
