"""앱 스냅숏: 문자중계·시즌 기록 → data/build/app/core.json, pitches.json, scenes.json.

reference/tmi-prototype/build_data.py의 SCENARIOS와 main()(카운트 표, 장면 조립, 라인업·타순, 투수 손 추정)에서 이식했다.
출력 필드 이름은 src/types/data.ts(CoreData, PitchData, SceneRecord, PlayerRecord, BullpenRecord)와 같다.
선수 사진·엠블럼 URL은 싣지 않는다(ADR-005).
"""

import random
import statistics
from datetime import datetime, timezone
from pathlib import Path

from .contract import PITCH_RESULT_CODE, PITCH_TYPES
from .io import load_json, relay_game_paths, season_stats_path, write_json
from .relay import NOTE_TYPES, PlateAppearance, chrono, load_game, pitch_row, plate_appearances, walk_pitches
from .stats import SeasonRates, bullpen, season_rates

SEASON = 2026
SEED = 2026
PITCHER_SAMPLE_CAP = 300
POOL_SAMPLE_CAP = 600
MIN_SCENE_INNING = 6
DAY_GAME_BEFORE_HOUR = 17
DOME_STADIUM = "고척"
SOURCES = ["네이버 스포츠 KBO 문자중계·기록", "TMI 야구 파이프라인"]

# 직접 고른 명장면(build_data.py SCENARIOS 그대로)
CURATED = [
    {"id": "walkoff-slam", "game": "20260825LTHT02026", "inning": 9, "half": 1, "batter": "이호연", "title": "9회말 2사 만루, 대타 한 방"},
    {"id": "walkoff-walk", "game": "20260902HTNC02026", "inning": 9, "half": 1, "batter": "김형준", "title": "9회말 2사 만루, 제구 싸움"},
    {"id": "extra-go-ahead", "game": "20260830NCHH02026", "inning": 10, "half": 0, "batter": "천재환", "title": "10회초 2사 2·3루, 마무리와 승부"},
    {"id": "eleventh-last", "game": "20260910NCHT02026", "inning": 11, "half": 1, "batter": "김선빈", "title": "11회말 1사 1·3루, 마지막 이닝"},
]

OUTS_TEXT = ["무사", "1사", "2사", "3아웃"]
ONES = [1.0] * 7


def count_table(games: list[dict]) -> list[list[float]]:
    """카운트(인덱스 balls*3+strikes)별 투구 결과 [B, T, S, F, X] 비율, 소수 넷째 자리.

    투구가 하나도 없는 카운트는 합 1을 지키도록 다섯 결과를 똑같이 나눈다.
    """
    counts = [[0] * 5 for _ in range(12)]
    for game in games:
        for pa in plate_appearances(game):
            for t, _, balls, strikes in walk_pitches(pa.options, pa.pts_by_id):
                counts[balls * 3 + strikes][PITCH_RESULT_CODE[t["pitchResult"]]] += 1
    table = []
    for row in counts:
        n = sum(row)
        table.append([round(c / n, 4) for c in row] if n else [0.2] * 5)
    return table


def pitches_by_pitcher(games: list[dict]) -> dict[str, list[list]]:
    """추적(PTS)된 모든 투구 행을 던진 투수별로. 투수는 투구 옵션의 현재 투수, 없으면 타석 시작 투수."""
    by_pitcher: dict[str, list[list]] = {}
    for game in games:
        for pa in plate_appearances(game):
            for t, pts, balls, strikes in walk_pitches(pa.options, pa.pts_by_id):
                if pts is None:
                    continue
                pitcher = (t.get("currentGameState") or {}).get("pitcher") or pa.pitcher_id
                by_pitcher.setdefault(str(pitcher), []).append(pitch_row(t, pts, balls, strikes))
    return by_pitcher


def infer_throws(rows: list[list]) -> str:
    """릴리스 x0 중앙값이 +면 좌투("L"), 아니면 우투("R"). 행이 없으면 "R"."""
    if not rows:
        return "R"
    return "L" if statistics.median(row[6] for row in rows) > 0 else "R"


