import copy
import json
import re
from collections import Counter

import pytest

from fixture_games import CASES_GAME_ID, FIXTURE_RAW, cases_game, load_fixture_game, make_raw_dir, pa_relay, shifted_game
from tmi_pipeline import build, relay, snapshot, stats
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
# 장면 id는 결과를 드러내지 않는 <gameId>-<타석 번호>(ADR-014)
SCENE_ID = re.compile(r"\d{8}[A-Z]{4}\d{5}-\d+")

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


@pytest.fixture(scope="module")
def cases():
    return cases_game()


@pytest.fixture(scope="module")
def case_throws(cases):
    return {pid: snapshot.infer_throws(rows) for pid, rows in snapshot.pitches_by_pitcher([cases]).items()}


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

def test_curated_scenes_are_rules_for_the_four_prototype_plate_appearances():
    assert [(c["game"], c["inning"], c["half"], c["outs"], c["bases"]) for c in snapshot.CURATED] == [
        ("20260825LTHT02026", 9, 1, 2, 7),
        ("20260902HTNC02026", 9, 1, 2, 7),
        ("20260830NCHH02026", 10, 0, 2, 6),
        ("20260910NCHT02026", 11, 1, 1, 5),
    ]
    # id·제목 문자열 없이 경기 id와 타석을 찾는 값(시작 상황·타자 이름)만 담는다(ADR-014)
    assert all(set(c) == {"game", "inning", "half", "outs", "bases", "batter"} and c["batter"] for c in snapshot.CURATED)


def test_find_curated_matches_the_situation_and_batter(cases):
    rule = {"game": CASES_GAME_ID, "inning": 3, "half": 1, "outs": 0, "bases": 0, "batter": "홈대타6"}
    assert snapshot.find_curated(cases, rule).index == 31
    assert snapshot.find_curated(cases, {**rule, "outs": 1}) is None
    assert snapshot.find_curated(cases, {**rule, "half": 0}) is None
    # 대타 교체만 있는 빈 타석은 타석이 아니다
    assert snapshot.find_curated(cases, {**rule, "batter": "홈타자6"}) is None


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


# --- situation_text · scene_title ---------------------------------------------------

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


def test_scene_title_adds_only_recorded_tags(cases):
    pas, subs = relay.plate_appearances(cases), relay.substitutions(cases)
    assert snapshot.scene_title(pas, subs, pas[31]) == "3회말 무사 주자 없음, 대타"  # 홈대타6
    assert snapshot.scene_title(pas, subs, pas[20]) == "2회초 1사 주자 없음, 대타"  # 원정대타3
    assert snapshot.scene_title(pas, subs, pas[28]) == "3회초 무사 1루"  # 대주자는 타자가 아니다
    assert snapshot.scene_title(pas, subs, pas[29]) == "3회초 1사 2루"
    late = shifted_game(cases, "20260817HTLT02026", "2026-08-17", innings=8)
    late_pas, late_subs = relay.plate_appearances(late), relay.substitutions(late)
    assert snapshot.scene_title(late_pas, late_subs, late_pas[31]) == "11회말 무사 주자 없음, 대타, 마지막 이닝"
    assert snapshot.scene_title(late_pas, late_subs, late_pas[27]) == "11회초 무사 주자 없음, 마지막 이닝"
    assert snapshot.scene_title(late_pas, late_subs, late_pas[22]) == "10회말 무사 주자 없음"


