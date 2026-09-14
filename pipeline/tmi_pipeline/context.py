"""팀-경기 맥락 행: 정규시즌 완료 경기마다 두 팀의 득점과 실측 변수 원래 값(ADR-004).

값은 measured.json 단위의 원래 값으로 싣고, 효과 단위 변환(contract.transform_value)은 evidence가 한다.
결측 날씨는 추정하지 않고 중립값(변환하면 0) + weather_missing=1로 둔다.
"""

import copy
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

from . import snapshot
from .io import load_json, load_schedule_games, write_json
from .stadiums import DOMES, coords, haversine_km
from .weather import HourlySeries, load_stadium_series

WEATHER_START = "2021-03-01"

# 돔·결측 날씨의 중립값(transform_value로 바꾸면 0)
NEUTRAL_TEMP_C = 20.0
NEUTRAL_WIND_MS = 0.0
NEUTRAL_RAIN_MM = 0.0

RAIN_WINDOW_HOURS = 3
SHORT_REST_MAX_DAYS = 4
LONG_REST_MIN_DAYS = 8


def regular_completed(games: list[dict]) -> list[dict]:
    """정규시즌(kbo_r) 완료(RESULT) 경기 중 취소·서스펜디드가 아닌 것, 시작 시각 순."""
    kept = [
        g for g in games
        if g.get("roundCode") == "kbo_r" and g.get("statusCode") == "RESULT" and not g.get("cancel") and not g.get("suspended")
    ]
    return sorted(kept, key=lambda g: (g["gameDateTime"], g["gameId"]))


def _start(game: dict) -> datetime:
    return datetime.fromisoformat(game["gameDateTime"])


def _weather(game: dict, start: datetime, series_by_stadium: dict[str, HourlySeries]) -> tuple[float, float, float, int, int]:
    """(temp_c, wind_ms, rain_pre3h, weather_missing, dome)."""
    if game["stadium"] in DOMES:
        return NEUTRAL_TEMP_C, NEUTRAL_WIND_MS, NEUTRAL_RAIN_MM, 0, 1
    series = series_by_stadium.get(game["stadium"])
    if series is not None:
        hour = start.replace(minute=0, second=0, microsecond=0)
        values = series.at(hour)
        rain = series.precip_sum(hour - timedelta(hours=RAIN_WINDOW_HOURS), hour)
        if values is not None and values[0] is not None and values[1] is not None and rain is not None:
            return round(values[0], 2), round(values[1], 2), round(rain, 2), 0, 0
    return NEUTRAL_TEMP_C, NEUTRAL_WIND_MS, NEUTRAL_RAIN_MM, 1, 0


def team_game_rows(games: list[dict], series_by_stadium: dict[str, HourlySeries]) -> list[dict]:
    """정규시즌 완료 경기마다 원정·홈 두 행(그 팀의 공격 기준)."""
    rows: list[dict] = []
    last_game: dict[tuple[int, str], dict] = {}  # (시즌, 팀) → 직전 경기
    last_start: dict[tuple[int, str, str], datetime] = {}  # (시즌, 팀, 선발 이름) → 직전 선발 날짜
    for game in regular_completed(games):
        start = _start(game)
        day = start.date()
        season = int(game["gameDate"][:4])
        temp, wind, rain, missing, dome = _weather(game, start, series_by_stadium)
        for side, opp_side in (("away", "home"), ("home", "away")):
            team, opp = game[f"{side}TeamCode"], game[f"{opp_side}TeamCode"]
            previous = last_game.get((season, team))
            travel = round(haversine_km(coords(previous["stadium"]), coords(game["stadium"])), 1) if previous else 0.0
            off_day = 1 if previous is not None and (day - _start(previous).date()).days >= 2 else 0
            opp_starter = (game.get(f"{opp_side}StarterName") or "").strip()
            rest = None
            if opp_starter and (season, opp, opp_starter) in last_start:
                rest = (day - last_start[(season, opp, opp_starter)].date()).days
            rows.append({
                "game_id": game["gameId"],
                "date": game["gameDate"],
                "season": season,
                "team": team,
                "opp": opp,
                "stadium": game["stadium"],
                "home": 1 if side == "home" else 0,
                "runs": int(game[f"{side}TeamScore"]),
                "start_hour": round(start.hour + start.minute / 60, 2),
                "temp_c": temp,
                "wind_ms": wind,
                "rain_pre3h": rain,
                "day_game": 1 if start.hour < snapshot.DAY_GAME_BEFORE_HOUR else 0,
                "weekend": 1 if day.weekday() >= 5 else 0,
                "travel_km": travel,
                "after_off_day": off_day,
                "starter_short_rest": 1 if rest is not None and rest <= SHORT_REST_MAX_DAYS else 0,
                "starter_long_rest": 1 if rest is not None and rest >= LONG_REST_MIN_DAYS else 0,
                "opp_starter_rest_days": rest,
                "weather_missing": missing,
                "dome": dome,
            })
        for side in ("away", "home"):
            last_game[(season, game[f"{side}TeamCode"])] = game
            starter = (game.get(f"{side}StarterName") or "").strip()
            if starter:
                last_start[(season, game[f"{side}TeamCode"], starter)] = start
    return rows


