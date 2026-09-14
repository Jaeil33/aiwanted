import json
from pathlib import Path

import pytest

from tmi_pipeline import stats

STATS_DIR = Path(__file__).parent / "fixtures" / "raw" / "naver" / "stats"

# 픽스처 타자 a1·a2·h1의 합계 [K, BB+HBP, HR, 3B, 2B, 1B, OUT] (기록 없는 z0는 빠진다)
HIT_TOTALS = [210, 115, 27, 6, 53, 214, 540]


def _rows(kind: str) -> list[dict]:
    payload = json.loads((STATS_DIR / f"stats_2026_{kind}_all.json").read_text(encoding="utf-8"))
    return payload["result"]["seasonPlayerStats"]


@pytest.fixture(scope="module")
def rates():
    return stats.season_rates(_rows("HITTER"), _rows("PITCHER"))


def test_shrinkage_priors():
    assert stats.K_H == 200.0
    assert stats.K_P == 250.0


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("180 2/3", 180 + 2 / 3),
        ("155", 155.0),
        ("60 ⅔", 60 + 2 / 3),
        ("45 ⅓", 45 + 1 / 3),
        ("⅓", 1 / 3),
        ("⅔", 2 / 3),
        ("2/3", 2 / 3),
        ("0", 0.0),
        ("", 0.0),
        (None, 0.0),
    ],
)
def test_innings_parses_naver_innings_text(text, expected):
    assert stats.innings(text) == pytest.approx(expected)


def test_rel_without_sample_is_all_ones():
    lg = [0.2, 0.09, 0.025, 0.004, 0.045, 0.15, 0.486]
    assert stats.rel([0] * 7, stats.K_H, lg) == [1.0] * 7


def test_rel_shrinks_toward_league():
    assert stats.rel([3, 1], 4, [0.5, 0.5]) == [1.25, 0.75]


def test_rel_rounds_to_four_decimals():
    # n=1, prior 2: 비율 [1.6/3, 0.6/3, 0.8/3] → 리그 대비 [1.7778, 0.6667, 0.6667]
    assert stats.rel([1, 0, 0], 2, [0.3, 0.3, 0.4]) == [1.7778, 0.6667, 0.6667]


def test_rel_with_zero_league_rate_is_neutral():
    assert stats.rel([0, 0], 10, [1.0, 0.0]) == [1.0, 1.0]


def test_season_rates_skips_players_without_sample(rates):
    assert set(rates.hitters) == {"a1", "a2", "h1"}
    assert set(rates.pitchers) == {"ap1", "ap2", "ap3", "hp1", "hp2"}


def test_hitter_counts_line_and_rel(rates):
    a1 = rates.hitters["a1"]
    assert a1["name"] == "원정타자1"
    assert a1["team"] == "HT"
    assert a1["counts"] == [80, 45, 10, 3, 20, 87, 200]
    assert a1["line"] == {"pa": 445, "avg": 0.3, "obp": 0.37, "slg": 0.45, "hr": 10, "k": 80, "bb": 40}
    assert a1["rel"] == stats.rel(a1["counts"], stats.K_H, rates.league_hitting)


def test_league_hitting_is_the_pooled_hitter_mix(rates):
    assert rates.league_hitting == pytest.approx([t / sum(HIT_TOTALS) for t in HIT_TOTALS])
    assert sum(rates.league_hitting) == pytest.approx(1.0)
    assert len(rates.league_pitching) == 7
    assert sum(rates.league_pitching) == pytest.approx(1.0)


def test_pitcher_counts_split_non_hr_hits_by_league_hitting_mix(rates):
    ap1 = rates.pitchers["ap1"]
    non_hr = HIT_TOTALS[3] + HIT_TOTALS[4] + HIT_TOTALS[5]
    nh = 140 - 15
    assert ap1["counts"] == pytest.approx([
        130, 50, 15,
        nh * HIT_TOTALS[3] / non_hr, nh * HIT_TOTALS[4] / non_hr, nh * HIT_TOTALS[5] / non_hr,
        3 * (150 + 1 / 3) - 130,
    ])
    assert ap1["line"] == {"era": 3.5, "ip": "150 1/3", "k": 130, "bb": 45, "whip": 1.23, "sv": 0, "hold": 0, "g": 25}
    assert ap1["name"] == "원정투수1"
    assert ap1["team"] == "HT"
    assert ap1["rel"] == stats.rel(ap1["counts"], stats.K_P, rates.league_pitching)


def test_pitcher_outs_never_negative(rates):
    # 10이닝 35삼진: 3·이닝 − 삼진 < 0 → 0
    assert rates.pitchers["ap3"]["counts"][6] == 0.0


def test_bullpen_keeps_relievers_only(rates):
    pen = stats.bullpen(rates, "HT")
    assert pen["id"] == "HT-pen"
    assert pen["team"] == "HT"
    assert pen["name"] == "불펜"
    # ap1은 경기당 2이닝 이상(선발), ap3는 8경기 미만
    assert pen["n"] == 1
    assert pen["rel"] == stats.rel(rates.pitchers["ap2"]["counts"], stats.K_P, rates.league_pitching)


def test_bullpen_without_relievers_is_league_average(rates):
    assert stats.bullpen(rates, "NC") == {"id": "NC-pen", "team": "NC", "name": "불펜", "rel": [1.0] * 7, "n": 0}
