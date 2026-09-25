import copy
import json
from datetime import datetime, timedelta

import pytest

from tmi_pipeline import build, context, stadiums, weather

ROW_KEYS = [
    "game_id", "date", "season", "team", "opp", "stadium", "home", "runs", "start_hour",
    "temp_c", "wind_ms", "rain_pre3h", "day_game", "weekend", "travel_km", "after_off_day",
    "starter_short_rest", "starter_long_rest", "opp_starter_rest_days", "weather_missing", "dome",
]


def sched(game_id, when, stadium, away, home, a_score, h_score, *, away_starter="", home_starter="",
          status="RESULT", cancel=False, suspended=False, round_code="kbo_r"):
    """네이버 일정 경기 모양의 합성 행(선발 이름은 가짜)."""
    return {
        "gameId": game_id, "gameDate": when[:10], "gameDateTime": f"{when}:00", "stadium": stadium,
        "awayTeamCode": away, "homeTeamCode": home, "awayTeamScore": a_score, "homeTeamScore": h_score,
        "statusCode": status, "cancel": cancel, "suspended": suspended, "roundCode": round_code,
        "awayStarterName": away_starter, "homeStarterName": home_starter,
    }


def series(start: str, days: int, *, temp=25.0, wind=2.0, precip=0.0, overrides=None) -> weather.HourlySeries:
    """모든 시각 같은 값인 합성 시계열. overrides {"YYYY-MM-DDTHH:00": (temp, wind, precip)}로 시각별 값을 바꾼다."""
    t0 = datetime.fromisoformat(start)
    times = [(t0 + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(days * 24)]
    temps, winds, precs = [temp] * len(times), [wind] * len(times), [precip] * len(times)
    for stamp, (t, w, p) in (overrides or {}).items():
        i = times.index(stamp)
        temps[i], winds[i], precs[i] = t, w, p
    return weather.HourlySeries({"hourly": {"time": times, "temperature_2m": temps, "wind_speed_10m": winds, "precipitation": precs}})


@pytest.fixture()
def season_games():
    # 2026-04-03(금) ~ 04-12. LT·HT 중심의 짧은 합성 시즌 + 걸러져야 할 경기들
    return [
        sched("g4", "2026-04-07T18:30", "잠실", "LT", "LG", 2, 6, away_starter="롯선발B", home_starter="엘선발A"),
        sched("g1", "2026-04-03T18:30", "사직", "HT", "LT", 3, 5, away_starter="기선발A", home_starter="롯선발A"),
        sched("g2", "2026-04-04T17:00", "사직", "HT", "LT", 1, 2, away_starter="기선발B", home_starter="롯선발B"),
        sched("g3", "2026-04-05T14:00", "사직", "HT", "LT", 4, 4, away_starter="", home_starter="롯선발C"),
        sched("g5", "2026-04-08T18:30", "고척", "LT", "WO", 7, 1, away_starter="롯선발A", home_starter="키선발A"),
        sched("g6a", "2026-04-11T14:00", "광주", "LT", "HT", 0, 3, away_starter="롯선발C", home_starter="기선발A"),
        sched("g6b", "2026-04-11T18:30", "광주", "LT", "HT", 5, 4, away_starter="롯선발A", home_starter="기선발B"),
        sched("x-cancel", "2026-04-09T18:30", "잠실", "LT", "OB", 0, 0, status="BEFORE", cancel=True),
        sched("x-post", "2026-04-10T18:30", "잠실", "LT", "OB", 3, 2, round_code="kbo_ps_wd"),
        sched("x-susp", "2026-04-10T18:30", "대구", "HT", "SS", 1, 1, suspended=True),
        sched("x-before", "2026-04-12T18:30", "잠실", "LT", "OB", 0, 0, status="BEFORE"),
        sched("p1", "2025-09-30T18:30", "문학", "SK", "LT", 2, 3, away_starter="에선발A", home_starter="롯선발A"),
    ]


@pytest.fixture()
def weather_by_stadium():
    base = series("2025-09-30T00:00", 14)
    return {
        "사직": series("2026-04-03T00:00", 3, temp=14.0, wind=3.5, precip=0.0, overrides={
            "2026-04-03T16:00": (15.0, 3.0, 0.6), "2026-04-03T17:00": (15.2, 3.1, 0.3),
            "2026-04-03T18:00": (15.4, 4.2, 0.2), "2026-04-03T15:00": (15.0, 3.0, 9.9),
        }),
        "잠실": series("2026-04-07T00:00", 1, temp=18.0, wind=1.0, overrides={"2026-04-07T18:00": (17.5, None, 0.0)}),
        "광주": series("2026-04-11T00:00", 1, temp=21.0, wind=2.4),
        "문학": base,
    }


def by_team_game(rows):
    return {(r["game_id"], r["team"]): r for r in rows}


def test_regular_completed_filters_and_orders(season_games):
    games = context.regular_completed(season_games)
    assert [g["gameId"] for g in games] == ["p1", "g1", "g2", "g3", "g4", "g5", "g6a", "g6b"]


def test_team_game_rows_two_rows_per_game_with_contract_fields(season_games, weather_by_stadium):
    rows = context.team_game_rows(season_games, weather_by_stadium)
    assert len(rows) == 2 * 8
    assert all(list(r) == ROW_KEYS for r in rows)
    assert [(r["game_id"], r["team"], r["home"]) for r in rows[2:4]] == [("g1", "HT", 0), ("g1", "LT", 1)]
    g1_ht = by_team_game(rows)[("g1", "HT")]
    assert (g1_ht["date"], g1_ht["season"], g1_ht["opp"], g1_ht["stadium"], g1_ht["runs"]) == ("2026-04-03", 2026, "LT", "사직", 3)
    assert by_team_game(rows)[("g1", "LT")]["runs"] == 5


def test_weather_at_start_hour_and_rain_before_start(season_games, weather_by_stadium):
    row = by_team_game(context.team_game_rows(season_games, weather_by_stadium))[("g1", "LT")]
    # 18:30 시작 → 18시 기온·풍속, 강수는 16·17·18시 값(15~18시) 합
    assert (row["temp_c"], row["wind_ms"], row["rain_pre3h"]) == (15.4, 4.2, 1.1)
    assert row["weather_missing"] == 0
    assert row["start_hour"] == 18.5


def test_dome_uses_neutral_weather(season_games, weather_by_stadium):
    row = by_team_game(context.team_game_rows(season_games, weather_by_stadium))[("g5", "WO")]
    assert (row["temp_c"], row["wind_ms"], row["rain_pre3h"], row["dome"], row["weather_missing"]) == (20.0, 0.0, 0.0, 1, 0)


def test_missing_weather_is_neutral_and_flagged(season_games, weather_by_stadium):
    rows = by_team_game(context.team_game_rows(season_games, weather_by_stadium))
    # 잠실 18시 풍속이 비었다 → 세 값 모두 중립, 결측 표시
    jamsil = rows[("g4", "LG")]
    assert (jamsil["temp_c"], jamsil["wind_ms"], jamsil["rain_pre3h"], jamsil["weather_missing"], jamsil["dome"]) == (20.0, 0.0, 0.0, 1, 0)
    # 사직 04-05 14시는 시계열 범위(04-03~04-05) 안, 11시~14시 강수도 있음 → 결측 아님
    assert rows[("g3", "HT")]["weather_missing"] == 0
    no_series = by_team_game(context.team_game_rows(season_games, {}))
    assert no_series[("g1", "HT")]["weather_missing"] == 1
    assert no_series[("g5", "LT")]["weather_missing"] == 0  # 돔은 날씨가 필요 없다


def test_neutral_weather_transforms_to_zero():
    from tmi_pipeline.contract import measured_by_id, transform_value

    defs = measured_by_id()
    neutral = {"temp_c": context.NEUTRAL_TEMP_C, "wind_ms": context.NEUTRAL_WIND_MS, "rain_pre3h": context.NEUTRAL_RAIN_MM}
    assert all(transform_value(defs[k], v) == 0.0 for k, v in neutral.items())


def test_day_game_and_weekend(season_games, weather_by_stadium):
    rows = by_team_game(context.team_game_rows(season_games, weather_by_stadium))
    assert (rows[("g1", "LT")]["day_game"], rows[("g1", "LT")]["weekend"]) == (0, 0)  # 금 18:30
    assert (rows[("g2", "LT")]["day_game"], rows[("g2", "LT")]["weekend"]) == (0, 1)  # 토 17:00
    assert (rows[("g3", "LT")]["day_game"], rows[("g3", "LT")]["weekend"]) == (1, 1)  # 일 14:00


def test_travel_km_from_previous_game_in_the_same_season(season_games, weather_by_stadium):
    rows = by_team_game(context.team_game_rows(season_games, weather_by_stadium))
    jamsil_sajik = round(stadiums.haversine_km(stadiums.coords("사직"), stadiums.coords("잠실")), 1)
    assert rows[("g1", "LT")]["travel_km"] == 0.0  # 시즌 첫 경기(2025 경기는 다른 시즌)
    assert rows[("g2", "LT")]["travel_km"] == 0.0  # 같은 구장
    assert rows[("g4", "LT")]["travel_km"] == jamsil_sajik
    assert rows[("g4", "LG")]["travel_km"] == 0.0
    assert rows[("g5", "LT")]["travel_km"] == round(stadiums.haversine_km(stadiums.coords("잠실"), stadiums.coords("고척")), 1)
    assert rows[("g6b", "LT")]["travel_km"] == 0.0  # 더블헤더 두 번째 경기


def test_after_off_day(season_games, weather_by_stadium):
    rows = by_team_game(context.team_game_rows(season_games, weather_by_stadium))
    assert rows[("g1", "LT")]["after_off_day"] == 0  # 시즌 첫 경기
    assert rows[("g2", "LT")]["after_off_day"] == 0  # 하루 차이
    assert rows[("g4", "LT")]["after_off_day"] == 1  # 04-05 → 04-07
    assert rows[("g6a", "LT")]["after_off_day"] == 1  # 04-08 → 04-11
    assert rows[("g6b", "LT")]["after_off_day"] == 0  # 더블헤더


def test_opponent_starter_rest(season_games, weather_by_stadium):
    rows = by_team_game(context.team_game_rows(season_games, weather_by_stadium))
    # HT 행의 상대 선발은 LT 선발. 롯선발A: 04-03 첫 선발 → None
    assert (rows[("g1", "HT")]["opp_starter_rest_days"], rows[("g1", "HT")]["starter_short_rest"], rows[("g1", "HT")]["starter_long_rest"]) == (None, 0, 0)
    # 롯선발A 04-03 → 04-08: 5일(중간)
    assert (rows[("g5", "WO")]["opp_starter_rest_days"], rows[("g5", "WO")]["starter_short_rest"], rows[("g5", "WO")]["starter_long_rest"]) == (5, 0, 0)
    # 롯선발B 04-04 → 04-07: 3일(짧은 휴식)
    assert (rows[("g4", "LG")]["opp_starter_rest_days"], rows[("g4", "LG")]["starter_short_rest"], rows[("g4", "LG")]["starter_long_rest"]) == (3, 1, 0)
    # 롯선발C 04-05 → 04-11: 6일, 롯선발A 04-08 → 04-11: 3일
    assert rows[("g6a", "HT")]["opp_starter_rest_days"] == 6
    assert (rows[("g6b", "HT")]["opp_starter_rest_days"], rows[("g6b", "HT")]["starter_short_rest"]) == (3, 1)
    # 기선발A 04-03 → 04-11: 8일(긴 휴식)
    assert (rows[("g6a", "LT")]["opp_starter_rest_days"], rows[("g6a", "LT")]["starter_long_rest"], rows[("g6a", "LT")]["starter_short_rest"]) == (8, 1, 0)
    # 선발 이름이 없으면 계산하지 않는다
    assert (rows[("g3", "LT")]["opp_starter_rest_days"], rows[("g3", "LT")]["starter_short_rest"], rows[("g3", "LT")]["starter_long_rest"]) == (None, 0, 0)


def test_starter_rest_does_not_cross_seasons(season_games, weather_by_stadium):
    rows = by_team_game(context.team_game_rows(season_games, weather_by_stadium))
    assert rows[("p1", "SK")]["opp_starter_rest_days"] is None
    assert rows[("g1", "HT")]["opp_starter_rest_days"] is None  # 2025-09-30 롯선발A 선발은 다른 시즌


def _scene(scene_id, date, stadium, away, home, dome=False):
    return {
        "id": scene_id, "date": date, "stadium": stadium,
        "away": {"code": away, "name": away, "final": 0}, "home": {"code": home, "name": home, "final": 0},
        "context": {"tempC": None, "windMs": None, "dayGame": False, "dome": dome},
    }



def _write_month(raw_dir, name, games):
    path = raw_dir / "naver" / "schedule" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"result": {"games": games}}, ensure_ascii=False), encoding="utf-8")