def test_pinch_hitter_tag_is_only_for_the_first_plate_appearance_after_entering(game):
    pas = relay.plate_appearances(game)

    def entered(seq: int) -> list[relay.Substitution]:
        return [relay.Substitution(seq=seq, inning=1, half=0, side="away", slot=4, in_id="a4", out_id="a4s", kind="pinch_hitter")]

    # 원정타자4가 1회초 첫 타석(seq 21~26) 전에 대타로 들어왔다면 그 타석만 대타
    assert snapshot.scene_title(pas, entered(20), pas[3]) == "1회초 1사 주자 없음, 대타"
    assert snapshot.scene_title(pas, entered(20), pas[21]) == "2회초 1사 1루"
    # 1회초 타석 뒤에 들어왔다면 2회초 타석이 교체 뒤 첫 타석
    assert snapshot.scene_title(pas, entered(100), pas[21]) == "2회초 1사 1루, 대타"
    assert snapshot.scene_title(pas, entered(100), pas[3]) == "1회초 1사 주자 없음"
    # 대타 아닌 교체로 들어온 타자는 꼬리표가 없다
    defense = [relay.Substitution(seq=100, inning=1, half=1, side="away", slot=4, in_id="a4", out_id="a4s", kind="defense")]
    assert snapshot.scene_title(pas, defense, pas[21]) == "2회초 1사 1루"


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


# --- build_scene: 장면 시점 출전 선수·첫 투구 투수·id·제목 (cases_game = 픽스처 경기 + 3회) -------------------

def test_scene_lineups_start_from_starters_and_apply_changes_before_the_first_pitch(game):
    pas = relay.plate_appearances(game)
    subs = [
        # 홈 6번 선발 h6s가 첫 타석(타석 15, seq 99) 전에 h6으로 바뀌었다고 가정
        relay.Substitution(seq=59, inning=1, half=0, side="home", slot=6, in_id="h6", out_id="h6s", kind="defense"),
        # 홈타자3 타석(타석 12) 첫 공(seq 74) 뒤에 들어온 2번 대주자
        relay.Substitution(seq=76, inning=1, half=1, side="home", slot=2, in_id="h2r", out_id="h2", kind="pinch_runner"),
    ]
    assert snapshot.scene_lineups(pas, subs, pas[5])["home"] == ["h1", "h2", "h3", "h4", "h5", "h6s", "h7", "h8", "h9"]
    assert snapshot.scene_lineups(pas, subs, pas[12])["home"] == ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8", "h9"]
    assert snapshot.scene_lineups(pas, subs, pas[13]) == {
        "away": ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9"],
        "home": ["h1", "h2r", "h3", "h4", "h5", "h6", "h7", "h8", "h9"],
    }


def test_lineups_include_a_pinch_runner_on_base(cases, rates, case_throws):
    scene = snapshot.build_scene(cases, 28, "auto", None, rates, case_throws)
    # 원정타자6 타석: 소개 뒤 첫 공 전에 1루주자 원정타자5 → 대주자 원정대주자5
    assert scene["state"] == {"inning": 3, "half": 0, "outs": 0, "bases": 1, "away": 4, "home": 5, "slotAway": 5, "slotHome": 5}
    assert scene["lineups"] == {
        "away": ["a1", "a2", "a3b", "a4", "a5r", "a6", "a7", "a8", "a9"],
        "home": ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8", "h9"],
    }
    assert (scene["batter"], scene["pitcher"], scene["title"]) == ("a6", "hp3", "3회초 무사 1루")
    earlier = snapshot.build_scene(cases, 27, "auto", None, rates, case_throws)
    assert earlier["lineups"]["away"][4] == "a5"  # 대주자 교체는 다음 타석에서


def test_lineups_reflect_defense_and_pinch_hitter_changes(cases, rates, case_throws):
    players = {}
    scene = snapshot.build_scene(cases, 31, "auto", None, rates, case_throws, players=players)
    assert scene["lineups"] == {
        "away": ["a1", "a2", "a3b", "a4", "a5r", "a6", "a7d", "a8", "a9"],
        "home": ["h1", "h2", "h3", "h4", "h5", "h6b", "h7", "h8", "h9"],
    }
    assert set(players) == set(scene["lineups"]["away"] + scene["lineups"]["home"] + [scene["pitcher"]])
    # 타석에 서지 않은 교체 선수: 이름은 교체 기록, 타석 방향은 모르면 우타, 시즌 기록이 없으면 rel 1
    assert players["a5r"] == {"id": "a5r", "name": "원정대주자5", "team": "HT", "kind": "H", "bats": "R", "rel": ONES, "line": {}}
    assert players["a7d"] == {"id": "a7d", "name": "원정수비7", "team": "HT", "kind": "H", "bats": "R", "rel": ONES, "line": {}}
    assert players["h6b"] == {"id": "h6b", "name": "홈대타6", "team": "LT", "kind": "H", "bats": "L", "rel": ONES, "line": {}}


