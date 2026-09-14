import copy
import json
import re
from collections import Counter

import pytest

from fixture_games import FIXTURE_RAW, load_fixture_game, make_raw_dir, pa_relay, shifted_game
from tmi_pipeline import build, snapshot, stats
from tmi_pipeline.contract import PITCH_TYPES

# src/types/data.ts 필드 이름
SCENE_KEYS = {
    "id", "source", "title", "date", "stadium", "away", "home", "state", "batter", "pitcher",
    "lineups", "leverage", "naverWpBeforeHome", "actual", "context",
}
SCENE_TEAM_KEYS = {"code", "name", "final"}
GAME_STATE_KEYS = {"inning", "half", "outs", "bases", "away", "home", "slotAway", "slotHome"}
ACTUAL_KEYS = {"result", "event", "runs", "notes", "pitches", "wpAfterHome"}
CONTEXT_KEYS = {"tempC", "windMs", "dayGame", "dome"}
CORE_KEYS = {"meta", "league", "countTable", "players", "bullpens"}
META_KEYS = {"season", "relayRange", "relayGames", "generatedAt", "sources"}
HITTER_KEYS = {"id", "name", "team", "kind", "bats", "rel", "line"}
PITCHER_KEYS = {"id", "name", "team", "kind", "throws", "rel", "line"}
BULLPEN_KEYS = {"id", "team", "name", "rel", "n"}
PITCH_DATA_KEYS = {"pitchTypes", "byPitcher", "pools"}

ONES = [1.0] * 7


def _season_rows(kind: str) -> list[dict]:
    path = FIXTURE_RAW / "naver" / "stats" / f"stats_2026_{kind}_all.json"
    return json.loads(path.read_text(encoding="utf-8"))["result"]["seasonPlayerStats"]


@pytest.fixture(scope="module")
def game():
    return load_fixture_game()


@pytest.fixture(scope="module")
def rates():
    return stats.season_rates(_season_rows("HITTER"), _season_rows("PITCHER"))


@pytest.fixture(scope="module")
def throws(game):
    return {pid: snapshot.infer_throws(rows) for pid, rows in snapshot.pitches_by_pitcher([game]).items()}


def _rows(sizes: dict[tuple[int, int], int]) -> list[list]:
    """(code, stance) 층별 개수만큼 투구 행을 번갈아 만든다. x0에 일련번호를 넣어 행을 구별한다."""
    rows, serial = [], 0
    for i in range(max(sizes.values())):
        for (code, stance), n in sizes.items():
            if i < n:
                rows.append([0, 140, code, 0, 0, stance, float(serial), 5.8, 0, -130, 0, 0, 28, -15, 3.4, 1.6])
                serial += 1
    return rows


# --- CURATED -----------------------------------------------------------------

def test_curated_scenes_are_the_four_prototype_scenarios():
    assert [(c["id"], c["game"], c["inning"], c["half"]) for c in snapshot.CURATED] == [
        ("walkoff-slam", "20260825LTHT02026", 9, 1),
        ("walkoff-walk", "20260902HTNC02026", 9, 1),
        ("extra-go-ahead", "20260830NCHH02026", 10, 0),
        ("eleventh-last", "20260910NCHT02026", 11, 1),
    ]
    assert [c["title"] for c in snapshot.CURATED] == [
        "9회말 2사 만루, 대타 한 방",
        "9회말 2사 만루, 제구 싸움",
        "10회초 2사 2·3루, 마무리와 승부",
        "11회말 1사 1·3루, 마지막 이닝",
    ]
    assert all(set(c) == {"id", "game", "inning", "half", "batter", "title"} and c["batter"] for c in snapshot.CURATED)


# --- count_table ---------------------------------------------------------------

