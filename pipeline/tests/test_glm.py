import numpy as np
import pytest

from tmi_pipeline import glm

N = 20_000
TRUE = np.array([1.1, 0.25, -0.3, 0.12])


def design_matrix(rng: np.random.Generator, n: int = N) -> np.ndarray:
    return np.column_stack([
        np.ones(n),
        rng.normal(size=n),
        rng.binomial(1, 0.35, size=n).astype(float),
        rng.uniform(-1.5, 1.5, size=n),
    ])


@pytest.fixture(scope="module")
def data():
    rng = np.random.default_rng(20260914)
    X = design_matrix(rng)
    y = rng.poisson(np.exp(X @ TRUE))
    return X, y


def test_recovers_known_coefficients(data):
    X, y = data
    fit = glm.fit_poisson(X, y)
    assert fit.converged is True
    assert 1 <= fit.iterations <= 50
    assert np.max(np.abs(fit.coef - TRUE)) < 0.02
    np.testing.assert_allclose(fit.mu, np.exp(X @ fit.coef), rtol=1e-10)
    assert fit.deviance == pytest.approx(float(glm.poisson_deviance(y, fit.mu).sum()))
    assert fit.coef.shape == fit.se.shape == (4,)


def test_standard_errors_match_monte_carlo_spread(data):
    X, _ = data
    rng = np.random.default_rng(7)
    mean = np.exp(X @ TRUE)
    coefs, ses = [], []
    for _ in range(150):
        fit = glm.fit_poisson(X, rng.poisson(mean))
        coefs.append(fit.coef)
        ses.append(fit.se)
    spread = np.std(np.array(coefs), axis=0, ddof=1)
    ratio = np.mean(np.array(ses), axis=0) / spread
    assert np.all(np.abs(ratio - 1) < 0.3), ratio


def test_offset_enters_the_linear_predictor(data):
    X, _ = data
    rng = np.random.default_rng(11)
    offset = rng.uniform(-0.7, 0.7, size=len(X))
    y = rng.poisson(np.exp(X @ TRUE + offset))
    with_offset = glm.fit_poisson(X, y, offset=offset)
    assert with_offset.converged
    assert np.max(np.abs(with_offset.coef - TRUE)) < 0.02
    np.testing.assert_allclose(with_offset.mu, np.exp(X @ with_offset.coef + offset), rtol=1e-10)
    # 알려진 효과 하나를 오프셋으로 고정하면 나머지 계수만 추정한다
    fixed = glm.fit_poisson(X[:, :3], y, offset=offset + TRUE[3] * X[:, 3])
    assert np.max(np.abs(fixed.coef - TRUE[:3])) < 0.02
    ignored = glm.fit_poisson(X, y)
    assert ignored.deviance > with_offset.deviance


def test_penalty_shrinks_only_the_penalized_column(data):
    X, y = data
    free = glm.fit_poisson(X, y)
    ridge = glm.fit_poisson(X, y, penalty=np.array([0.0, 20_000.0, 0.0, 0.0]))
    assert ridge.converged
    assert 0 < ridge.coef[1] < free.coef[1] - 0.02
    assert ridge.se[1] < free.se[1]
    assert np.max(np.abs(ridge.coef[[2, 3]] - free.coef[[2, 3]])) < 0.01
    heavy = glm.fit_poisson(X, y, penalty=np.array([0.0, 1e9, 0.0, 0.0]))
    assert abs(heavy.coef[1]) < 1e-3


def test_zero_penalty_equals_no_penalty(data):
    X, y = data
    np.testing.assert_allclose(glm.fit_poisson(X, y, penalty=np.zeros(4)).coef, glm.fit_poisson(X, y).coef)


def test_returns_an_unconverged_fit_instead_of_raising(data):
    X, y = data
    fit = glm.fit_poisson(X, y, max_iter=1)
    assert fit.converged is False
    assert fit.iterations == 1
    assert np.all(np.isfinite(fit.coef))
    assert np.all(np.isfinite(fit.se))


def test_poisson_deviance_rows_handle_zero_counts():
    y = np.array([0.0, 1.0, 3.0, 0.0])
    mu = np.array([0.5, 1.0, 2.0, 1e-12])
    expected = [1.0, 0.0, 2 * (3 * np.log(1.5) - 1), 2e-12]
    np.testing.assert_allclose(glm.poisson_deviance(y, mu), expected, rtol=1e-12, atol=1e-15)
