import copy
import dataclasses
import json
from pathlib import Path

import pytest

from fixture_games import cases_game
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
        "state", "pitcher_id", "pitcher_ids", "options", "pts_by_id", "result_text", "complete", "runs_in", "event",
        "wp_home_after", "wpa",
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
        # 스트라이크 낫 아웃: 1루에서 잡혀도, 폭투·포일·실책으로 출루해도 K
        ("원정타자7 : 포수 스트라이크 낫 아웃 (포수 태그아웃)", 0),
        ("원정타자7 : 포수 스트라이크 낫 아웃 (포수->1루수 1루 터치아웃)", 0),
        ("홈타자8 : 스트라이크 낫아웃 폭투", 0),
        ("홈타자8 : 스트라이크 낫아웃 포일", 0),
        ("홈타자8 : 포수 스트라이크 낫아웃 실책으로 출루 (포수 송구 실책->1루수)", 0),
        ("홈타자8 : 포수 스트라이크 낫아웃 다른주자 수비로 출루", 0),
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


# --- 첫 투구 투수·빈 타석·미완료 타석·낫 아웃 (cases_game = 픽스처 경기 + 3회) ------------------------------

@pytest.fixture(scope="module")
def cases():
    return cases_game()


@pytest.fixture(scope="module")
def case_pas(cases):
    return relay.plate_appearances(cases)


def _intro_pitcher(pa) -> str:
    return next(t for t in pa.options if t["type"] == 8)["currentGameState"]["pitcher"]


def test_cases_game_appends_a_third_inning_to_the_fixture(pas, case_pas):
    assert len(case_pas) == 34
    assert [pa.index for pa in case_pas] == list(range(34))
    assert [(pa.batter_id, pa.state, pa.result_text) for pa in case_pas[:27]] == [
        (pa.batter_id, pa.state, pa.result_text) for pa in pas
    ]
    assert [(pa.inning, pa.half, pa.batter_id, pa.bat_order) for pa in case_pas[27:]] == [
        (3, 0, "a5", 5), (3, 0, "a6", 6), (3, 0, "a7", 7), (3, 0, "a8", 8),
        (3, 1, "h6b", 6), (3, 1, "h7", 7), (3, 1, "h8", 8),
    ]
    assert case_pas[27].state == {"inning": 3, "half": 0, "outs": 0, "bases": 0, "away": 4, "home": 5}


def test_pitcher_is_the_first_pitch_pitcher_when_the_change_follows_the_intro(case_pas):
    pa = case_pas[27]  # 원정타자5 소개 뒤 홈투수2 → 홈투수3 교체, 첫 공부터 홈투수3
    assert _intro_pitcher(pa) == "hp2"
    assert (pa.pitcher_id, pa.pitcher_ids) == ("hp3", ["hp3"])


def test_pitchers_of_the_third_inning(case_pas):
    assert [(pa.batter_id, pa.pitcher_id, pa.pitcher_ids) for pa in case_pas[27:]] == [
        ("a5", "hp3", ["hp3"]),
        ("a6", "hp3", ["hp3"]),
        ("a7", "hp3", ["hp3"]),
        ("a8", "hp3", ["hp3"]),
        ("h6b", "ap1", ["ap1", "ap2"]),  # 2구 뒤 원정투수1 → 원정투수2
        ("h7", "ap2", ["ap2"]),
        ("h8", "ap2", ["ap2"]),
    ]


def test_pitcher_ids_list_each_pitcher_during_the_plate_appearance(pas):
    mid = pas[6]  # 원정타자7: 2구 뒤 홈투수1 → 홈투수2
    assert (mid.pitcher_id, mid.pitcher_ids) == ("hp1", ["hp1", "hp2"])
    # 원정타자8: 첫 공에 currentGameState가 없으면 투수가 적힌 다음 공
    assert pas[7].options[1]["type"] == 1 and "currentGameState" not in pas[7].options[1]
    assert (pas[7].pitcher_id, pas[7].pitcher_ids) == ("hp2", ["hp2"])
    assert all(pa.pitcher_ids == [pa.pitcher_id] for pa in pas if pa.index != 6)


def test_plate_appearance_without_pitches_keeps_the_intro_pitcher(pas):
    walk = pas[25]  # 자동 고의4구
    assert (walk.pitcher_id, walk.pitcher_ids, walk.complete) == ("ap1", ["ap1"], True)