def sample_rows(rows: list[list], cap: int, seed: int) -> list[list]:
    """(code, stance) 층 비율을 지키며 최대 cap개를 뽑는다. 원래 순서를 유지하고 같은 seed면 같은 결과."""
    rows = list(rows)
    if len(rows) <= cap:
        return rows
    strata: dict[tuple, list[int]] = {}
    for i, row in enumerate(rows):
        strata.setdefault((row[2], row[5]), []).append(i)
    keys = sorted(strata)
    exact = {key: cap * len(strata[key]) / len(rows) for key in keys}
    quota = {key: int(exact[key]) for key in keys}
    # 남는 자리는 소수 부분이 큰 층부터(최대 잉여 방식)
    for key in sorted(keys, key=lambda k: (-(exact[k] - quota[k]), k))[: cap - sum(quota.values())]:
        quota[key] += 1
    rng = random.Random(seed)
    chosen: list[int] = []
    for key in keys:
        chosen.extend(rng.sample(strata[key], quota[key]))
    return [rows[i] for i in sorted(chosen)]


def situation_text(inning: int, half: int, outs: int, bases: int) -> str:
    """"9회말 2사 만루", "8회초 무사 1·3루", "3회초 1사 주자 없음" (src/domain/format.ts situationText와 같은 규칙)."""
    if bases == 0:
        runners = "주자 없음"
    elif bases == 7:
        runners = "만루"
    else:
        runners = "·".join(str(b) for b in (1, 2, 3) if bases >> (b - 1) & 1) + "루"
    return f"{inning}회{'말' if half else '초'} {OUTS_TEXT[min(outs, 3)]} {runners}"


def _set_lineup(lineups: dict[str, list], pa: PlateAppearance) -> None:
    if 1 <= pa.bat_order <= 9:
        lineups[pa.side][pa.bat_order - 1] = pa.batter_id


def scene_candidates(games: list[dict], exclude_game_ids: set[str], top_n: int = 12) -> list[tuple[dict, int]]:
    """자동 장면 후보 (경기, 타석 인덱스).

    6회 이후, 네이버 wpa가 유효, 이번 타자까지 양 팀 타순 1~9번이 모두 나온 타석 중 경기마다 |wpa|가 가장 큰 하나를 고르고
    |wpa| 큰 경기 순으로 top_n개.
    """
    best: list[tuple[float, str, int, dict]] = []
    for game in games:
        game_id = game["game"]["gameId"]
        if game_id in exclude_game_ids:
            continue
        lineups: dict[str, list] = {"away": [None] * 9, "home": [None] * 9}
        pick: PlateAppearance | None = None
        for pa in plate_appearances(game):
            _set_lineup(lineups, pa)
            if pa.inning < MIN_SCENE_INNING or pa.wpa is None:
                continue
            if any(pid is None for side in lineups.values() for pid in side):
                continue
            if pick is None or abs(pa.wpa) > abs(pick.wpa):
                pick = pa
        if pick is not None:
            best.append((abs(pick.wpa), game_id, pick.index, game))
    best.sort(key=lambda item: (-item[0], item[1], item[2]))
    return [(game, index) for _, _, index, game in best[:top_n]]


def _bats(hit_type: str) -> str:
    if "양타" in hit_type:
        return "S"
    return "L" if "좌타" in hit_type else "R"


def _hitter_record(pid: str, rates: SeasonRates, name: str, hit_type: str, team: str) -> dict:
    season = rates.hitters.get(pid)
    record = {"id": pid, "kind": "H", "bats": _bats(hit_type)}
    if season:
        return {**record, "name": season["name"], "team": season["team"], "rel": season["rel"], "line": season["line"]}
    return {**record, "name": name, "team": team, "rel": list(ONES), "line": {}}


def _pitcher_record(pid: str, rates: SeasonRates, names: dict[str, str], throws_by_pitcher: dict[str, str], team: str) -> dict:
    season = rates.pitchers.get(pid)
    record = {"id": pid, "kind": "P", "throws": throws_by_pitcher.get(pid, "R")}
    if season:
        return {**record, "name": season["name"], "team": season["team"], "rel": season["rel"], "line": season["line"]}
    return {**record, "name": names.get(pid, pid), "team": team, "rel": list(ONES), "line": {}}


