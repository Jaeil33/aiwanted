import json
import math

import numpy as np
import pytest

from tmi_pipeline import build, evidence
from tmi_pipeline.contract import load_measured

TEAMS = ["HT", "LT", "NC", "HH", "LG", "OB", "SS", "SK", "KT", "WO"]
PARKS = ["잠실", "사직", "광주", "문학", "대구"]
TRAIN_SEASONS = [2021, 2022, 2023, 2024, 2025]
GAMES_PER_SEASON = 320
# 합성 데이터에서 득점에 실제로 영향을 주는 변수: 기온 10°C(효과 단위 1)당 log 득점
TEMP_EFFECT = 0.18

EVIDENCE_KEYS = {"method", "trainSeasons", "testSeason", "games", "joint", "items"}
ITEM_KEYS = {"id", "beta", "se", "ciLow", "ciHigh", "runsPctPerUnit", "n", "test", "verdict", "note"}
GAIN_KEYS = {"devianceGainPerGame", "ciLow", "ciHigh"}
HOME_NOTE = "홈팀은 이기고 있으면 9회말을 치르지 않아 득점 기준 홈 이점이 작게 잡힌다"


def make_row(game_id, season, team, opp, stadium, home, runs, **values):
    row = {
        "game_id": game_id, "date": f"{season}-06-01", "season": season, "team": team, "opp": opp,
        "stadium": stadium, "home": home, "runs": runs, "start_hour": 18.5,
        "temp_c": 20.0, "wind_ms": 0.0, "rain_pre3h": 0.0, "day_game": 0, "weekend": 0, "travel_km": 0.0,
        "after_off_day": 0, "starter_short_rest": 0, "starter_long_rest": 0, "opp_starter_rest_days": None,
        "weather_missing": 0, "dome": 0,
    }
    row.update(values)
    return row


def synthetic_rows(seed: int = 5) -> list[dict]:
    """6시즌 팀-경기 행. 득점 = 공격(팀·시즌) × 수비(상대·시즌) × 구장 × exp(TEMP_EFFECT·기온 단위), 나머지 변수는 효과 0."""
    rng = np.random.default_rng(seed)
    rows = []
    for season in [*TRAIN_SEASONS, 2026]:
        attack = dict(zip(TEAMS, rng.normal(0, 0.12, len(TEAMS))))
        defense = dict(zip(TEAMS, rng.normal(0, 0.12, len(TEAMS))))
        park_effect = dict(zip(PARKS, rng.normal(0, 0.08, len(PARKS))))
        for g in range(GAMES_PER_SEASON):
            home, away = (str(t) for t in rng.choice(TEAMS, size=2, replace=False))
            park = PARKS[int(rng.integers(len(PARKS)))]
            shared = {
                "temp_c": round(float(rng.uniform(2, 38)), 1),
                "wind_ms": round(float(rng.uniform(0, 9)), 2),
                "rain_pre3h": float(rng.choice([0.0, 0.0, 0.0, 0.0, 0.4, 2.5])),
                "day_game": int(rng.random() < 0.15),
                "weekend": int(rng.random() < 0.35),
            }
            x_temp = (shared["temp_c"] - 20) / 10
            for team, opp, is_home in ((away, home, 0), (home, away, 1)):
                rest = int(rng.integers(3, 12)) if rng.random() < 0.8 else None
                mu = math.exp(1.45 + attack[team] + defense[opp] + park_effect[park] + TEMP_EFFECT * x_temp)
                rows.append(make_row(
                    f"{season}{g:04d}{away}{home}", season, team, opp, park, is_home, int(rng.poisson(mu)),
                    **shared,
                    travel_km=round(float(rng.uniform(0, 400)), 1) if rng.random() < 0.4 else 0.0,
                    after_off_day=int(rng.random() < 0.25),
                    starter_short_rest=int(rest is not None and rest <= 4),
                    starter_long_rest=int(rest is not None and rest >= 8),
                    opp_starter_rest_days=rest,
                ))
    return rows


@pytest.fixture(scope="module")
def rows():
    return synthetic_rows()


@pytest.fixture(scope="module")
def train(rows):
    return evidence.fit_train(rows)


@pytest.fixture(scope="module")
def result(rows):
    return evidence.build_evidence(rows)


def test_variables_follow_measured_json_order():
    assert evidence.VARIABLES == [d["id"] for d in load_measured()]
    assert len(evidence.VARIABLES) == 10
    assert evidence.VARIABLES[-1] == "home"


