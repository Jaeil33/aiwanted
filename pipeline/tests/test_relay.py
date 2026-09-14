import copy
import dataclasses
import json
from pathlib import Path

import pytest

from tmi_pipeline import relay
from tmi_pipeline.contract import PITCH_TYPES

FIXTURE_GAME = Path(__file__).parent / "fixtures" / "raw" / "naver" / "relay" / "20260815HTLT02026.json"

# 픽스처 경기(원정 HT 대 홈 LT, 2이닝 27타석)의 타석 시작 상태:
# (타자 id, 이닝, 초말, 아웃, 주자 비트마스크, 원정 점수, 홈 점수, 투수 id)
EXPECTED_STARTS = [
    ("a1", 1, 0, 0, 0, 0, 0, "hp1"),
    ("a2", 1, 0, 1, 0, 0, 0, "hp1"),
    ("a3", 1, 0, 1, 1, 0, 0, "hp1"),
    ("a4", 1, 0, 1, 0, 2, 0, "hp1"),
    ("a5", 1, 0, 1, 1, 2, 0, "hp1"),
    ("a6", 1, 0, 1, 6, 2, 0, "hp1"),
    ("a7", 1, 0, 2, 2, 3, 0, "hp1"),  # 이 타석 도중 hp2로 교체
    ("a8", 1, 0, 2, 3, 3, 0, "hp2"),
    ("a9", 1, 0, 2, 7, 3, 0, "hp2"),
    ("a1", 1, 0, 2, 7, 4, 0, "hp2"),
    ("h1", 1, 1, 0, 0, 4, 0, "ap1"),
    ("h2", 1, 1, 0, 1, 4, 0, "ap1"),
    ("h3", 1, 1, 0, 2, 4, 1, "ap1"),
    ("h4", 1, 1, 1, 4, 4, 1, "ap1"),
    ("h5", 1, 1, 1, 4, 4, 2, "ap1"),
    ("h6", 1, 1, 2, 0, 4, 3, "ap1"),
    ("h7", 1, 1, 2, 1, 4, 3, "ap1"),
    ("h8", 1, 1, 2, 6, 4, 3, "ap1"),
    ("h9", 1, 1, 2, 5, 4, 4, "ap1"),
    ("a2", 2, 0, 0, 0, 4, 4, "hp2"),  # 승리확률 무효 행
    ("a3b", 2, 0, 1, 0, 4, 4, "hp2"),  # 3번 타순 대타
    ("a4", 2, 0, 1, 1, 4, 4, "hp2"),
    ("h1", 2, 1, 0, 0, 4, 4, "ap1"),
    ("h2", 2, 1, 0, 0, 4, 5, "ap1"),
    ("h3", 2, 1, 1, 0, 4, 5, "ap1"),
    ("h4", 2, 1, 2, 0, 4, 5, "ap1"),  # 자동 고의4구(투구 없음)
    ("h5", 2, 1, 2, 1, 4, 5, "ap1"),
]
EXPECTED_EVENTS = [0, 1, 2, 5, 4, 6, 1, 1, 5, 6, 5, 4, 6, 3, 6, 1, 4, 5, 0, 6, 5, 6, 2, 0, 6, 1, 6]
EXPECTED_RUNS = [0, 0, 2, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0]

PTS = {
    "pitchId": "p", "x0": -1.52349, "z0": 5.81049, "vx0": 5.10071, "vy0": -131.23449, "vz0": -5.30041,
    "ax": -8.10061, "ay": 28.44491, "az": -14.80012, "topSz": 3.41951, "bottomSz": 1.60549, "stance": "R", "y0": 55.0,
}