def test_empty_pinch_hitter_plate_appearance_is_skipped(cases, case_pas):
    heads = [r for r in relay.chrono(cases) if any(t["type"] == 8 and t.get("batterRecord") for t in r["textOptions"])]
    assert len(heads) == 35
    empty = next(r for r in heads if r["inn"] == 3 and r["title"] == "6번타자 홈타자6")
    assert [t["type"] for t in relay.sorted_options(empty)] == [8, 2, 2]  # 타자 소개, 수비 교체, 대타 교체
    used = {t["seqno"] for pa in case_pas for t in pa.options}
    assert not used & {t["seqno"] for t in empty["textOptions"]}
    assert "h6" not in [pa.batter_id for pa in case_pas[27:]]


def test_incomplete_plate_appearance_is_kept_but_not_complete(pas, case_pas):
    assert all(pa.complete for pa in pas)
    assert [pa.index for pa in case_pas if not pa.complete] == [30]
    cut = case_pas[30]  # 원정타자8: 2구 뒤 2루주자 견제사로 3아웃, 결과 문장 없음
    assert cut.batter_id == "a8"
    assert (cut.result_text, cut.runs_in) == ("", 0)
    assert [t["pitchResult"] for t in cut.options if t["type"] == 1] == ["B", "T"]


def test_dropped_third_strike_counts_as_a_strikeout(case_pas):
    assert case_pas[29].result_text == "원정타자7 : 포수 스트라이크 낫 아웃 (포수->1루수 1루 터치아웃)"
    assert [(pa.batter_id, pa.event) for pa in case_pas[27:] if pa.complete] == [
        ("a5", 5), ("a6", 6), ("a7", 0), ("h6b", 5), ("h7", 6), ("h8", 0),
    ]


INTRO = {
    "type": 8, "text": "1번타자 가상타자", "currentGameState": {"pitcher": "xp1", "out": "0"},
    "batterRecord": {"pcode": "x1", "name": "가상타자", "batOrder": 1, "hitType": "우투우타"},
}


def _mini_game(*relays: tuple[int, int, list[dict]]) -> dict:
    """(이닝, homeOrAway, 옵션들) relay마다 seqno를 차례로 매긴 최소 경기."""
    seq, items = 0, []
    for inn, half, options in relays:
        numbered = []
        for option in options:
            seq += 1
            numbered.append({"seqno": seq, **copy.deepcopy(option)})
        items.append({"inn": inn, "homeOrAway": str(half), "textOptions": numbered})
    return {"game": {"gameId": "20260101XXYY02026"}, "textRelays": items}


def _pitch_option(pitcher: str | None) -> dict:
    option = {"type": 1, "pitchResult": "B"}
    if pitcher is not None:
        option["currentGameState"] = {"pitcher": pitcher}
    return option


def test_plate_appearances_need_a_pitch_or_a_result():
    game = _mini_game(
        (1, 0, [INTRO]),
        (1, 0, [INTRO, {"type": 7, "text": "비디오 판독"}]),
        (1, 0, [INTRO, {"type": 2, "text": "투수 가상투수 : 투수 가상투수2 (으)로 교체"}]),
        (1, 0, [INTRO, {"type": 13, "text": "가상타자 : 자동 고의4구"}]),
        (1, 0, [INTRO, _pitch_option("xp2")]),
        (1, 0, [INTRO, _pitch_option(None), _pitch_option("xp3"), _pitch_option("xp3"), _pitch_option("xp2"),
                {"type": 23, "text": "가상타자 : 중견수 앞 1루타"}]),
        (1, 0, [INTRO, _pitch_option(None)]),
    )
    pas = relay.plate_appearances(game)
    assert [pa.index for pa in pas] == [0, 1, 2, 3]
    assert [(pa.complete, pa.pitcher_id, pa.pitcher_ids) for pa in pas] == [
        (True, "xp1", ["xp1"]),  # 투구가 없으면 타자 소개의 투수
        (False, "xp2", ["xp2"]),
        (True, "xp3", ["xp3", "xp2"]),  # 투수 없는 공은 건너뛰고, 연속 중복은 하나로
        (False, "xp1", ["xp1"]),  # 투수가 적힌 공이 없으면 타자 소개의 투수
    ]


# --- 교체 기록 ---------------------------------------------------------------------------------------------

def test_substitution_record_fields():
    assert [f.name for f in dataclasses.fields(relay.Substitution)] == [
        "seq", "inning", "half", "side", "slot", "in_id", "out_id", "kind",
    ]
    sub = relay.Substitution(1, 1, 0, "away", 3, "x2", "x1", "pinch_hitter")
    with pytest.raises(dataclasses.FrozenInstanceError):
        sub.slot = 4