def test_count_table_rows_are_pitch_result_shares_by_count(game):
    table = snapshot.count_table([game])
    assert len(table) == 12
    assert all(len(row) == 5 for row in table)
    assert all(sum(row) == pytest.approx(1, abs=1e-3) for row in table)
    # 0-0: 볼 12, 루킹 9, 헛스윙 1, 파울 1, 인플레이 3 (투구가 있는 26타석의 첫 공)
    assert table[0] == [0.4615, 0.3462, 0.0385, 0.0385, 0.1154]
    # 3-2: 볼 1, 파울 1, 인플레이 1
    assert table[11] == [0.3333, 0.0, 0.0, 0.3333, 0.3333]


def test_count_table_rounds_to_four_decimals(game):
    assert all(round(value, 4) == value for row in snapshot.count_table([game]) for value in row)


def test_count_table_without_pitches_is_uniform():
    assert snapshot.count_table([]) == [[0.2] * 5 for _ in range(12)]


# --- pitches_by_pitcher · infer_throws ----------------------------------------

def test_pitches_by_pitcher_attributes_each_pitch_to_the_pitcher_who_threw_it(game):
    by_pitcher = snapshot.pitches_by_pitcher([game])
    assert {pid: len(rows) for pid, rows in by_pitcher.items()} == {"hp1": 21, "hp2": 16, "ap1": 46}
    # 원정타자7 타석 도중 올라온 hp2의 세 공(1-1, 2-1, 3-1), 이어 currentGameState가 없는 공(0-0 루킹)은 타석 시작 투수 hp2
    assert [(r[3], r[4]) for r in by_pitcher["hp2"][:4]] == [(1, 1), (2, 1), (3, 1), (0, 0)]
    assert by_pitcher["hp2"][3][2] == 1
    assert [(r[3], r[4]) for r in by_pitcher["hp1"][-2:]] == [(0, 0), (1, 0)]
    assert all(len(r) == 16 for rows in by_pitcher.values() for r in rows)


def test_pitches_by_pitcher_skips_pitches_without_tracking(game):
    total = sum(len(rows) for rows in snapshot.pitches_by_pitcher([game, game]).values())
    assert total == 2 * 83


def test_infer_throws_from_fixture_release_side(game):
    by_pitcher = snapshot.pitches_by_pitcher([game])
    assert snapshot.infer_throws(by_pitcher["hp1"]) == "L"
    assert snapshot.infer_throws(by_pitcher["hp2"]) == "R"
    assert snapshot.infer_throws(by_pitcher["ap1"]) == "R"


@pytest.mark.parametrize(
    ("xs", "hand"),
    [([1.2, -0.4, 0.9], "L"), ([-1.5, 0.2, -1.1], "R"), ([-1.0, 0.0, 1.0], "R"), ([], "R")],
)
def test_infer_throws_uses_median_x0(xs, hand):
    rows = [[0, 140, 0, 0, 0, 1, x, 5.8, 0, -130, 0, 0, 28, -15, 3.4, 1.6] for x in xs]
    assert snapshot.infer_throws(rows) == hand


# --- sample_rows ----------------------------------------------------------------

def test_sample_rows_returns_every_row_when_under_cap():
    rows = _rows({(0, 0): 3, (4, 1): 2})
    assert snapshot.sample_rows(rows, cap=5, seed=1) == rows
    assert snapshot.sample_rows(rows, cap=50, seed=1) == rows


def test_sample_rows_is_deterministic_and_capped():
    rows = _rows({(0, 0): 400, (0, 1): 300, (4, 1): 200, (2, 0): 100})
    first = snapshot.sample_rows(rows, cap=100, seed=7)
    assert len(first) == 100
    assert first == snapshot.sample_rows(rows, cap=100, seed=7)
    assert first != snapshot.sample_rows(rows, cap=100, seed=8)


def test_sample_rows_keeps_stratum_shares():
    rows = _rows({(0, 0): 400, (0, 1): 300, (4, 1): 200, (2, 0): 100})
    counts = Counter((r[2], r[5]) for r in snapshot.sample_rows(rows, cap=100, seed=3))
    assert counts == {(0, 0): 40, (0, 1): 30, (4, 1): 20, (2, 0): 10}


