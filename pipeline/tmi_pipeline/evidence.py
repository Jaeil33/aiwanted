"""실측 변수 판정: 팀-경기 포아송 GLM + 시간 순 검증(ADR-004).

log μ = 절편 + 공격(팀·시즌) + 수비(상대·시즌) + 구장 + Σ βⱼ·xⱼ, 요인 열에만 릿지 1.0.
β는 학습 시즌(2021–2025)으로만 추정한다. 검증 시즌(2026)에서는 요인만 다시 맞추고 학습 β를 고정 오프셋으로 넣었을 때
경기당 이탈도가 얼마나 줄어드는지를 경기 단위 부트스트랩 구간으로 본다.
결과가 기대와 달라도 변수 정의·시즌 분리·판정 기준·부트스트랩 설정을 바꾸지 않는다.
"""

import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .contract import load_measured, measured_by_id, transform_value
from .glm import fit_poisson, poisson_deviance
from .io import load_json, write_json

# measured.json 순서의 실측 변수 id(home 포함)
VARIABLES: list[str] = [defn["id"] for defn in load_measured()]

TRAIN_SEASONS = (2021, 2022, 2023, 2024, 2025)
TEST_SEASON = 2026
BOOTSTRAP = 2000
SEED = 7
FACTOR_PENALTY = 1.0
Z95 = 1.96
STARTER_REST_VARIABLES = ("starter_short_rest", "starter_long_rest")
HOME_NOTE = "홈팀은 이기고 있으면 9회말을 치르지 않아 득점 기준 홈 이점이 작게 잡힌다"


@dataclass
class Design:
    X: np.ndarray
    y: np.ndarray
    # 공격·수비·구장 원핫 열
    factor_mask: np.ndarray
    # 변수 열 위치
    var_slice: slice
    names: list[str]
    # 행별 경기 id(한 경기 두 행)
    game_ids: list[str]


@dataclass
class TrainResult:
    beta: dict[str, float]
    se: dict[str, float]
    ci_low: dict[str, float]
    ci_high: dict[str, float]
    # 학습 행 중 변수 값(변환 후)이 0이 아닌 행 수
    n: dict[str, int]
    games: int
    rows: int
    converged: bool
    iterations: int


@dataclass
class Gain:
    """경기당 이탈도 개선량과 부트스트랩 95% 구간."""

    gain: float
    ci_low: float
    ci_high: float


@dataclass
class TestResult:
    __test__ = False  # pytest가 테스트 클래스로 모으지 않게 한다

    games: int
    joint: Gain
    by_variable: dict[str, Gain]


def design(rows: list[dict], variables: list[str]) -> Design:
    """열: 절편, 공격[팀×시즌], 수비[상대×시즌], 구장, 변수(contract.transform_value 적용). 수준은 정렬 순서."""
    defs = measured_by_id()
    offense = sorted({(r["team"], r["season"]) for r in rows})
    defense = sorted({(r["opp"], r["season"]) for r in rows})
    parks = sorted({r["stadium"] for r in rows})
    names = [
        "(intercept)",
        *(f"off:{team}:{season}" for team, season in offense),
        *(f"def:{team}:{season}" for team, season in defense),
        *(f"park:{park}" for park in parks),
        *variables,
    ]
    off_col = {key: 1 + i for i, key in enumerate(offense)}
    def_col = {key: 1 + len(offense) + i for i, key in enumerate(defense)}
    park_col = {park: 1 + len(offense) + len(defense) + i for i, park in enumerate(parks)}
    first_var = 1 + len(offense) + len(defense) + len(parks)

    X = np.zeros((len(rows), len(names)))
    X[:, 0] = 1.0
    for i, row in enumerate(rows):
        X[i, off_col[(row["team"], row["season"])]] = 1.0
        X[i, def_col[(row["opp"], row["season"])]] = 1.0
        X[i, park_col[row["stadium"]]] = 1.0
        for j, variable in enumerate(variables):
            X[i, first_var + j] = transform_value(defs[variable], row[variable])
    factor_mask = np.zeros(len(names), dtype=bool)
    factor_mask[1:first_var] = True
    return Design(
        X=X,
        y=np.array([row["runs"] for row in rows], dtype=float),
        factor_mask=factor_mask,
        var_slice=slice(first_var, first_var + len(variables)),
        names=names,
        game_ids=[row["game_id"] for row in rows],
    )


def _penalty(factor_mask: np.ndarray) -> np.ndarray:
    return np.where(factor_mask, FACTOR_PENALTY, 0.0)