def test_slots_count_only_complete_plate_appearances(cases, rates, case_throws):
    scene = snapshot.build_scene(cases, 31, "auto", None, rates, case_throws)
    # 원정의 마지막 완료 타석은 7번(낫 아웃). 8번 원정타자8은 견제사로 타석을 끝내지 못해 다음 이닝 선두다.
    assert scene["state"] == {"inning": 3, "half": 1, "outs": 0, "bases": 0, "away": 4, "home": 5, "slotAway": 7, "slotHome": 5}


def test_scene_pitcher_is_the_first_pitch_pitcher(cases, rates, case_throws):
    players = {}
    scene = snapshot.build_scene(cases, 27, "auto", None, rates, case_throws, players=players)
    # 원정타자5 소개에는 홈투수2가 적혀 있지만 소개 뒤 교체로 첫 공부터 홈투수3이 던졌다
    assert scene["pitcher"] == "hp3"
    assert scene["actual"]["notes"] == []
    assert (players["hp3"]["name"], players["hp3"]["team"], players["hp3"]["kind"]) == ("홈투수3", "LT", "P")


def test_pitching_change_during_the_plate_appearance_is_noted(game, cases, rates, throws, case_throws):
    first = snapshot.build_scene(game, 6, "auto", None, rates, throws)
    assert (first["pitcher"], first["actual"]["notes"]) == ("hp1", ["3구째부터 홈투수2 등판"])
    pinch = snapshot.build_scene(cases, 31, "auto", None, rates, case_throws)
    assert (pinch["pitcher"], pinch["actual"]["notes"]) == ("ap1", ["3구째부터 원정투수2 등판"])

    noted = copy.deepcopy(cases)
    pa_relay(noted, 31)["textOptions"].append({"seqno": 192, "type": 24, "text": "1루주자 홈타자5 : 2루까지 진루"})
    assert snapshot.build_scene(noted, 31, "auto", None, rates, case_throws)["actual"]["notes"] == [
        "1루주자 홈타자5 : 2루까지 진루", "3구째부터 원정투수2 등판",
    ]
    nameless = copy.deepcopy(cases)
    for t in pa_relay(nameless, 31)["textOptions"]:
        if t["type"] == 2:
            del t["playerChange"]["inPlayer"]["playerName"]
    assert snapshot.build_scene(nameless, 31, "auto", None, rates, case_throws)["actual"]["notes"] == ["3구째부터 ap2 등판"]


def test_scene_id_and_default_title_carry_no_result(cases, rates, case_throws):
    scene = snapshot.build_scene(cases, 31, "curated", None, rates, case_throws)
    assert scene["id"] == f"{CASES_GAME_ID}-31"
    assert SCENE_ID.fullmatch(scene["id"])
    assert scene["title"] == "3회말 무사 주자 없음, 대타"
    assert not any(word in scene["title"] for word in ("끝내기", "한 방", "결승", "마무리", "제구"))


# --- build_snapshot · stage -------------------------------------------------------

@pytest.fixture()
def snapshot_raw(tmp_path, game, monkeypatch):
    games = [
        shifted_game(game, f"202608{day:02d}HTLT02026", f"2026-08-{day:02d}", wpa_factor=1 + day / 10)
        for day in range(1, 15)
    ]
    monkeypatch.setattr(snapshot, "CURATED", [
        {"game": "20260803HTLT02026", "inning": 7, "half": 1, "outs": 0, "bases": 0, "batter": "홈타자2"},
        {"game": "20260101NCLG02026", "inning": 9, "half": 1, "outs": 2, "bases": 7, "batter": "홈타자1"},
        {"game": "20260804HTLT02026", "inning": 9, "half": 0, "outs": 0, "bases": 0, "batter": "없는타자"},
    ])
    return make_raw_dir(tmp_path / "raw", games)