def test_sample_rows_rounds_stratum_quotas_within_one():
    sizes = {(0, 0): 333, (1, 1): 333, (3, 0): 334, (4, 1): 7}
    sample = snapshot.sample_rows(_rows(sizes), cap=50, seed=11)
    assert len(sample) == 50
    counts = Counter((r[2], r[5]) for r in sample)
    total = sum(sizes.values())
    assert all(abs(counts[key] - 50 * n / total) <= 1 for key, n in sizes.items())


def test_sample_rows_keeps_original_order():
    rows = _rows({(0, 0): 50, (4, 1): 50})
    positions = [rows.index(r) for r in snapshot.sample_rows(rows, cap=20, seed=5)]
    assert positions == sorted(positions)
    assert len(set(positions)) == 20


# --- situation_text ---------------------------------------------------------------

@pytest.mark.parametrize(
    ("args", "text"),
    [
        ((9, 1, 2, 7), "9회말 2사 만루"),
        ((8, 0, 0, 5), "8회초 무사 1·3루"),
        ((3, 0, 1, 0), "3회초 1사 주자 없음"),
        ((10, 1, 2, 6), "10회말 2사 2·3루"),
        ((7, 0, 1, 2), "7회초 1사 2루"),
    ],
)
def test_situation_text(args, text):
    assert snapshot.situation_text(*args) == text


# --- scene_candidates ----------------------------------------------------------

def test_scene_candidates_need_the_sixth_inning_or_later(game):
    assert snapshot.scene_candidates([game], set()) == []


def test_scene_candidates_pick_the_biggest_valid_wpa_of_a_game(game):
    late = shifted_game(game, "20260801HTLT02026", "2026-08-01")
    [(picked, index)] = snapshot.scene_candidates([late], set())
    assert picked is late
    assert index == 22  # 7회말 홈타자1 홈런, |wpa| 8.7


def test_scene_candidates_require_both_lineups_complete(game):
    late = shifted_game(game, "20260801HTLT02026", "2026-08-01")
    pa_relay(late, 17)["metricOption"]["wpaByPlate"] = 55.0  # 홈 9번 타순이 아직 나오지 않은 타석
    assert snapshot.scene_candidates([late], set())[0][1] == 22
    pa_relay(late, 18)["metricOption"]["wpaByPlate"] = -40.0  # 이번 타자(홈타자9)로 홈 타순이 채워진다
    assert snapshot.scene_candidates([late], set())[0][1] == 18


def test_scene_candidates_skip_rows_with_invalid_win_probability(game):
    late = shifted_game(game, "20260801HTLT02026", "2026-08-01")
    pa_relay(late, 19)["metricOption"]["wpaByPlate"] = 99.0  # 홈·원정 승리확률 합 0 → wpa도 무효
    assert snapshot.scene_candidates([late], set())[0][1] == 22


def test_scene_candidates_rank_games_exclude_and_take_top_n(game):
    games = [
        shifted_game(game, f"202608{day:02d}HTLT02026", f"2026-08-{day:02d}", wpa_factor=factor)
        for day, factor in [(1, 1.0), (2, 2.0), (3, 0.5), (4, 1.5)]
    ]
    picks = snapshot.scene_candidates(games, set(), top_n=3)
    assert [(g["game"]["gameId"], i) for g, i in picks] == [
        ("20260802HTLT02026", 22), ("20260804HTLT02026", 22), ("20260801HTLT02026", 22),
    ]
    picks = snapshot.scene_candidates(games, {"20260802HTLT02026"})
    assert [g["game"]["gameId"] for g, _ in picks] == ["20260804HTLT02026", "20260801HTLT02026", "20260803HTLT02026"]


# --- build_scene -----------------------------------------------------------------