@pytest.fixture(scope="module")
def game():
    return json.loads(FIXTURE_GAME.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def pas(game):
    return relay.plate_appearances(game)


def test_chrono_drops_empty_relays_and_orders_by_first_seqno(game):
    ordered = relay.chrono(game)
    assert len(game["textRelays"]) == 33
    assert len(ordered) == 32
    firsts = [min(t["seqno"] for t in r["textOptions"]) for r in ordered]
    assert firsts == sorted(firsts)
    assert firsts != [min(t["seqno"] for t in r["textOptions"]) for r in game["textRelays"] if r["textOptions"]]
    assert ordered[0]["title"] == "1회초 KIA 공격"
    assert {t["type"] for t in ordered[-1]["textOptions"]} == {99}


def test_sorted_options_orders_by_seqno(game):
    shuffled = next(
        r for r in game["textRelays"]
        if [t["seqno"] for t in r["textOptions"]] != sorted(t["seqno"] for t in r["textOptions"])
    )
    seqnos = [t["seqno"] for t in relay.sorted_options(shuffled)]
    assert seqnos == sorted(seqnos)
    assert len(seqnos) == len(shuffled["textOptions"])


def test_plate_appearance_fields():
    assert [f.name for f in dataclasses.fields(relay.PlateAppearance)] == [
        "game_id", "index", "inning", "half", "side", "batter_id", "batter_name", "bat_order", "hit_type",
        "state", "pitcher_id", "options", "pts_by_id", "result_text", "runs_in", "event", "wp_home_after", "wpa",
    ]


def test_plate_appearances_follow_batter_intros_in_time_order(pas):
    assert len(pas) == 27
    assert [pa.index for pa in pas] == list(range(27))
    assert all(pa.game_id == "20260815HTLT02026" for pa in pas)
    assert [pa.batter_id for pa in pas] == [row[0] for row in EXPECTED_STARTS]


def test_inning_header_relays_with_batter_record_are_not_plate_appearances(game, pas):
    headers = [r for r in relay.chrono(game) if any(t["type"] == 0 and t.get("batterRecord") for t in r["textOptions"])]
    assert len(headers) == 4
    header_seqnos = {t["seqno"] for r in headers for t in r["textOptions"]}
    assert not header_seqnos & {t["seqno"] for pa in pas for t in pa.options}


@pytest.mark.parametrize("i", range(len(EXPECTED_STARTS)))
def test_start_state_side_and_pitcher(pas, i):
    _, inning, half, outs, bases, away, home, pitcher = EXPECTED_STARTS[i]
    pa = pas[i]
    assert pa.state == {"inning": inning, "half": half, "outs": outs, "bases": bases, "away": away, "home": home}
    assert (pa.inning, pa.half, pa.side) == (inning, half, "home" if half else "away")
    assert pa.pitcher_id == pitcher


def test_events_and_runs_in(pas):
    assert [pa.event for pa in pas] == EXPECTED_EVENTS
    # 14·24 문장의 "홈인" 개수 + 홈런 타자
    assert [pa.runs_in for pa in pas] == EXPECTED_RUNS


def test_batter_record_fields(pas):
    first = pas[0]
    assert (first.batter_name, first.bat_order, first.hit_type) == ("원정타자1", 1, "우투좌타")
    pinch = pas[20]
    assert (pinch.batter_id, pinch.batter_name, pinch.bat_order, pinch.hit_type) == ("a3b", "원정대타3", 3, "우투좌타")


def test_result_text_and_naver_win_probability(pas):
    first = pas[0]
    assert first.result_text == "원정타자1 : 삼진 아웃"
    assert first.wp_home_after == pytest.approx(0.52)
    assert first.wpa == pytest.approx(-2.0)
    homer = pas[2]
    assert homer.result_text == "원정타자3 : 좌익수 뒤 홈런"
    assert homer.wp_home_after == pytest.approx(0.382)
    assert homer.wpa == pytest.approx(11.3)


def test_invalid_win_probability_row_gives_none(pas):
    assert pas[19].wp_home_after is None
    assert pas[19].wpa is None


def test_pts_by_id_indexes_tracked_pitches(pas):
    pa = pas[0]
    assert len(pa.pts_by_id) == 5
    assert all(pid == pts["pitchId"] for pid, pts in pa.pts_by_id.items())


def test_walk_pitches_holds_two_strikes_on_fouls(pas):
    steps = list(relay.walk_pitches(pas[0].options, pas[0].pts_by_id))
    assert [(t["pitchResult"], b, s) for t, _, b, s in steps] == [
        ("T", 0, 0), ("F", 0, 1), ("F", 0, 2), ("B", 0, 2), ("S", 1, 2),
    ]
    assert all(p is not None for _, p, _, _ in steps)
    bunt = list(relay.walk_pitches(pas[3].options, pas[3].pts_by_id))
    assert [(t["pitchResult"], b, s) for t, _, b, s in bunt] == [("T", 0, 0), ("V", 0, 1), ("W", 0, 2), ("H", 0, 2)]


def test_walk_pitches_skips_non_pitch_options(pas):
    steps = list(relay.walk_pitches(pas[12].options, pas[12].pts_by_id))
    assert [(b, s) for _, _, b, s in steps] == [(0, 0), (0, 1), (0, 2), (1, 2), (2, 2), (3, 2), (3, 2)]


def test_walk_pitches_yields_none_when_pts_is_missing(pas):
    steps = list(relay.walk_pitches(pas[8].options, pas[8].pts_by_id))
    assert len(steps) == 2
    assert steps[0][1] is None
    assert steps[1][1] is not None


def test_no_pitch_plate_appearance(pas):
    walk = pas[25]
    assert walk.result_text == "홈타자4 : 자동 고의4구"
    assert list(relay.walk_pitches(walk.options, walk.pts_by_id)) == []


def test_walk_pitches_ignores_unknown_results_and_caps_balls():
    opts = [
        {"type": 8, "seqno": 1},
        {"type": 1, "seqno": 2, "pitchResult": "B", "ptsPitchId": "p1"},
        {"type": 1, "seqno": 3, "pitchResult": None, "ptsPitchId": "p2"},
        {"type": 7, "seqno": 4, "pitchResult": "B"},
        {"type": 1, "seqno": 5, "pitchResult": "B", "ptsPitchId": "p3"},
        {"type": 1, "seqno": 6, "pitchResult": "B"},
        {"type": 1, "seqno": 7, "pitchResult": "B"},
        {"type": 1, "seqno": 8, "pitchResult": "B"},
    ]
    steps = list(relay.walk_pitches(opts, {"p1": {"pitchId": "p1"}}))
    assert [t["seqno"] for t, _, _, _ in steps] == [2, 5, 6, 7, 8]
    assert [b for _, _, b, _ in steps] == [0, 1, 2, 3, 3]
    assert steps[0][1] == {"pitchId": "p1"}
    assert steps[1][1] is None


def test_pitch_row_follows_the_contract_order():
    t = {"type": 1, "stuff": "슬라이더", "speed": "133", "pitchResult": "S"}
    assert relay.pitch_row(t, PTS, 1, 2) == [
        3, 133, 2, 1, 2, 1, -1.523, 5.81, 5.101, -131.234, -5.3, -8.101, 28.445, -14.8, 3.42, 1.605,
    ]


@pytest.mark.parametrize(("stuff", "index"), [("직구", 0), ("스위퍼", 4), ("포크", 7), ("너클볼", 8), (None, 8), ("", 8)])
def test_pitch_row_type_index_falls_back_to_other(stuff, index):
    row = relay.pitch_row({"stuff": stuff, "speed": 140, "pitchResult": "B"}, PTS, 0, 0)
    assert row[0] == index
    assert PITCH_TYPES[index] == (stuff if stuff in PITCH_TYPES else "기타")


@pytest.mark.parametrize(("result", "code"), [("B", 0), ("T", 1), ("S", 2), ("V", 2), ("F", 3), ("W", 3), ("H", 4)])
def test_pitch_row_result_code(result, code):
    assert relay.pitch_row({"stuff": "직구", "speed": 150, "pitchResult": result}, PTS, 0, 0)[2] == code


@pytest.mark.parametrize(("stance", "value"), [("L", 0), ("R", 1), ("0", 1), (None, 1)])
def test_pitch_row_stance(stance, value):
    assert relay.pitch_row({"stuff": "직구", "speed": 150, "pitchResult": "B"}, {**PTS, "stance": stance}, 0, 0)[5] == value


@pytest.mark.parametrize(("speed", "value"), [("147.6", 147), (152, 152), (None, 0), ("", 0)])
def test_pitch_row_speed_is_an_integer(speed, value):
    assert relay.pitch_row({"stuff": "직구", "speed": speed, "pitchResult": "B"}, PTS, 0, 0)[1] == value


def test_fixture_pitch_rows_have_sixteen_fields(pas):
    rows = [
        relay.pitch_row(t, p, b, s)
        for pa in pas
        for t, p, b, s in relay.walk_pitches(pa.options, pa.pts_by_id)
        if p is not None
    ]
    assert len(rows) == 83
    assert all(len(r) == 16 for r in rows)
    assert {r[2] for r in rows} <= {0, 1, 2, 3, 4}


@pytest.mark.parametrize(
    ("text", "event"),
    [
        ("원정타자1 : 삼진 아웃", 0),
        ("원정타자2 : 볼넷", 1),
        ("홈타자4 : 자동 고의4구", 1),
        ("원정타자8 : 몸에 맞는 볼", 1),
        ("원정타자3 : 좌익수 뒤 홈런", 2),
        ("홈타자4 : 우중간 3루타", 3),
        ("홈타자2 : 우익선상 2루타", 4),
        ("원정타자4 : 우익수 앞 1루타", 5),
        ("홈타자7 : 내야안타", 5),
        ("원정타자6 : 중견수 희생플라이 아웃", 6),
        ("원정타자1 : 유격수 땅볼 아웃 (유격수->1루수 송구아웃)", 6),
        ("", 6),
    ],
)
def test_event_of(text, event):
    assert relay.event_of(text) == event


@pytest.mark.parametrize(
    ("state", "bases"),
    [
        ({"base1": "0", "base2": "0", "base3": "0"}, 0),
        ({"base1": "3", "base2": "0", "base3": "0"}, 1),
        ({"base1": "0", "base2": "3", "base3": "0"}, 2),
        ({"base1": "0", "base2": "0", "base3": "9"}, 4),
        ({"base1": "5", "base2": "0", "base3": "7"}, 5),
        ({"base1": "5", "base2": "7", "base3": "9"}, 7),
        ({"base1": "", "base2": None, "base3": "4"}, 4),
        ({}, 0),
    ],
)
def test_bases_of(state, bases):
    assert relay.bases_of(state) == bases


@pytest.mark.parametrize(
    ("metric", "expected"),
    [
        ({"homeTeamWinRate": 50.0, "awayTeamWinRate": 50.0, "wpaByPlate": -3.0}, 0.5),
        ({"homeTeamWinRate": 53.2, "awayTeamWinRate": 46.8, "wpaByPlate": 1.9}, 0.532),
        ({"homeTeamWinRate": 60.0, "awayTeamWinRate": 39.5}, 0.6),
        ({"homeTeamWinRate": 60.0, "awayTeamWinRate": 42.0}, None),
        ({"homeTeamWinRate": 0.0, "awayTeamWinRate": 0.0, "wpaByPlate": 0.0}, None),
        ({"homeTeamWinRate": 55.0}, None),
        ({}, None),
        (None, None),
    ],
)
def test_valid_home_wp(metric, expected):
    result = relay.valid_home_wp(metric)
    if expected is None:
        assert result is None
    else:
        assert result == pytest.approx(expected)


def test_load_game_drops_heavy_player_info_and_keeps_the_rest(tmp_path, game):
    heavy = copy.deepcopy(game)
    for item in heavy["textRelays"]:
        for t in item["textOptions"]:
            t["currentPlayersInfo"] = {"away": {"playerType": "batter"}, "home": {"playerType": "pitcher"}}
    path = tmp_path / "game.json"
    path.write_text(json.dumps(heavy, ensure_ascii=False), encoding="utf-8")
    loaded = relay.load_game(path)
    assert not any("currentPlayersInfo" in t for item in loaded["textRelays"] for t in item["textOptions"])
    assert loaded == game