def fit_train(rows: list[dict], train_seasons=TRAIN_SEASONS) -> TrainResult:
    """학습 시즌 행만으로 요인 + 변수 10개를 함께 적합한다(요인 열 벌점 1.0, 절편·변수 0)."""
    seasons = set(train_seasons)
    train = [row for row in rows if row["season"] in seasons]
    d = design(train, VARIABLES)
    fit = fit_poisson(d.X, d.y, penalty=_penalty(d.factor_mask))
    values = d.X[:, d.var_slice]
    beta = {v: float(b) for v, b in zip(VARIABLES, fit.coef[d.var_slice])}
    se = {v: float(s) for v, s in zip(VARIABLES, fit.se[d.var_slice])}
    return TrainResult(
        beta=beta,
        se=se,
        ci_low={v: beta[v] - Z95 * se[v] for v in VARIABLES},
        ci_high={v: beta[v] + Z95 * se[v] for v in VARIABLES},
        n={v: int(np.count_nonzero(values[:, j])) for j, v in enumerate(VARIABLES)},
        games=len(set(d.game_ids)),
        rows=len(train),
        converged=fit.converged,
        iterations=fit.iterations,
    )


def evaluate_test(rows: list[dict], beta: dict[str, float], test_season=TEST_SEASON, boot=BOOTSTRAP, seed=SEED) -> TestResult:
    """검증 시즌에서 고정 β 오프셋이 경기당 이탈도를 얼마나 줄이는지.

    기준 적합(요인만) μ0, 오프셋 적합(요인 + Σβⱼxⱼ) μ1, 변수 j 제외 적합(오프셋에서 j만 뺌) μ1₋ⱼ.
    한 경기 두 행의 이탈도 합으로 joint gain = 평균(D0 − D1), 변수 j gain = 평균(D1₋ⱼ − D1).
    구간은 경기 부트스트랩(boot회, seed 고정, 모든 비교에 같은 표본)의 2.5·97.5 백분위.
    """
    test = [row for row in rows if row["season"] == test_season]
    variables = [v for v in VARIABLES if v in beta]
    d = design(test, variables)
    factor_cols = np.ones(len(d.names), dtype=bool)
    factor_cols[d.var_slice] = False
    X = d.X[:, factor_cols]
    penalty = _penalty(d.factor_mask[factor_cols])
    contributions = d.X[:, d.var_slice] * np.array([beta[v] for v in variables], dtype=float)
    total = contributions.sum(axis=1)

    game_order = sorted(set(d.game_ids))
    position = {game_id: i for i, game_id in enumerate(game_order)}
    game_of_row = np.array([position[game_id] for game_id in d.game_ids], dtype=int)
    n_games = len(game_order)

    def game_deviance(offset: np.ndarray) -> np.ndarray:
        fit = fit_poisson(X, d.y, offset=offset, penalty=penalty)
        return np.bincount(game_of_row, weights=poisson_deviance(d.y, fit.mu), minlength=n_games)

    samples = np.random.default_rng(seed).integers(0, n_games, size=(boot, n_games))

    def interval(per_game: np.ndarray) -> Gain:
        means = per_game[samples].mean(axis=1)
        low, high = np.percentile(means, [2.5, 97.5])
        return Gain(gain=float(per_game.mean()), ci_low=float(low), ci_high=float(high))

    d0 = game_deviance(np.zeros(len(test)))
    d1 = game_deviance(total)
    by_variable = {v: interval(game_deviance(total - contributions[:, j]) - d1) for j, v in enumerate(variables)}
    return TestResult(games=n_games, joint=interval(d0 - d1), by_variable=by_variable)


def verdict(ci_low: float, ci_high: float, test_gain_ci_low: float) -> str:
    """학습 95% 구간이 0을 벗어남 + 2026 개선 구간 하한 > 0 → real, 하나만 → maybe, 둘 다 아니면 useless."""
    trained = ci_low > 0 or ci_high < 0
    tested = test_gain_ci_low > 0
    if trained and tested:
        return "real"
    if trained or tested:
        return "maybe"
    return "useless"


def _runs_pct(beta: float) -> float:
    return (math.exp(beta) - 1) * 100


def _signed(value: float) -> str:
    rounded = round(value, 1)
    if rounded == 0:
        return "0.0"
    return f"{'+' if rounded > 0 else '−'}{abs(rounded):.1f}"