def test_build_scene_state_lineups_and_slots_after_a_pinch_hitter(game, rates, throws):
    scene = snapshot.build_scene(game, 20, "auto", "2회초 1사 주자 없음", rates, throws)
    assert set(scene) == SCENE_KEYS
    assert scene["id"] == "20260815HTLT02026-20"
    assert (scene["source"], scene["title"], scene["date"], scene["stadium"]) == ("auto", "2회초 1사 주자 없음", "2026-08-15", "사직")
    assert scene["away"] == {"code": "HT", "name": "KIA", "final": 4}
    assert scene["home"] == {"code": "LT", "name": "롯데", "final": 5}
    # 원정 공격: 이번 타자 3번 → slotAway 2, 홈의 마지막 타자 9번 → 9 % 9 = 0
    assert scene["state"] == {"inning": 2, "half": 0, "outs": 1, "bases": 0, "away": 4, "home": 4, "slotAway": 2, "slotHome": 0}
    assert (scene["batter"], scene["pitcher"]) == ("a3b", "hp2")
    assert scene["lineups"] == {
        "away": ["a1", "a2", "a3b", "a4", "a5", "a6", "a7", "a8", "a9"],
        "home": ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8", "h9"],
    }
    assert scene["leverage"] == pytest.approx(2.0)
    # 직전 타석(원정타자2)은 승리확률 무효 행이므로 그 앞 홈타자9 타석의 51.0
    assert scene["naverWpBeforeHome"] == pytest.approx(0.51)
    actual = scene["actual"]
    assert set(actual) == ACTUAL_KEYS
    assert (actual["result"], actual["event"], actual["runs"], actual["notes"]) == ("원정대타3 : 우익수 앞 1루타", 5, 0, [])
    assert actual["wpAfterHome"] == pytest.approx(0.49)
    assert [row[2] for row in actual["pitches"]] == [1, 4]
    assert all(len(row) == 16 for row in actual["pitches"])
    assert scene["context"] == {"tempC": None, "windMs": None, "dayGame": False, "dome": False}


def test_build_scene_home_batting_notes_and_runs(game, rates, throws):
    scene = snapshot.build_scene(game, 17, "curated", "직접 고른 제목", rates, throws)
    # 홈타자8: 1회말 2사 2·3루 4:3, 원정의 마지막 타자는 1번(원정타자1) → slotAway 1
    assert scene["state"] == {"inning": 1, "half": 1, "outs": 2, "bases": 6, "away": 4, "home": 3, "slotAway": 1, "slotHome": 7}
    assert (scene["source"], scene["title"]) == ("curated", "직접 고른 제목")
    assert scene["actual"]["notes"] == ["3루주자 홈타자6 : 홈인", "2루주자 홈타자7 : 3루까지 진루"]
    assert (scene["actual"]["event"], scene["actual"]["runs"]) == (5, 1)
    assert scene["actual"]["wpAfterHome"] == pytest.approx(0.523)
    assert scene["naverWpBeforeHome"] == pytest.approx(0.465)
    assert scene["leverage"] == pytest.approx(5.8)
    assert [row[2] for row in scene["actual"]["pitches"]] == [0, 4]


def test_build_scene_first_plate_appearance_has_no_earlier_win_probability(game, rates, throws):
    scene = snapshot.build_scene(game, 0, "auto", "1회초 무사 주자 없음", rates, throws)
    assert scene["naverWpBeforeHome"] is None
    assert (scene["state"]["slotAway"], scene["state"]["slotHome"]) == (0, 0)


def test_build_scene_with_an_invalid_win_probability_row(game, rates, throws):
    scene = snapshot.build_scene(game, 19, "auto", "2회초 무사 주자 없음", rates, throws)
    assert scene["actual"]["wpAfterHome"] is None
    assert scene["leverage"] == 0.0


def test_build_scene_context_day_game_and_dome(game, rates, throws):
    day = copy.deepcopy(game)
    day["game"]["gameDateTime"] = "2026-08-15T14:00:00"
    day["game"]["stadium"] = "고척"
    assert snapshot.build_scene(day, 20, "auto", "t", rates, throws)["context"] == {
        "tempC": None, "windMs": None, "dayGame": True, "dome": True,
    }
    five = copy.deepcopy(game)
    five["game"]["gameDateTime"] = "2026-08-15T17:00:00"
    assert snapshot.build_scene(five, 20, "auto", "t", rates, throws)["context"]["dayGame"] is False