def _substitution_names(game: dict) -> dict[str, str]:
    """교체 기록(playerChange)에 나온 선수 id → 이름."""
    names: dict[str, str] = {}
    for item in chrono(game):
        for t in item["textOptions"]:
            change = t.get("playerChange") or {}
            for key in ("inPlayer", "outPlayer"):
                person = change.get(key) or {}
                if person.get("playerId") and person.get("playerName"):
                    names[str(person["playerId"])] = person["playerName"]
    return names


def _scene_team(meta: dict, side: str) -> dict:
    return {"code": meta[f"{side}TeamCode"], "name": meta[f"{side}TeamName"], "final": int(meta[f"{side}TeamScore"])}


def build_scene(
    game: dict,
    pa_index: int,
    source: str,
    title: str,
    rates: SeasonRates,
    throws_by_pitcher: dict[str, str],
    players: dict[str, dict] | None = None,
) -> dict:
    """한 타석을 SceneRecord로. players를 주면 라인업 타자와 장면 투수의 PlayerRecord를 채운다."""
    meta = game["game"]
    pas = plate_appearances(game)
    target = pas[pa_index]
    lineups: dict[str, list] = {"away": [None] * 9, "home": [None] * 9}
    hit_types: dict[str, str] = {}
    names: dict[str, str] = {}
    last_order = {"away": 0, "home": 0}
    wp_before = None
    for pa in pas[:pa_index]:
        _set_lineup(lineups, pa)
        hit_types[pa.batter_id] = pa.hit_type
        names[pa.batter_id] = pa.batter_name
        last_order[pa.side] = pa.bat_order
        if pa.wp_home_after is not None:
            wp_before = pa.wp_home_after
    _set_lineup(lineups, target)
    hit_types[target.batter_id] = target.hit_type
    names[target.batter_id] = target.batter_name

    fielding = "home" if target.side == "away" else "away"
    slots = {target.side: target.bat_order - 1, fielding: last_order[fielding] % 9}
    scene = {
        "id": f"{meta['gameId']}-{pa_index}",
        "source": source,
        "title": title,
        "date": meta["gameDate"],
        "stadium": meta["stadium"],
        "away": _scene_team(meta, "away"),
        "home": _scene_team(meta, "home"),
        "state": {**target.state, "slotAway": slots["away"], "slotHome": slots["home"]},
        "batter": target.batter_id,
        "pitcher": target.pitcher_id,
        "lineups": lineups,
        "leverage": abs(target.wpa) if target.wpa is not None else 0.0,
        "naverWpBeforeHome": wp_before,
        "actual": {
            "result": target.result_text,
            "event": target.event,
            "runs": target.runs_in,
            "notes": [t.get("text") or "" for t in target.options if t.get("type") in NOTE_TYPES],
            "pitches": [
                pitch_row(t, pts, balls, strikes)
                for t, pts, balls, strikes in walk_pitches(target.options, target.pts_by_id)
                if pts is not None
            ],
            "wpAfterHome": target.wp_home_after,
        },
        "context": {
            "tempC": None,
            "windMs": None,
            "dayGame": datetime.fromisoformat(meta["gameDateTime"]).hour < DAY_GAME_BEFORE_HOUR,
            "dome": meta["stadium"] == DOME_STADIUM,
        },
    }
    if players is not None:
        teams = {"away": meta["awayTeamCode"], "home": meta["homeTeamCode"]}
        for side in ("away", "home"):
            for pid in lineups[side]:
                if pid is not None:
                    players[pid] = _hitter_record(pid, rates, names.get(pid, pid), hit_types.get(pid, ""), teams[side])
        players[target.pitcher_id] = _pitcher_record(
            target.pitcher_id, rates, _substitution_names(game), throws_by_pitcher, teams[fielding]
        )
    return scene