def test_build_snapshot_matches_the_data_contract(snapshot_raw, rates, game, capsys):
    data = snapshot.build_snapshot(snapshot_raw)
    printed = capsys.readouterr().out
    assert "20260101NCLG02026" in printed
    assert "없는타자" in printed
    assert set(data) == {"core", "pitches", "scenes"}

    scenes = data["scenes"]
    # 선정 1 + 자동 12(선정 장면 경기 03·04일 제외한 12경기)
    assert len(scenes) == 13
    assert [s["date"] for s in scenes] == sorted(s["date"] for s in scenes)
    for scene in scenes:
        assert set(scene) == SCENE_KEYS
        assert SCENE_ID.fullmatch(scene["id"])
        assert set(scene["away"]) == SCENE_TEAM_KEYS and set(scene["home"]) == SCENE_TEAM_KEYS
        assert set(scene["state"]) == GAME_STATE_KEYS
        assert set(scene["actual"]) == ACTUAL_KEYS
        assert set(scene["context"]) == CONTEXT_KEYS
        assert set(scene["lineups"]) == {"away", "home"}
        assert all(len(scene["lineups"][side]) == 9 and all(scene["lineups"][side]) for side in ("away", "home"))

    curated = [s for s in scenes if s["source"] == "curated"]
    assert [(s["id"], s["title"], s["batter"], s["state"]["inning"], s["state"]["half"]) for s in curated] == [
        ("20260803HTLT02026-23", "7회말 무사 주자 없음", "h2", 7, 1),
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


def test_build_snapshot_scenes_with_substitutions_keep_the_app_contract(tmp_path, monkeypatch):
    games = [
        shifted_game(cases_game(), f"202608{day:02d}HTLT02026", f"2026-08-{day:02d}", wpa_factor=1 + day / 10)
        for day in (20, 21, 22)
    ]
    monkeypatch.setattr(snapshot, "CURATED", [
        {"game": "20260821HTLT02026", "inning": 8, "half": 1, "outs": 0, "bases": 0, "batter": "홈대타6"},
    ])
    data = snapshot.build_snapshot(make_raw_dir(tmp_path / "raw", games))
    scenes = data["scenes"]
    assert [(s["id"], s["source"]) for s in scenes] == [
        ("20260820HTLT02026-22", "auto"), ("20260821HTLT02026-31", "curated"), ("20260822HTLT02026-22", "auto"),
    ]
    for scene in scenes:
        assert set(scene) == SCENE_KEYS
        assert set(scene["state"]) == GAME_STATE_KEYS and set(scene["actual"]) == ACTUAL_KEYS
        assert SCENE_ID.fullmatch(scene["id"])
        assert all(len(scene["lineups"][side]) == 9 and all(isinstance(p, str) and p for p in scene["lineups"][side])
                   for side in ("away", "home"))
        assert 0 <= scene["state"]["slotAway"] <= 8 and 0 <= scene["state"]["slotHome"] <= 8
        assert 0 <= scene["actual"]["event"] <= 6
    curated = scenes[1]
    assert (curated["title"], curated["batter"], curated["pitcher"]) == ("8회말 무사 주자 없음, 대타", "h6b", "ap1")
    assert curated["lineups"]["away"] == ["a1", "a2", "a3b", "a4", "a5r", "a6", "a7d", "a8", "a9"]
    assert curated["actual"]["notes"] == ["3구째부터 원정투수2 등판"]
    assert data["core"]["players"]["a5r"]["name"] == "원정대주자5"
    assert "ap1" in data["pitches"]["byPitcher"]


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