def test_build_scene_collects_player_records(game, rates, throws):
    players = {}
    scene = snapshot.build_scene(game, 20, "auto", "t", rates, throws, players=players)
    assert set(players) == set(scene["lineups"]["away"] + scene["lineups"]["home"] + [scene["pitcher"]])
    assert players["a1"] == {
        "id": "a1", "name": "원정타자1", "team": "HT", "kind": "H", "bats": "L",
        "rel": rates.hitters["a1"]["rel"], "line": rates.hitters["a1"]["line"],
    }
    # 시즌 기록이 없는 선수: rel 1, line 비움, 이름·타석 방향은 relay batterRecord
    assert players["a3b"] == {"id": "a3b", "name": "원정대타3", "team": "HT", "kind": "H", "bats": "L", "rel": ONES, "line": {}}
    assert players["h2"] == {"id": "h2", "name": "홈타자2", "team": "LT", "kind": "H", "bats": "R", "rel": ONES, "line": {}}
    assert players["h6"]["bats"] == "S"
    assert players["hp2"] == {
        "id": "hp2", "name": "홈투수2", "team": "LT", "kind": "P", "throws": "R",
        "rel": rates.pitchers["hp2"]["rel"], "line": rates.pitchers["hp2"]["line"],
    }
    assert all(set(p) == (HITTER_KEYS if p["kind"] == "H" else PITCHER_KEYS) for p in players.values())


def test_scene_pitcher_without_season_record(game, rates, throws):
    no_pitchers = stats.SeasonRates(rates.hitters, {}, rates.league_hitting, rates.league_pitching)
    players = {}
    snapshot.build_scene(game, 20, "auto", "t", no_pitchers, throws, players=players)
    # 교체 기록(playerChange)에 이름이 있으면 그 이름
    assert players["hp2"] == {"id": "hp2", "name": "홈투수2", "team": "LT", "kind": "P", "throws": "R", "rel": ONES, "line": {}}
    players = {}
    snapshot.build_scene(game, 22, "auto", "t", no_pitchers, {}, players=players)
    # 이름을 찾을 곳이 없으면 id, 투구 기록이 없으면 우투
    assert players["ap1"] == {"id": "ap1", "name": "ap1", "team": "HT", "kind": "P", "throws": "R", "rel": ONES, "line": {}}


# --- build_snapshot · stage -------------------------------------------------------

@pytest.fixture()
def snapshot_raw(tmp_path, game, monkeypatch):
    games = [
        shifted_game(game, f"202608{day:02d}HTLT02026", f"2026-08-{day:02d}", wpa_factor=1 + day / 10)
        for day in range(1, 15)
    ]
    monkeypatch.setattr(snapshot, "CURATED", [
        {"id": "fixture-pick", "game": "20260803HTLT02026", "inning": 7, "half": 1, "batter": "홈타자2", "title": "7회말 픽스처 장면"},
        {"id": "missing-game", "game": "20260101NCLG02026", "inning": 9, "half": 1, "batter": "홈타자1", "title": "없는 경기"},
        {"id": "missing-batter", "game": "20260804HTLT02026", "inning": 9, "half": 0, "batter": "없는타자", "title": "없는 타자"},
    ])
    return make_raw_dir(tmp_path / "raw", games)


