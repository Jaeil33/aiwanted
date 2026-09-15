import json
from pathlib import Path

import pytest

from fixture_games import FIXTURE_RAW, cases_game, load_fixture_game, make_raw_dir, pa_relay, shifted_game
from tmi_pipeline import build, io, stats, trust_states

GAME_KEYS = ["gameId", "date", "away", "home", "homeWin", "pas"]
PA_KEYS = [
    "inning", "half", "outs", "bases", "away", "home", "slotAway", "slotHome",
    "lineupAway", "lineupHome", "pitcher", "naverHomeWp",
]
AWAY = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9"]
HOME = ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8", "h9"]
INVALID_WP = {"homeTeamWinRate": 0.0, "awayTeamWinRate": 0.0, "wpaByPlate": 0.0}


def rates_2025() -> stats.SeasonRates:
    def rows(kind):
        payload = json.loads((FIXTURE_RAW / "naver" / "stats" / f"stats_2025_{kind}_all.json").read_text(encoding="utf-8"))
        return payload["result"]["seasonPlayerStats"]

    return stats.season_rates(rows("HITTER"), rows("PITCHER"))


@pytest.fixture()
def raw(tmp_path):
    base = load_fixture_game()  # 원정 HT 4 : 5 홈 LT
    tie = shifted_game(base, "20260816HTLT02026", "2026-08-16", innings=0)
    tie["game"]["awayTeamScore"] = tie["game"]["homeTeamScore"] = 5
    pa_relay(tie, 0)["metricOption"] = dict(INVALID_WP)  # 첫 타석 승리확률도 무효
    away_win = shifted_game(base, "20260817HTLT02026", "2026-08-17", innings=0)
    away_win["game"]["awayTeamScore"], away_win["game"]["homeTeamScore"] = 6, 2
    return make_raw_dir(tmp_path / "raw", [away_win, base, tie])


@pytest.fixture()
def states(raw):
    return trust_states.build_trust_states(raw)


def test_top_level_shape_uses_the_2025_season(states):
    rates = rates_2025()
    assert list(states) == ["season", "league", "players", "bullpens", "games"]
    assert states["season"] == 2025
    assert states["league"] == [round(x, 5) for x in rates.league_hitting]
    assert [g["gameId"] for g in states["games"]] == ["20260815HTLT02026", "20260816HTLT02026", "20260817HTLT02026"]
    assert all(list(g) == GAME_KEYS for g in states["games"])
    assert all(list(pa) == PA_KEYS for g in states["games"] for pa in g["pas"])


def test_home_win_from_the_final_score(states):
    assert [g["homeWin"] for g in states["games"]] == [1, None, 0]
    first = states["games"][0]
    assert (first["date"], first["away"], first["home"]) == ("2026-08-15", "HT", "LT")


def test_first_plate_appearance_without_earlier_win_probability_is_dropped(states):
    base, tie, _ = states["games"]
    assert len(base["pas"]) == 26
    # 첫 타석의 승리확률까지 무효면 두 번째 타석도 직전 유효 값이 없다
    assert len(tie["pas"]) == 25
    assert tie["pas"][0]["naverHomeWp"] == pytest.approx(0.495)
    assert (tie["pas"][0]["outs"], tie["pas"][0]["bases"]) == (1, 1)


def test_state_slots_lineups_and_pitcher_of_the_second_plate_appearance(states):
    assert states["games"][0]["pas"][0] == {
        "inning": 1, "half": 0, "outs": 1, "bases": 0, "away": 0, "home": 0,
        "slotAway": 1, "slotHome": 0,
        "lineupAway": ["a1", "a2", None, None, None, None, None, None, None],
        "lineupHome": [None] * 9,
        "pitcher": "hp1",
        "naverHomeWp": 0.52,
    }


def test_slots_follow_the_last_batter_of_each_team(states):
    pas = states["games"][0]["pas"]  # pas[i]는 원래 타석 i + 1
    home_first = pas[9]  # 1회말 홈타자1: 원정의 마지막 타자는 1번(두 번째 타석의 원정타자1)
    assert (home_first["inning"], home_first["half"], home_first["slotAway"], home_first["slotHome"]) == (1, 1, 1, 0)
    assert home_first["lineupAway"] == AWAY
    assert home_first["lineupHome"] == ["h1"] + [None] * 8
    second_bottom = pas[21]  # 2회말 홈타자1: 원정 마지막 4번 → slotAway 4, 홈 마지막 9번 → 이번 타자 1번이라 slotHome 0
    assert (second_bottom["slotAway"], second_bottom["slotHome"]) == (4, 0)
    assert (second_bottom["outs"], second_bottom["bases"], second_bottom["away"], second_bottom["home"]) == (0, 0, 4, 4)
    top_second = pas[18]  # 2회초 원정타자2: 홈 마지막 9번 → 9 % 9 = 0
    assert (top_second["slotAway"], top_second["slotHome"]) == (1, 0)
    assert pas[11]["slotHome"] == 2 and pas[11]["slotAway"] == 1  # 1회말 홈타자3


def test_pitcher_is_the_one_on_the_mound_when_the_plate_appearance_starts(states):
    pas = states["games"][0]["pas"]
    assert pas[5]["pitcher"] == "hp1"  # 원정타자7 타석 도중 교체
    assert pas[6]["pitcher"] == "hp2"
    assert pas[9]["pitcher"] == "ap1"