def test_context_stage_writes_rows_and_leaves_app_files_alone(tmp_path, season_games, monkeypatch):
    raw, out = tmp_path / "raw", tmp_path / "build"
    _write_month(raw, "sched_full_2025-09.json", [g for g in season_games if g["gameDate"] < "2026"])
    _write_month(raw, "sched_full_2026-04.json", [g for g in season_games if g["gameDate"] >= "2026"])
    # 옛 장면 파일이 남아 있어도 이 단계는 건드리지 않는다(ADR-032: 장면을 더 만들지 않는다)
    scenes_path = out / "app" / "scenes.json"
    scenes_path.parent.mkdir(parents=True)
    before = json.dumps([_scene("g1-3", "2026-04-03", "사직", "HT", "LT")], ensure_ascii=False)
    scenes_path.write_text(before, encoding="utf-8")

    requested = []

    def fake_load(names, start, end, cache_dir, **kwargs):
        requested.append((sorted(names), start, end, cache_dir))
        return {name: series("2021-03-01T00:00", 1, temp=0.0) if name != "사직" else series("2026-04-03T00:00", 2, temp=16.0, wind=2.5)
                for name in names}

    monkeypatch.setattr(context, "load_stadium_series", fake_load)
    summary = build.STAGES["context"](raw, out)

    [(names, start, end, cache_dir)] = requested
    assert "고척" not in names and {"사직", "잠실", "광주", "문학"} <= set(names)
    assert (start, end, cache_dir) == ("2021-03-01", "2026-04-11", raw / "weather")

    rows = json.loads((out / "context" / "team_games.json").read_text(encoding="utf-8"))
    assert len(rows) == 16
    assert summary["rows"] == 16
    assert summary["games_by_season"] == {"2025": 1, "2026": 7}
    assert summary["weather_missing_ratio"] == pytest.approx(sum(r["weather_missing"] for r in rows) / 16, abs=1e-4)
    assert summary["starter_rest_ratio"] == pytest.approx(sum(r["opp_starter_rest_days"] is not None for r in rows) / 16, abs=1e-4)
    assert scenes_path.read_text(encoding="utf-8") == before
    assert "scenes" not in summary


def test_context_stage_without_scenes_file(tmp_path, season_games, monkeypatch):
    raw, out = tmp_path / "raw", tmp_path / "build"
    _write_month(raw, "sched_full_2026-04.json", season_games)
    monkeypatch.setattr(context, "load_stadium_series", lambda names, start, end, cache_dir, **kwargs: {})
    summary = build.STAGES["context"](raw, out)
    assert summary["rows"] == 16
    assert not (out / "app" / "scenes.json").exists()