def test_substitutions_of_the_cases_game_in_time_order(cases):
    subs = relay.substitutions(cases)
    assert [(s.inning, s.half, s.side, s.slot, s.in_id, s.out_id, s.kind) for s in subs] == [
        (1, 0, "home", None, "hp2", "hp1", "pitcher"),
        (2, 0, "away", 3, "a3b", "a3", "pinch_hitter"),
        (3, 0, "home", None, "hp3", "hp2", "pitcher"),
        (3, 0, "away", 5, "a5r", "a5", "pinch_runner"),
        (3, 1, "away", 7, "a7d", "a7", "defense"),
        (3, 1, "home", 6, "h6b", "h6", "pinch_hitter"),
        (3, 1, "away", None, "ap2", "ap1", "pitcher"),
    ]
    changes = [t for r in relay.chrono(cases) for t in relay.sorted_options(r) if t["type"] == 2]
    assert [s.seq for s in subs] == [t["seqno"] for t in changes]
    assert [s.seq for s in subs] == sorted(s.seq for s in subs)


def _change_option(text: str, in_pos: str, *, turn=13, in_id: str = "x2", out_id: str = "x1") -> dict:
    in_player = {"playerName": "가상선수2", "playerPos": in_pos, "playerId": in_id}
    if turn is not None:
        in_player["outPlayerTurn"] = turn
    return {
        "type": 2, "text": text,
        "playerChange": {
            "liveText": text, "type": "substitution", "inPlayer": in_player,
            "outPlayer": {"playerName": "가상선수1", "playerPos": "지명타자", "playerId": out_id},
        },
    }


@pytest.mark.parametrize(
    ("turn", "slot"),
    [(13, 3), (29, 9), (15, 5), (10, None), (20, None), (0, None), ("17", 7), (None, None)],
)
def test_substitution_slot_is_out_player_turn_mod_ten(turn, slot):
    game = _mini_game((5, 1, [INTRO, _change_option("7번타자 가상선수1 : 대타 가상선수2 (으)로 교체", "대타", turn=turn)]))
    [sub] = relay.substitutions(game)
    assert sub.slot == slot


@pytest.mark.parametrize(
    ("text", "in_pos", "half", "kind", "side"),
    [
        ("8번타자 가상타자 : 대타 가상대타 (으)로 교체", "대타", 0, "pinch_hitter", "away"),
        ("2루주자 가상타자 : 대주자 가상주자 (으)로 교체", "대주자", 1, "pinch_runner", "home"),
        ("투수 가상투수 : 투수 가상대타 (으)로 교체", "투수", 0, "pitcher", "home"),  # 이름 속 '대타'는 종류가 아니다
        ("3루수 가상대주자 : 3루수 가상수비 (으)로 교체", "3루수", 1, "defense", "away"),
        ("우익수 가상타자 : 중견수 가상수비 (으)로 교체", "중견수", 0, "defense", "home"),
        ("포수 가상포수 : 포수 가상포수2 (으)로 교체", "포수", 1, "defense", "away"),
        ("가상 교체", "대주자", 1, "pinch_runner", "home"),  # 문장에 ':'가 없으면 inPlayer.playerPos
        ("코치 가상코치 : 감독 가상감독 (으)로 교체", "감독", 0, "other", "home"),
    ],
)
def test_substitution_kind_and_side_come_from_the_incoming_position(text, in_pos, half, kind, side):
    game = _mini_game((6, half, [_change_option(text, in_pos)]))
    [sub] = relay.substitutions(game)
    assert (sub.kind, sub.side, sub.inning, sub.half, sub.in_id, sub.out_id) == (kind, side, 6, half, "x2", "x1")


def test_substitutions_skip_changes_without_both_player_ids():
    shift_text = "중견수 가상타자 : 우익수(으)로 수비위치 변경"
    shift = {"type": 2, "text": shift_text, "playerChange": {
        "liveText": shift_text, "type": "shift", "shiftMessage": " 우익수(으)로 수비위치 변경",
        "shiftPlayer": {"playerName": "가상타자", "playerPos": "중견수", "playerId": "x5", "outPlayerTurn": 1},
    }}
    text_only = {"type": 2, "text": "6번타자 가상타자 : 대타 가상대타 (으)로 교체", "playerChange": {
        "liveText": "6번타자 가상타자 : 대타 가상대타 (으)로 교체", "type": "text",
    }}
    bare = {"type": 2, "text": "투수 가상투수 : 투수 가상투수2 (으)로 교체"}
    no_out_id = _change_option("투수 가상투수 : 투수 가상투수2 (으)로 교체", "투수", out_id="")
    kept = _change_option("투수 가상투수 : 투수 가상투수2 (으)로 교체", "투수", turn=10, in_id="xp2", out_id="xp1")
    game = _mini_game((4, 0, [INTRO, shift, text_only, bare, no_out_id, _pitch_option("xp1")]), (4, 0, [kept]))
    assert [(s.in_id, s.out_id, s.kind, s.slot, s.side) for s in relay.substitutions(game)] == [
        ("xp2", "xp1", "pitcher", None, "home"),
    ]
