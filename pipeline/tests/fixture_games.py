"""테스트용 합성 경기 도우미. pipeline/tests/fixtures의 합성 픽스처만 쓴다(원자료 금지)."""

import copy
import json
import shutil
from pathlib import Path

from tmi_pipeline import relay

FIXTURE_RAW = Path(__file__).parent / "fixtures" / "raw"
FIXTURE_GAME_ID = "20260815HTLT02026"


def load_fixture_game() -> dict:
    """원정 HT 대 홈 LT, 2이닝 27타석 픽스처 경기."""
    return json.loads((FIXTURE_RAW / "naver" / "relay" / f"{FIXTURE_GAME_ID}.json").read_text(encoding="utf-8"))


def shifted_game(base: dict, game_id: str, date: str, *, innings: int = 5, wpa_factor: float = 1.0, start: str = "18:00") -> dict:
    """픽스처 경기를 innings만큼 뒤 이닝으로 옮기고 gameId·날짜·시작 시각·wpa 크기를 바꾼 복사본.

    기본값이면 1·2회가 6·7회가 되어, 7회 타석은 양 팀 타순 1~9번이 모두 나온 뒤다.
    """
    game = copy.deepcopy(base)
    meta = game["game"]
    meta["gameId"] = game_id
    meta["gameDate"] = date
    meta["gameDateTime"] = f"{date}T{start}:00"
    for item in game["textRelays"]:
        item["inn"] += innings
        metric = item.get("metricOption") or {}
        if metric.get("wpaByPlate"):
            metric["wpaByPlate"] = round(metric["wpaByPlate"] * wpa_factor, 3)
    return game


def pa_relay(game: dict, index: int) -> dict:
    """index번째 타석(타자 소개가 있는 relay)의 원본 relay dict."""
    heads = [
        r for r in relay.chrono(game)
        if any(t.get("type") == 8 and t.get("batterRecord") for t in r["textOptions"])
    ]
    return heads[index]


def make_raw_dir(root: Path, games: list[dict]) -> Path:
    """games를 naver/relay/<gameId>.json으로 쓰고 픽스처 시즌 기록을 복사한 원자료 폴더."""
    relay_dir = root / "naver" / "relay"
    relay_dir.mkdir(parents=True, exist_ok=True)
    for game in games:
        (relay_dir / f"{game['game']['gameId']}.json").write_text(json.dumps(game, ensure_ascii=False), encoding="utf-8")
    stats_dir = root / "naver" / "stats"
    stats_dir.mkdir(parents=True, exist_ok=True)
    for src in sorted((FIXTURE_RAW / "naver" / "stats").glob("*.json")):
        shutil.copy(src, stats_dir / src.name)
    return root
