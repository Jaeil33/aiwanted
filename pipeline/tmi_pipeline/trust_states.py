"""엔진 신뢰도 리포트 입력: 2026 중계 타석의 시작 상태·라인업·투수·네이버 승리확률과 경기 결과(정답).

선수 능력치는 2025 시즌 기록으로만 만든다(2026 경기 검증에 2026 기록을 쓰면 미래 정보가 섞인다).
엔진 확률은 여기서 계산하지 않는다(scripts/trust-report.ts가 src/engine으로 계산한다).
네이버 승리확률은 유효성 필터와 /100 외에 가공하지 않는다.
"""

from pathlib import Path
from typing import Any, Callable

from . import io
from .io import relay_game_paths, season_stats_path, write_json
from .relay import load_game, plate_appearances
from .stats import bullpen, season_rates

SEASON = 2025
LINEUP_SIZE = 9


def _season_rows(raw_dir: Path, kind: str, load_json: Callable[[Path], Any]) -> list[dict]:
    return load_json(season_stats_path(raw_dir, SEASON, kind))["result"]["seasonPlayerStats"]


def game_states(game: dict) -> dict:
    """한 경기의 결과와 타석 상태 목록. 직전 유효 승리확률이 없는 타석(경기 첫 타석 등)은 뺀다.

    투수는 타석 첫 투구의 투수(PlateAppearance.pitcher_id, ADR-014)다.
    """
    meta = game["game"]
    lineups: dict[str, list[str | None]] = {"away": [None] * LINEUP_SIZE, "home": [None] * LINEUP_SIZE}
    last_order = {"away": 0, "home": 0}
    wp_before: float | None = None
    pas = []
    for pa in plate_appearances(game):
        # 결과 옵션이 없는 미완료 타석(주루사로 이닝이 끝났거나 타석 도중 대타)은 같은 상황이 다음 타석으로 이어지므로
        # 상태에서 빼고 타순 진행에도 세지 않는다.
        if not pa.complete:
            continue
        if 1 <= pa.bat_order <= LINEUP_SIZE:
            lineups[pa.side][pa.bat_order - 1] = pa.batter_id
        if wp_before is not None:
            fielding = "home" if pa.side == "away" else "away"
            slots = {pa.side: max(pa.bat_order - 1, 0), fielding: last_order[fielding] % LINEUP_SIZE}
            pas.append({
                **pa.state,
                "slotAway": slots["away"],
                "slotHome": slots["home"],
                "lineupAway": list(lineups["away"]),
                "lineupHome": list(lineups["home"]),
                "pitcher": pa.pitcher_id,
                "naverHomeWp": wp_before,
            })
        last_order[pa.side] = pa.bat_order
        if pa.wp_home_after is not None:
            wp_before = pa.wp_home_after
    home, away = int(meta["homeTeamScore"]), int(meta["awayTeamScore"])
    return {
        "gameId": meta["gameId"],
        "date": meta["gameDate"],
        "away": meta["awayTeamCode"],
        "home": meta["homeTeamCode"],
        "homeWin": 1 if home > away else 0 if away > home else None,
        "pas": pas,
    }


def build_trust_states(raw_dir: Path, load_json: Callable[[Path], Any] = io.load_json) -> dict:
    """{"season": 2025, "league", "players": {id: rel}, "bullpens": {팀: rel}, "games": [...]}.

    players는 타석 라인업 타자(2025 타자 기록)와 타석 투수(2025 투수 기록) 중 기록이 있는 선수만 담는다.
    load_json은 시즌 기록 파일을 읽는 함수다(테스트에서 요청 경로를 기록한다).
    """
    rates = season_rates(_season_rows(raw_dir, "HITTER", load_json), _season_rows(raw_dir, "PITCHER", load_json))
    games = [game_states(load_game(path)) for path in relay_game_paths(raw_dir)]

    batters: set[str] = set()
    pitchers: set[str] = set()
    teams: set[str] = set()
    for game in games:
        teams.update((game["away"], game["home"]))
        for pa in game["pas"]:
            batters.update(pid for pid in pa["lineupAway"] + pa["lineupHome"] if pid is not None)
            pitchers.add(pa["pitcher"])
    players: dict[str, list[float]] = {}
    for pid in sorted(batters):
        if pid in rates.hitters:
            players[pid] = rates.hitters[pid]["rel"]
    for pid in sorted(pitchers):
        if pid in rates.pitchers:
            players[pid] = rates.pitchers[pid]["rel"]
    return {
        "season": SEASON,
        "league": [round(x, 5) for x in rates.league_hitting],
        "players": players,
        "bullpens": {team: bullpen(rates, team)["rel"] for team in sorted(teams)},
        "games": games,
    }


def write_trust_states(raw_dir: Path, out_dir: Path) -> dict:
    """build stage "trust": out_dir/trust/states.json을 쓰고 요약을 돌려준다."""
    data = build_trust_states(raw_dir)
    path = Path(out_dir) / "trust" / "states.json"
    write_json(path, data)
    pas = [pa for game in data["games"] for pa in game["pas"]]
    total = len(pas)
    known = [pid for pa in pas for pid in pa["lineupAway"] + pa["lineupHome"] if pid is not None]
    return {
        "games": len(data["games"]),
        "plate_appearances": total,
        "tie_games": sum(game["homeWin"] is None for game in data["games"]),
        "lineup_null_ratio": round(1 - len(known) / (2 * LINEUP_SIZE * total), 4) if total else 0.0,
        "pitcher_2025_ratio": round(sum(pa["pitcher"] in data["players"] for pa in pas) / total, 4) if total else 0.0,
        "lineup_2025_ratio": round(sum(pid in data["players"] for pid in known) / len(known), 4) if known else 0.0,
        "players": len(data["players"]),
        "kb": round(path.stat().st_size / 1024, 1),
    }