def test_design_columns_names_and_transform():
    rows = [
        make_row("g1", 2024, "HT", "LT", "사직", 0, 3, temp_c=30.0),
        make_row("g1", 2024, "LT", "HT", "사직", 1, 5, temp_c=30.0),
        make_row("g2", 2025, "LT", "NC", "창원", 0, 2, temp_c=15.0, travel_km=600.0),
        make_row("g2", 2025, "NC", "LT", "창원", 1, 4, temp_c=15.0),
    ]
    d = evidence.design(rows, ["temp_c", "travel_km", "home"])
    assert d.names == [
        "(intercept)",
        "off:HT:2024", "off:LT:2024", "off:LT:2025", "off:NC:2025",
        "def:HT:2024", "def:LT:2024", "def:LT:2025", "def:NC:2025",
        "park:사직", "park:창원",
        "temp_c", "travel_km", "home",
    ]
    assert d.X.shape == (4, 14)
    np.testing.assert_array_equal(d.y, [3, 5, 2, 4])
    assert list(d.game_ids) == ["g1", "g1", "g2", "g2"]
    assert d.factor_mask.tolist() == [False] + [True] * 10 + [False] * 3
    assert d.names[d.var_slice] == ["temp_c", "travel_km", "home"]
    # 기온 30 → 1.0, 15 → −0.5, 이동 600km는 450으로 잘려 1.5
    np.testing.assert_allclose(d.X[:, d.var_slice], [[1.0, 0.0, 0.0], [1.0, 0.0, 1.0], [-0.5, 1.5, 0.0], [-0.5, 0.0, 1.0]])
    np.testing.assert_array_equal(d.X[:, 0], 1.0)
    first = dict(zip(d.names, d.X[0]))
    assert (first["off:HT:2024"], first["def:LT:2024"], first["park:사직"]) == (1.0, 1.0, 1.0)
    assert d.X[:, d.factor_mask].sum(axis=1).tolist() == [3.0] * 4


def test_design_without_variables_has_only_intercept_and_factors():
    rows = [make_row("g1", 2026, "HT", "LT", "사직", 0, 3), make_row("g1", 2026, "LT", "HT", "사직", 1, 5)]
    d = evidence.design(rows, [])
    assert d.names == ["(intercept)", "off:HT:2026", "off:LT:2026", "def:HT:2026", "def:LT:2026", "park:사직"]
    assert d.names[d.var_slice] == []


@pytest.mark.parametrize(
    ("ci_low", "ci_high", "test_low", "expected"),
    [
        (0.01, 0.05, 0.002, "real"),
        (-0.05, -0.01, 0.0001, "real"),
        (0.01, 0.05, 0.0, "maybe"),
        (0.01, 0.05, -0.003, "maybe"),
        (-0.02, 0.03, 0.004, "maybe"),
        (-0.02, 0.03, -0.001, "useless"),
        (0.0, 0.03, -0.001, "useless"),
        (-0.03, 0.0, 0.0, "useless"),
    ],
)
def test_verdict_rule(ci_low, ci_high, test_low, expected):
    assert evidence.verdict(ci_low, ci_high, test_low) == expected


def test_fit_train_recovers_the_effect_with_intervals(rows, train):
    assert evidence.FACTOR_PENALTY == 1.0
    assert set(train.beta) == set(evidence.VARIABLES)
    assert train.beta["temp_c"] == pytest.approx(TEMP_EFFECT, abs=0.03)
    for v in evidence.VARIABLES:
        assert train.se[v] > 0
        assert train.ci_low[v] == pytest.approx(train.beta[v] - 1.96 * train.se[v])
        assert train.ci_high[v] == pytest.approx(train.beta[v] + 1.96 * train.se[v])
    assert train.games == len(TRAIN_SEASONS) * GAMES_PER_SEASON
    assert train.n["home"] == len(TRAIN_SEASONS) * GAMES_PER_SEASON
    assert train.n["temp_c"] == sum(1 for r in rows if r["season"] in TRAIN_SEASONS and r["temp_c"] != 20.0)
    assert train.n["weekend"] == sum(1 for r in rows if r["season"] in TRAIN_SEASONS and r["weekend"])


def test_fit_train_never_sees_the_test_season(rows, train):
    changed = [dict(r, runs=r["runs"] * 3 + 7) if r["season"] == 2026 else r for r in rows]
    assert evidence.fit_train(changed).beta == train.beta