def test_build_snapshot_matches_the_data_contract(snapshot_raw, rates, game, capsys):
    data = snapshot.build_snapshot(snapshot_raw)
    printed = capsys.readouterr().out
    assert "missing-game" in printed
    assert "missing-batter" in printed
    assert set(data) == {"core", "pitches", "scenes"}

    scenes = data["scenes"]
    # 선정 1 + 자동 12(선정 장면 경기 03·04일 제외한 12경기)
    assert len(scenes) == 13
    assert [s["date"] for s in scenes] == sorted(s["date"] for s in scenes)
    for scene in scenes:
        assert set(scene) == SCENE_KEYS
        assert set(scene["away"]) == SCENE_TEAM_KEYS and set(scene["home"]) == SCENE_TEAM_KEYS
        assert set(scene["state"]) == GAME_STATE_KEYS
        assert set(scene["actual"]) == ACTUAL_KEYS
        assert set(scene["context"]) == CONTEXT_KEYS
        assert set(scene["lineups"]) == {"away", "home"}
        assert all(len(scene["lineups"][side]) == 9 and all(scene["lineups"][side]) for side in ("away", "home"))

    curated = [s for s in scenes if s["source"] == "curated"]
    assert [(s["id"], s["title"], s["batter"], s["state"]["inning"], s["state"]["half"]) for s in curated] == [
        ("fixture-pick", "7회말 픽스처 장면", "h2", 7, 1),
    ]
    autos = [s for s in scenes if s["source"] == "auto"]
    assert {s["id"] for s in autos} == {f"202608{day:02d}HTLT02026-22" for day in (1, 2, *range(5, 15))}
    assert all(
        s["title"] == snapshot.situation_text(s["state"]["inning"], s["state"]["half"], s["state"]["outs"], s["state"]["bases"])
        for s in autos
    )

    core = data["core"]
    assert set(core) == CORE_KEYS
    assert set(core["meta"]) == META_KEYS
    assert core["meta"]["season"] == 2026
    assert core["meta"]["relayRange"] == ["2026-08-01", "2026-08-14"]
    assert core["meta"]["relayGames"] == 14
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", core["meta"]["generatedAt"])
    assert core["meta"]["sources"] == ["네이버 스포츠 KBO 문자중계·기록", "TMI 야구 파이프라인"]
    assert core["league"] == [round(x, 5) for x in rates.league_hitting]
    assert core["countTable"] == snapshot.count_table([game])

    players = core["players"]
    needed = {p for s in scenes for p in s["lineups"]["away"] + s["lineups"]["home"] + [s["batter"], s["pitcher"]]}
    assert needed <= set(players)
    assert all(set(p) == (HITTER_KEYS if p["kind"] == "H" else PITCHER_KEYS) for p in players.values())
    assert all(p["id"] == pid for pid, p in players.items())
    assert set(core["bullpens"]) == {"HT", "LT"}
    assert all(set(b) == BULLPEN_KEYS for b in core["bullpens"].values())
    assert core["bullpens"]["HT"]["n"] == 1

    pitches = data["pitches"]
    assert set(pitches) == PITCH_DATA_KEYS
    assert pitches["pitchTypes"] == PITCH_TYPES
    assert set(pitches["byPitcher"]) == {s["pitcher"] for s in scenes} == {"ap1"}
    assert len(pitches["byPitcher"]["ap1"]) == 300  # 46 × 14 = 644 → 300
    assert set(pitches["pools"]) == {"L", "R"}
    assert len(pitches["pools"]["L"]) == 21 * 14  # 좌투 hp1 전부(600 이하)
    assert len(pitches["pools"]["R"]) == 600  # ap1 644 + hp2 224 → 600

    text = json.dumps(data, ensure_ascii=False)
    assert "http" not in text


def test_snapshot_stage_writes_three_app_files(snapshot_raw, tmp_path):
    out = tmp_path / "build"
    summary = build.STAGES["snapshot"](snapshot_raw, out)
    names = ("core.json", "pitches.json", "scenes.json")
    assert all((out / "app" / name).is_file() for name in names)
    scenes = json.loads((out / "app" / "scenes.json").read_text(encoding="utf-8"))
    core = json.loads((out / "app" / "core.json").read_text(encoding="utf-8"))
    assert summary["scenes"] == len(scenes) == 13
    assert (summary["curated"], summary["auto"]) == (1, 12)
    assert summary["players"] == len(core["players"])
    assert set(summary["kb"]) == set(names)
    assert all(size > 0 for size in summary["kb"].values())