def _scene_game(scene: dict, schedule_by_game: dict[str, dict]) -> dict | None:
    """장면의 일정 경기: 선정 장면 id → CURATED 경기, 자동 장면 id "gameId-타석" → gameId, 아니면 날짜·팀이 하나로 맞는 경기."""
    curated = {cur["id"]: cur["game"] for cur in snapshot.CURATED}
    game_id = curated.get(scene["id"])
    if game_id is None and "-" in scene["id"]:
        prefix = scene["id"].rsplit("-", 1)[0]
        if prefix in schedule_by_game:
            game_id = prefix
    if game_id is not None:
        return schedule_by_game.get(game_id)
    matches = [
        g for g in schedule_by_game.values()
        if g.get("gameDate") == scene["date"]
        and g.get("awayTeamCode") == scene["away"]["code"]
        and g.get("homeTeamCode") == scene["home"]["code"]
        and g.get("statusCode") == "RESULT"
        and not g.get("cancel")
    ]
    return matches[0] if len(matches) == 1 else None


def enrich_scenes_weather(scenes: list[dict], series_by_stadium: dict[str, HourlySeries], schedule_by_game: dict[str, dict]) -> list[dict]:
    """장면 context.tempC·windMs를 경기 시작 정시 값(소수 첫째 자리)으로 채운 복사본. 돔이나 값이 없으면 그대로."""
    enriched = []
    for original in scenes:
        scene = copy.deepcopy(original)
        ctx = scene["context"]
        game = _scene_game(scene, schedule_by_game)
        series = series_by_stadium.get(scene["stadium"])
        if not ctx.get("dome") and scene["stadium"] not in DOMES and game is not None and series is not None:
            values = series.at(_start(game))
            if values is not None:
                temp, wind, _ = values
                ctx["tempC"] = round(temp, 1) if temp is not None else None
                ctx["windMs"] = round(wind, 1) if wind is not None else None
        enriched.append(scene)
    return enriched


def write_context(raw_dir: Path, out_dir: Path) -> dict:
    """build stage "context": out_dir/context/team_games.json을 쓰고, out_dir/app/scenes.json이 있으면 날씨를 채워 다시 쓴다."""
    raw_dir, out_dir = Path(raw_dir), Path(out_dir)
    schedule = load_schedule_games(raw_dir)
    games = regular_completed(schedule)
    end = max((g["gameDate"] for g in games), default=WEATHER_START)
    scenes_path = out_dir / "app" / "scenes.json"
    scenes = load_json(scenes_path) if scenes_path.is_file() else None

    names = {g["stadium"] for g in games} | {s["stadium"] for s in scenes or []}
    series = load_stadium_series(sorted(n for n in names if n not in DOMES), WEATHER_START, end, raw_dir / "weather")

    rows = team_game_rows(games, series)
    write_json(out_dir / "context" / "team_games.json", rows)
    summary = {
        "rows": len(rows),
        "games_by_season": dict(sorted(Counter(g["gameDate"][:4] for g in games).items())),
        "weather_missing_ratio": round(sum(r["weather_missing"] for r in rows) / len(rows), 4) if rows else 0.0,
        "starter_rest_ratio": round(sum(r["opp_starter_rest_days"] is not None for r in rows) / len(rows), 4) if rows else 0.0,
        "weather_range": [WEATHER_START, end],
    }
    if scenes is not None:
        enriched = enrich_scenes_weather(scenes, series, {g["gameId"]: g for g in schedule})
        write_json(scenes_path, enriched)
        summary["scenes_with_weather"] = sum(1 for s in enriched if s["context"]["tempC"] is not None)
        summary["scenes"] = len(enriched)
    return summary