def test_evaluate_test_detects_the_real_effect_deterministically(rows, train):
    first = evidence.evaluate_test(rows, train.beta, boot=400, seed=3)
    assert first == evidence.evaluate_test(rows, train.beta, boot=400, seed=3)
    assert first.games == GAMES_PER_SEASON
    assert set(first.by_variable) == set(train.beta)
    temp = first.by_variable["temp_c"]
    assert 0 < temp.ci_low <= temp.gain <= temp.ci_high
    assert first.joint.ci_low > 0
    other_seed = evidence.evaluate_test(rows, train.beta, boot=400, seed=4)
    assert other_seed.by_variable["temp_c"].gain == temp.gain
    assert other_seed.by_variable["temp_c"].ci_low != temp.ci_low


def test_zero_effects_give_zero_gain(rows):
    result = evidence.evaluate_test(rows, {v: 0.0 for v in evidence.VARIABLES}, boot=100, seed=1)
    assert result.joint.gain == pytest.approx(0.0, abs=1e-9)
    assert all(g.gain == pytest.approx(0.0, abs=1e-9) for g in result.by_variable.values())


def test_build_evidence_matches_the_contract(result):
    assert set(result) == EVIDENCE_KEYS
    assert result["trainSeasons"] == TRAIN_SEASONS
    assert result["testSeason"] == 2026
    assert result["games"] == {"train": len(TRAIN_SEASONS) * GAMES_PER_SEASON, "test": GAMES_PER_SEASON}
    assert set(result["joint"]) == GAIN_KEYS
    assert [item["id"] for item in result["items"]] == evidence.VARIABLES
    for item in result["items"]:
        assert set(item) == ITEM_KEYS
        assert set(item["test"]) == GAIN_KEYS | {"games"}
        assert item["test"]["games"] == GAMES_PER_SEASON
        assert item["ciLow"] <= item["beta"] <= item["ciHigh"]
        assert item["runsPctPerUnit"] == pytest.approx((math.exp(item["beta"]) - 1) * 100, abs=1e-3)
        assert item["verdict"] == evidence.verdict(item["ciLow"], item["ciHigh"], item["test"]["ciLow"])
        assert isinstance(item["n"], int) and item["note"]
    assert all(word in result["method"] for word in ("포아송", "공격", "수비", "구장", "2021", "2025", "2026", "2,000"))
    assert json.loads(json.dumps(result, allow_nan=False)) == result


def test_build_evidence_judges_real_and_useless_variables(result):
    items = {item["id"]: item for item in result["items"]}
    assert items["temp_c"]["verdict"] == "real"
    assert items["weekend"]["verdict"] == "useless"


def test_notes_explain_each_result(rows, result):
    items = {item["id"]: item for item in result["items"]}
    temp = items["temp_c"]["note"]
    assert temp.startswith("기온: 10°C 오를 때 득점 +")
    assert "(95% 구간 +" in temp
    assert "2026 예측 개선 확인" in temp
    weekend = items["weekend"]["note"]
    assert weekend.startswith("주말 경기: 토·일요일일 때 득점 ")
    assert "−" in weekend
    assert weekend.endswith("2026 예측 개선은 확인되지 않음")
    train_rows = [r for r in rows if r["season"] in TRAIN_SEASONS]
    share = round(100 * sum(r["opp_starter_rest_days"] is not None for r in train_rows) / len(train_rows))
    for variable in ("starter_short_rest", "starter_long_rest"):
        assert f"{share}%" in items[variable]["note"]
    assert HOME_NOTE in items["home"]["note"]
    assert HOME_NOTE not in temp


def test_evidence_stage_reads_team_games_and_writes_the_app_file(tmp_path, rows):
    out = tmp_path / "build"
    (out / "context").mkdir(parents=True)
    (out / "context" / "team_games.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    summary = build.STAGES["evidence"](tmp_path / "raw", out)
    written = json.loads((out / "app" / "evidence.json").read_text(encoding="utf-8"))
    assert [item["id"] for item in written["items"]] == evidence.VARIABLES
    assert summary["games"] == written["games"]
    assert summary["items"] == {
        item["id"]: {"verdict": item["verdict"], "runsPctPerUnit": round(item["runsPctPerUnit"], 2)} for item in written["items"]
    }
    assert list(build.STAGES)[:3] == ["snapshot", "context", "evidence"]
