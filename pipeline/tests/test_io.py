import json
from pathlib import Path

from tmi_pipeline import io

FIXTURE_RAW = Path(__file__).parent / "fixtures" / "raw"


def test_write_json_creates_parent_folders_and_writes_compact_utf8(tmp_path):
    path = tmp_path / "app" / "nested" / "out.json"
    io.write_json(path, {"이름": "홈타자1", "rel": [1, 0.5], "없음": None})
    assert path.read_bytes().decode("utf-8") == '{"이름":"홈타자1","rel":[1,0.5],"없음":null}'


def test_load_json_reads_utf8(tmp_path):
    path = tmp_path / "x.json"
    path.write_bytes('{"구장": "사직", "n": [1, 2]}'.encode("utf-8"))
    assert io.load_json(path) == {"구장": "사직", "n": [1, 2]}


def test_write_then_load_round_trips(tmp_path):
    obj = {"games": [{"gameId": "g1", "stadium": "잠실"}], "rate": 3.5, "flag": True}
    io.write_json(tmp_path / "r.json", obj)
    assert io.load_json(tmp_path / "r.json") == obj


def test_relay_game_paths_are_sorted_json_files(tmp_path):
    relay = tmp_path / "naver" / "relay"
    relay.mkdir(parents=True)
    for name in ["20260902HTNC02026.json", "20260801HHKT02026.json", "20260815HTLT02026.json", "readme.txt"]:
        (relay / name).write_text("{}", encoding="utf-8")
    assert [p.name for p in io.relay_game_paths(tmp_path)] == [
        "20260801HHKT02026.json",
        "20260815HTLT02026.json",
        "20260902HTNC02026.json",
    ]


def test_relay_game_paths_of_fixture_raw_dir():
    assert [p.name for p in io.relay_game_paths(FIXTURE_RAW)] == ["20260815HTLT02026.json"]


def test_relay_game_paths_without_folder_is_empty(tmp_path):
    assert io.relay_game_paths(tmp_path) == []


def test_schedule_paths_only_monthly_full_files_sorted(tmp_path):
    folder = tmp_path / "naver" / "schedule"
    folder.mkdir(parents=True)
    for name in ["sched_full_2026-08.json", "sched_full_2021-03.json", "sched_2026_all.json", "sched_full_2025-10.json"]:
        (folder / name).write_text("{}", encoding="utf-8")
    assert [p.name for p in io.schedule_paths(tmp_path)] == [
        "sched_full_2021-03.json",
        "sched_full_2025-10.json",
        "sched_full_2026-08.json",
    ]


def test_season_stats_path(tmp_path):
    assert io.season_stats_path(tmp_path, 2025, "HITTER") == tmp_path / "naver" / "stats" / "stats_2025_HITTER_all.json"
    assert io.season_stats_path(tmp_path, 2026, "PITCHER") == tmp_path / "naver" / "stats" / "stats_2026_PITCHER_all.json"


def _month(path: Path, games: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"code": 200, "success": True, "result": {"games": games}}, ensure_ascii=False), encoding="utf-8")


def test_load_schedule_games_merges_months_and_later_file_wins(tmp_path):
    folder = tmp_path / "naver" / "schedule"
    _month(folder / "sched_full_2026-07.json", [
        {"gameId": "g1", "homeTeamScore": 1},
        {"gameId": "g2", "homeTeamScore": 0, "statusCode": "BEFORE"},
    ])
    _month(folder / "sched_full_2026-08.json", [
        {"gameId": "g2", "homeTeamScore": 5, "statusCode": "RESULT"},
        {"gameId": "g3", "homeTeamScore": 2},
    ])
    games = io.load_schedule_games(tmp_path)
    assert [g["gameId"] for g in games] == ["g1", "g2", "g3"]
    assert games[1] == {"gameId": "g2", "homeTeamScore": 5, "statusCode": "RESULT"}


def test_load_schedule_games_reads_fixture_month():
    games = io.load_schedule_games(FIXTURE_RAW)
    ids = [g["gameId"] for g in games]
    assert len(ids) == len(set(ids)) >= 5
    assert "20260815HTLT02026" in ids