def _season_rows(raw_dir: Path, kind: str) -> list[dict]:
    return load_json(season_stats_path(raw_dir, SEASON, kind))["result"]["seasonPlayerStats"]


def build_snapshot(raw_dir: Path) -> dict:
    """{"core": CoreData, "pitches": PitchData, "scenes": SceneRecord[]}."""
    rates = season_rates(_season_rows(raw_dir, "HITTER"), _season_rows(raw_dir, "PITCHER"))
    games = [load_game(path) for path in relay_game_paths(raw_dir)]
    by_id = {game["game"]["gameId"]: game for game in games}
    by_pitcher = pitches_by_pitcher(games)
    throws = {pid: infer_throws(rows) for pid, rows in by_pitcher.items()}

    players: dict[str, dict] = {}
    scenes: list[dict] = []
    for cur in CURATED:
        game = by_id.get(cur["game"])
        if game is None:
            print(f"[snapshot] 경고: 선정 장면 {cur['id']} — 경기 {cur['game']}가 원자료에 없어 건너뜀")
            continue
        pa = next(
            (p for p in plate_appearances(game) if p.inning == cur["inning"] and p.half == cur["half"] and p.batter_name == cur["batter"]),
            None,
        )
        if pa is None:
            print(f"[snapshot] 경고: 선정 장면 {cur['id']} — {cur['inning']}회 {'말' if cur['half'] else '초'} {cur['batter']} 타석을 찾지 못해 건너뜀")
            continue
        scene = build_scene(game, pa.index, "curated", cur["title"], rates, throws, players=players)
        scene["id"] = cur["id"]
        scenes.append(scene)
    for game, index in scene_candidates(games, {cur["game"] for cur in CURATED}):
        state = plate_appearances(game)[index].state
        title = situation_text(state["inning"], state["half"], state["outs"], state["bases"])
        scenes.append(build_scene(game, index, "auto", title, rates, throws, players=players))
    scenes.sort(key=lambda s: (s["date"], s["id"]))

    bullpens: dict[str, dict] = {}
    for scene in scenes:
        for code in (scene["away"]["code"], scene["home"]["code"]):
            if code not in bullpens:
                bullpens[code] = bullpen(rates, code)

    dates = sorted(game["game"]["gameDate"] for game in games)
    core = {
        "meta": {
            "season": SEASON,
            "relayRange": [dates[0], dates[-1]] if dates else ["", ""],
            "relayGames": len(games),
            "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "sources": list(SOURCES),
        },
        "league": [round(x, 5) for x in rates.league_hitting],
        "countTable": count_table(games),
        "players": players,
        "bullpens": bullpens,
    }

    pools: dict[str, list[list]] = {"L": [], "R": []}
    for pid, rows in by_pitcher.items():
        pools[throws[pid]].extend(rows)
    pitches = {
        "pitchTypes": list(PITCH_TYPES),
        "byPitcher": {
            pid: sample_rows(by_pitcher.get(pid, []), PITCHER_SAMPLE_CAP, SEED)
            for pid in sorted({scene["pitcher"] for scene in scenes})
        },
        "pools": {hand: sample_rows(rows, POOL_SAMPLE_CAP, SEED) for hand, rows in pools.items()},
    }
    return {"core": core, "pitches": pitches, "scenes": scenes}


def write_snapshot(raw_dir: Path, out_dir: Path) -> dict:
    """build stage "snapshot": out_dir/app/core.json·pitches.json·scenes.json을 쓰고 요약을 돌려준다."""
    data = build_snapshot(raw_dir)
    app_dir = Path(out_dir) / "app"
    kb: dict[str, float] = {}
    for key in ("core", "pitches", "scenes"):
        path = app_dir / f"{key}.json"
        write_json(path, data[key])
        kb[path.name] = round(path.stat().st_size / 1024, 1)
    scenes = data["scenes"]
    curated = sum(1 for scene in scenes if scene["source"] == "curated")
    return {
        "scenes": len(scenes),
        "curated": curated,
        "auto": len(scenes) - curated,
        "players": len(data["core"]["players"]),
        "kb": kb,
    }
