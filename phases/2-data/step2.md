# Step 2: game-context

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ADR.md` (ADR-004 실측 변수 정의와 트레이드오프)
- 변수 정의 원본: `src/domain/measured.json`, 이를 읽는 `pipeline/tmi_pipeline/contract.py`(`load_measured`, `transform_value`)
- 이전 step 산출물: `pipeline/tmi_pipeline/io.py`(`load_schedule_games`), `build.py`, `snapshot.py`

원자료 위치와 테스트 원칙은 이전 step과 같다. worktree에서는 `TMI_RAW_DIR="C:/Users/김재일/Desktop/aiwanted/data/raw"`를 붙인다.

원자료 사실(확인됨): 정규시즌(`roundCode == "kbo_r"`) 완료 경기는 2021~2025 시즌마다 720경기, 2026은 630경기다. 구장 이름은 잠실·고척·문학·광주·수원·창원·사직·대구·대전·한밭·울산·포항·청주. 시작 시각은 18:30·17:00·14:00·18:00·19:00·15:00 등. 양 팀 선발 이름이 모두 있는 경기 비율은 2021 91%, 2022 94%, 2023 100%, 2024 41%, 2025 61%, 2026 100%.

## 작업

### `pipeline/tmi_pipeline/stadiums.py` (테스트 먼저)
- `STADIUMS: dict[str, tuple[float, float]]` — 잠실 (37.5122, 127.0719), 고척 (37.4982, 126.8671), 문학 (37.4370, 126.6932), 광주 (35.1682, 126.8891), 수원 (37.2997, 127.0097), 창원 (35.2225, 128.5822), 사직 (35.1940, 129.0615), 대구 (35.8411, 128.6817), 대전 (36.3165, 127.4290), 한밭 (36.3165, 127.4290), 울산 (35.5323, 129.2656), 포항 (36.0080, 129.3590), 청주 (36.6390, 127.4700).
- `DOMES = {"고척"}`, `haversine_km(a: tuple, b: tuple) -> float`, `coords(stadium: str) -> tuple`(모르는 이름은 KeyError).

### `pipeline/tmi_pipeline/weather.py` (테스트 먼저)
- `ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"`
- `fetch_site_weather(site: str, lat: float, lon: float, start: str, end: str, cache_dir: Path, fetch: Callable[[str], dict] = http_get_json) -> dict` — 쿼리 `hourly=temperature_2m,wind_speed_10m,precipitation`, `wind_speed_unit=ms`, `timezone=Asia/Seoul`. 캐시 파일 `cache_dir/om_archive_{lat}_{lon}_{start}_{end}.json`이 있으면 네트워크를 쓰지 않는다. 실제 요청은 간격 1초, 실패 시 3번 재시도. 좌표가 같은 구장(대전·한밭)은 한 번만 받는다.
- `HourlySeries(payload: dict)`: `at(dt: datetime) -> tuple[float|None, float|None, float|None] | None`(정시 기준 기온·풍속·강수), `precip_sum(start: datetime, end: datetime) -> float | None`(구간에 값이 하나도 없으면 None).

### `pipeline/tmi_pipeline/context.py` (테스트 먼저)
- `regular_completed(games) -> list[dict]` — `roundCode == "kbo_r"`, `statusCode == "RESULT"`, cancel·suspended 아님, `gameDateTime` 순.
- `team_game_rows(games, series_by_stadium: dict[str, HourlySeries]) -> list[dict]` — 경기마다 두 행(각 팀의 공격 기준):
  `game_id, date, season, team, opp, stadium, home(0/1), runs, start_hour, temp_c, wind_ms, rain_pre3h, day_game, weekend, travel_km, after_off_day, starter_short_rest, starter_long_rest, opp_starter_rest_days, weather_missing(0/1), dome(0/1)`
  - 날씨: 시작 시각 정시의 기온·풍속, 강수는 시작 전 3시간 합. 돔은 `temp_c=20, wind_ms=0, rain_pre3h=0`(변환 후 0). 값이 없으면 같은 중립값을 넣고 `weather_missing=1`.
  - `day_game`: 시작 시 < 17. `weekend`: 토·일.
  - `travel_km`: 그 팀의 직전 경기 구장 → 이번 구장 거리(시즌 첫 경기 0, 소수 첫째 자리).
  - `after_off_day`: 같은 시즌 직전 경기와 날짜 차가 2일 이상(시즌 첫 경기 0, 더블헤더는 0).
  - 상대 선발 휴식: 상대 팀 선발 이름으로 같은 팀·같은 시즌 직전 선발 날짜와의 차 `opp_starter_rest_days`. 4일 이하 → `starter_short_rest=1`, 8일 이상 → `starter_long_rest=1`. 선발 이름이 없거나 시즌 첫 선발이면 둘 다 0, 일수 None.
- `enrich_scenes_weather(scenes: list[dict], series_by_stadium, schedule_by_game: dict[str, dict]) -> list[dict]` — 장면 `context.tempC`, `context.windMs`를 경기 시작 시각 값으로 채운다(돔은 None 유지, 소수 첫째 자리).
- `build.py`에 `STAGES["context"]` 등록: 2021-03-01부터 원자료의 마지막 완료 경기일까지 구장별 날씨를 받아(캐시 `RAW_DIR/weather/`) `BUILD_DIR/context/team_games.json`을 쓰고, `BUILD_DIR/app/scenes.json`이 있으면 날씨를 채워 다시 쓴다. 요약: 행 수, 시즌별 경기 수, `weather_missing` 비율, 선발 휴식 계산 가능 비율.

### 테스트
- `haversine_km`(잠실 → 사직 약 320km, ±15km), `coords`의 KeyError.
- 가짜 `fetch`로 캐시 동작(두 번째 호출은 fetch를 부르지 않음), 좌표 중복 제거, `HourlySeries.at`·`precip_sum`·None.
- 합성 일정으로 `team_game_rows`: 경기당 두 행, 돔 중립값, 이동 거리, 휴식일 다음 경기, 더블헤더, 상대 선발 짧은·긴 휴식, 주말·낮 경기, 날씨 결측 표시.
- `enrich_scenes_weather`: 돔은 None 유지.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
npm run data -- --only snapshot,context
.venv/Scripts/python -c "import json; r=json.load(open('data/build/context/team_games.json',encoding='utf-8')); n=len(r); m=sum(x['weather_missing'] for x in r)/n; assert n>=8000, n; assert m<0.05, m; print(n, 'rows, weather missing', round(m,4))"
```

(worktree에서는 `npm run data` 앞에 `TMI_RAW_DIR="C:/Users/김재일/Desktop/aiwanted/data/raw"`를 붙인다. 날씨 첫 수집은 네트워크로 몇 분 걸릴 수 있다.)

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 변환 규칙을 `contract.transform_value`로만 쓰는가? (measured.json이 원본)
   - ADR-007 의존성만 쓰는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (날씨 캐시·생성물 커밋 없음)
3. 결과에 따라 `phases/2-data/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`(행 수·결측 비율 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 날씨 API 접속 자체가 막히면 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- Open-Meteo 외 네트워크 호출을 하지 마라. 이유: 네이버 원자료는 캐시만 쓴다(ADR-005).
- 결측 날씨를 평균값 추정 등으로 채우지 마라. 중립값 + `weather_missing` 표시만 한다. 이유: 검증에 가짜 신호가 섞인다.
- 효과 추정·모델 적합을 이 step에서 하지 마라. 이유: 다음 step의 범위다.
- `src/`를 수정하지 마라.
- 기존 테스트를 깨뜨리지 마라.