def test_lineup_reflects_a_pinch_hitter(states):
    pas = states["games"][0]["pas"]
    assert pas[18]["lineupAway"] == AWAY
    pinch = pas[19]  # 2회초 3번 타순 대타 원정대타3
    assert pinch["lineupAway"] == ["a1", "a2", "a3b", "a4", "a5", "a6", "a7", "a8", "a9"]
    assert pinch["lineupHome"] == HOME
    assert (pinch["slotAway"], pinch["slotHome"]) == (2, 0)
    assert all(pa["lineupAway"][2] == "a3b" for pa in pas[19:])


def test_naver_wp_is_the_last_valid_value_before_each_plate_appearance(states):
    pas = states["games"][0]["pas"]
    assert pas[18]["naverHomeWp"] == pytest.approx(0.51)  # 직전 홈타자9 타석
    assert pas[19]["naverHomeWp"] == pytest.approx(0.51)  # 직전 원정타자2 타석은 무효 행이라 건너뜀
    assert pas[20]["naverHomeWp"] == pytest.approx(0.49)
    assert pas[25]["naverHomeWp"] == pytest.approx(0.595)


def test_players_are_game_players_with_2025_records_only(states):
    rates = rates_2025()
    # a4는 2025 표본 0, hp1·a3b 등은 2025 기록 없음, z9·ap5·hp9는 경기에 나오지 않음
    assert set(states["players"]) == {"a1", "a2", "h1", "h3", "ap1", "hp2"}
    assert states["players"]["a1"] == rates.hitters["a1"]["rel"]
    assert states["players"]["hp2"] == rates.pitchers["hp2"]["rel"]
    assert states["bullpens"] == {team: stats.bullpen(rates, team)["rel"] for team in ("HT", "LT")}


def test_reads_only_the_2025_season_stats(raw):
    requested = []

    def recording_load(path):
        requested.append(Path(path).name)
        return io.load_json(path)

    trust_states.build_trust_states(raw, load_json=recording_load)
    assert [name for name in requested if name.startswith("stats_")] == [
        "stats_2025_HITTER_all.json",
        "stats_2025_PITCHER_all.json",
    ]


def test_trust_stage_writes_states_and_summary(raw, tmp_path):
    out = tmp_path / "build"
    summary = build.STAGES["trust"](raw, out)
    written = json.loads((out / "trust" / "states.json").read_text(encoding="utf-8"))
    assert written == trust_states.build_trust_states(raw)
    pas = [pa for game in written["games"] for pa in game["pas"]]
    assert summary["games"] == 3
    assert summary["plate_appearances"] == len(pas) == 26 + 25 + 26
    assert summary["tie_games"] == 1
    nulls = sum(slot is None for pa in pas for slot in pa["lineupAway"] + pa["lineupHome"])
    assert summary["lineup_null_ratio"] == pytest.approx(nulls / (18 * len(pas)), abs=1e-4)
    pitched = sum(pa["pitcher"] in written["players"] for pa in pas)
    assert summary["pitcher_2025_ratio"] == pytest.approx(pitched / len(pas), abs=1e-4)
    assert list(build.STAGES) == ["snapshot", "context", "evidence", "trust"]


# --- 첫 투구 투수·미완료 타석 (cases_game = 픽스처 경기 + 3회) --------------------------------------------

def test_pitcher_is_the_first_pitch_pitcher_after_a_change_following_the_intro():
    pas = trust_states.game_states(cases_game())["pas"]
    third = pas[26:]  # 3회 타석(픽스처 26개 뒤)
    assert [(pa["inning"], pa["half"], pa["outs"], pa["bases"], pa["pitcher"]) for pa in third] == [
        (3, 0, 0, 0, "hp3"),  # 원정타자5: 소개에는 홈투수2, 소개 뒤 교체로 첫 공부터 홈투수3
        (3, 0, 0, 1, "hp3"),
        (3, 0, 1, 2, "hp3"),
        (3, 1, 0, 0, "ap1"),  # 홈대타6: 2구 뒤 원정투수2로 바뀌어도 첫 공의 투수
        (3, 1, 0, 1, "ap2"),
        (3, 1, 2, 0, "ap2"),
    ]
    assert third[0]["naverHomeWp"] == pytest.approx(0.587)


def test_incomplete_plate_appearance_is_not_a_trust_state():
    game = cases_game()
    pas = trust_states.game_states(game)["pas"]
    # 3회 7타석 중 결과 옵션이 없는 원정타자8 타석(3회초 2사 2루, 견제사로 3아웃)만 빠진다
    assert len(pas) == 26 + 6
    assert (3, 0, 2, 2) not in [(pa["inning"], pa["half"], pa["outs"], pa["bases"]) for pa in pas]
    # 빠진 타석은 타순 진행에도 세지 않는다: 원정의 마지막 완료 타석이 7번이라 3회말 slotAway 7(8번 차례)
    bottom = pas[29]
    assert (bottom["inning"], bottom["half"], bottom["slotAway"], bottom["slotHome"]) == (3, 1, 7, 5)
    assert bottom["lineupHome"] == ["h1", "h2", "h3", "h4", "h5", "h6b", "h7", "h8", "h9"]
    # 미완료 타석을 완료로 바꾸면 상태가 하나 늘어난다
    unfinished = pa_relay(game, 30)
    unfinished["textOptions"].append({"seqno": 181, "type": 13, "text": "원정타자8 : 가상 결과"})
    assert len(trust_states.game_states(game)["pas"]) == 26 + 7
