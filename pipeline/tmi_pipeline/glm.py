"""로그 링크 포아송 GLM: IRLS(= 정준 링크의 뉴턴 방법)와 열별 릿지 벌점. numpy만 쓴다(ADR-007).

벌점 로그우도 ℓ(β) − ½ Σ λⱼ βⱼ²를 최대화한다. 이탈도 척도로는 D(β) + Σ λⱼ βⱼ²를 최소화하는 것과 같다.
"""

from dataclasses import dataclass

import numpy as np

# exp 넘침을 막는 선형 예측자 한계와 뉴턴 걸음 반감 횟수
ETA_LIMIT = 50.0
MAX_HALVINGS = 30


@dataclass
class PoissonFit:
    coef: np.ndarray
    se: np.ndarray
    mu: np.ndarray
    # 벌점 없는 이탈도 합
    deviance: float
    iterations: int
    converged: bool


def poisson_deviance(y: np.ndarray, mu: np.ndarray) -> np.ndarray:
    """행별 포아송 이탈도 2[y·log(y/μ) − (y − μ)]. y = 0이면 2μ."""
    y = np.asarray(y, dtype=float)
    mu = np.asarray(mu, dtype=float)
    positive = y > 0
    with np.errstate(divide="ignore", invalid="ignore"):
        term = np.where(positive, y * np.log(np.where(positive, y, 1.0) / mu), 0.0)
    return 2.0 * (term - (y - mu))


def _solve(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    try:
        return np.linalg.solve(a, b)
    except np.linalg.LinAlgError:
        return np.linalg.lstsq(a, b, rcond=None)[0]


def _inverse(a: np.ndarray) -> np.ndarray:
    try:
        return np.linalg.inv(a)
    except np.linalg.LinAlgError:
        return np.linalg.pinv(a)


def _mean(X: np.ndarray, beta: np.ndarray, offset: np.ndarray) -> np.ndarray:
    return np.exp(np.clip(X @ beta + offset, -ETA_LIMIT, ETA_LIMIT))


def _objective(y: np.ndarray, mu: np.ndarray, beta: np.ndarray, penalty: np.ndarray) -> float:
    return float(poisson_deviance(y, mu).sum() + beta @ (penalty * beta))


def fit_poisson(
    X: np.ndarray,
    y: np.ndarray,
    offset: np.ndarray | None = None,
    penalty: np.ndarray | None = None,
    max_iter: int = 50,
    tol: float = 1e-9,
) -> PoissonFit:
    """log μ = Xβ + offset. penalty는 열별 릿지 가중치(0이면 벌점 없음).

    시작값은 μ₀ = y + 0.1의 가중 최소제곱 한 번이고, 이후 뉴턴 걸음마다 벌점 이탈도가 늘면 걸음을 반으로 줄인다.
    벌점 이탈도의 상대 변화가 tol보다 작으면 수렴이다. max_iter 안에 수렴하지 않으면 converged=False로 돌려준다.
    se = sqrt(diag((XᵀWX + diag(penalty))⁻¹)).
    """
    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=float)
    n, p = X.shape
    offset = np.zeros(n) if offset is None else np.asarray(offset, dtype=float)
    lam = np.zeros(p) if penalty is None else np.broadcast_to(np.asarray(penalty, dtype=float), (p,)).copy()
    ridge = np.diag(lam)

    mu0 = y + 0.1
    beta = _solve((X * mu0[:, None]).T @ X + ridge, X.T @ (mu0 * (np.log(mu0) - offset)))
    mu = _mean(X, beta, offset)
    objective = _objective(y, mu, beta, lam)

    converged = False
    iterations = 0
    for iterations in range(1, max_iter + 1):
        hessian = (X * mu[:, None]).T @ X + ridge
        step = _solve(hessian, X.T @ (y - mu) - lam * beta)
        scale = 1.0
        for _ in range(MAX_HALVINGS):
            candidate = beta + scale * step
            candidate_mu = _mean(X, candidate, offset)
            candidate_objective = _objective(y, candidate_mu, candidate, lam)
            if np.isfinite(candidate_objective) and candidate_objective <= objective + 1e-12 * (abs(objective) + 1.0):
                break
            scale /= 2
        change = abs(objective - candidate_objective) / (abs(candidate_objective) + 0.1)
        beta, mu, objective = candidate, candidate_mu, candidate_objective
        if change < tol:
            converged = True
            break

    covariance = _inverse((X * mu[:, None]).T @ X + ridge)
    se = np.sqrt(np.clip(np.diag(covariance), 0.0, None))
    return PoissonFit(
        coef=beta,
        se=se,
        mu=mu,
        deviance=float(poisson_deviance(y, mu).sum()),
        iterations=iterations,
        converged=converged,
    )