def _note(defn: dict, beta: float, ci_low: float, ci_high: float, improved: bool, rest_share: float) -> str:
    text = (
        f"{defn['label']}: {defn['perLabel']} 득점 {_signed(_runs_pct(beta))}% "
        f"(95% 구간 {_signed(_runs_pct(ci_low))}~{_signed(_runs_pct(ci_high))}%), "
        f"{TEST_SEASON} 예측 개선{' 확인' if improved else '은 확인되지 않음'}"
    )
    if defn["id"] in STARTER_REST_VARIABLES:
        text += f". 상대 선발 휴식일을 계산할 수 있었던 학습 팀-경기는 {round(rest_share * 100)}%이고 나머지는 0으로 두었다"
    if defn["id"] == "home":
        text += f". {HOME_NOTE}"
    return text


def _method() -> str:
    first, last = TRAIN_SEASONS[0], TRAIN_SEASONS[-1]
    return (
        f"{first}–{TEST_SEASON} KBO 정규시즌 완료 경기를 팀-경기 행(한 경기에 두 팀이 한 행씩, 그 팀의 득점)으로 나누고 "
        "log(기대 득점) = 공격(팀·시즌) + 수비(상대 팀·시즌) + 구장 + β·변수 포아송 GLM을 IRLS로 적합했습니다"
        "(공격·수비·구장 요인에만 작은 릿지). "
        f"변수 효과 β는 {first}–{last} 시즌 경기로만 추정했고, {TEST_SEASON} 시즌에서는 요인만 다시 맞춘 뒤 학습한 β를 고정해 넣었을 때 "
        f"경기당 이탈도가 얼마나 줄어드는지를 경기 단위 부트스트랩 {BOOTSTRAP:,}회의 95% 구간으로 검증했습니다. "
        f"학습 95% 구간이 0을 벗어나고 {TEST_SEASON} 개선 구간 하한이 0보다 크면 real, 둘 중 하나만 만족하면 maybe, "
        "둘 다 아니면 useless입니다. 날씨는 Open-Meteo 기록의 경기 시작 정시 값이고 고척돔 경기는 날씨를 0으로 두었습니다."
    )


def _r6(value: float) -> float:
    return round(float(value), 6)


def build_evidence(rows: list[dict]) -> dict:
    """EvidenceData(src/types/data.ts)."""
    train = fit_train(rows)
    test = evaluate_test(rows, train.beta)
    defs = measured_by_id()
    train_rows = [row for row in rows if row["season"] in TRAIN_SEASONS]
    rest_share = sum(row.get("opp_starter_rest_days") is not None for row in train_rows) / len(train_rows) if train_rows else 0.0

    items = []
    for variable in VARIABLES:
        gain = test.by_variable[variable]
        beta, ci_low, ci_high = _r6(train.beta[variable]), _r6(train.ci_low[variable]), _r6(train.ci_high[variable])
        gain_low = _r6(gain.ci_low)
        items.append({
            "id": variable,
            "beta": beta,
            "se": _r6(train.se[variable]),
            "ciLow": ci_low,
            "ciHigh": ci_high,
            "runsPctPerUnit": round(_runs_pct(train.beta[variable]), 4),
            "n": train.n[variable],
            "test": {"devianceGainPerGame": _r6(gain.gain), "ciLow": gain_low, "ciHigh": _r6(gain.ci_high), "games": test.games},
            "verdict": verdict(ci_low, ci_high, gain_low),
            "note": _note(defs[variable], train.beta[variable], train.ci_low[variable], train.ci_high[variable], gain_low > 0, rest_share),
        })
    return {
        "method": _method(),
        "trainSeasons": list(TRAIN_SEASONS),
        "testSeason": TEST_SEASON,
        "games": {"train": train.games, "test": test.games},
        "joint": {"devianceGainPerGame": _r6(test.joint.gain), "ciLow": _r6(test.joint.ci_low), "ciHigh": _r6(test.joint.ci_high)},
        "items": items,
    }


def write_evidence(raw_dir: Path, out_dir: Path) -> dict:
    """build stage "evidence": out_dir/context/team_games.json → out_dir/app/evidence.json."""
    rows = load_json(Path(out_dir) / "context" / "team_games.json")
    data = build_evidence(rows)
    write_json(Path(out_dir) / "app" / "evidence.json", data)
    return {
        "games": data["games"],
        "joint": data["joint"],
        "items": {item["id"]: {"verdict": item["verdict"], "runsPctPerUnit": round(item["runsPctPerUnit"], 2)} for item in data["items"]},
    }
