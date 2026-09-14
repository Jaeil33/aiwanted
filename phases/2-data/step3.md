# Step 3: evidence-model

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ADR.md` (ADR-004 전체: 모델식, 학습·검증 시즌, 판정 규칙)
- `/docs/PRD.md` (핵심 기능 7 판정소)
- 출력 모양의 기준: `src/types/data.ts` (`EvidenceData`, `EvidenceItem`)
- 변수 정의: `src/domain/measured.json`, `pipeline/tmi_pipeline/contract.py`
- 이전 step 산출물: `pipeline/tmi_pipeline/context.py`(팀-경기 행 필드), `build.py`

이 step은 LG Aimers에서 쓰던 방식(시간 순 학습·검증 분리, 결과를 있는 그대로 보고)을 그대로 따른다.

## 작업

### `pipeline/tmi_pipeline/glm.py` (테스트 먼저)
- `@dataclass PoissonFit(coef: np.ndarray, se: np.ndarray, mu: np.ndarray, deviance: float, iterations: int, converged: bool)`
- `fit_poisson(X: np.ndarray, y: np.ndarray, offset: np.ndarray | None = None, penalty: np.ndarray | None = None, max_iter: int = 50, tol: float = 1e-9) -> PoissonFit` — 로그 링크 IRLS(뉴턴). `penalty`는 열별 릿지 가중치(0이면 벌점 없음). `se = sqrt(diag(inv(XᵀWX + diag(penalty))))`. 수렴하지 않으면 `converged=False`로 돌려준다(예외 아님).
- `poisson_deviance(y: np.ndarray, mu: np.ndarray) -> np.ndarray` — 행별 이탈도, `y = 0` 처리.

### `pipeline/tmi_pipeline/evidence.py` (테스트 먼저)
- `VARIABLES: list[str]` — `measured.json` 순서의 id 10개(`home` 포함).
- `design(rows: list[dict], variables: list[str]) -> Design` — 열: 절편, 공격[팀×시즌] 원핫, 수비[상대×시즌] 원핫, 구장 원핫, 변수 10개(`transform_value` 적용). `@dataclass Design(X, y, factor_mask, var_slice, names, game_ids)`.
- `fit_train(rows, train_seasons=(2021, 2022, 2023, 2024, 2025)) -> TrainResult` — 요인 열 penalty 1.0, 절편·변수 열 0. 변수별 β, se, 95% 구간(β ± 1.96·se), n(변수 값이 0이 아닌 행 수).
- `evaluate_test(rows, beta: dict[str, float], test_season=2026, boot=2000, seed=7) -> TestResult`
  - 기준 적합: 테스트 시즌 요인만(변수 없음) → μ0
  - 오프셋 적합: 요인 + offset(Σ βⱼxⱼ) → μ1
  - 변수 j 제외 적합: 오프셋에서 j만 뺀 적합 → μ1₋ⱼ
  - 경기 단위 이탈도(한 경기 두 행의 합)로 joint gain = 평균(D0 − D1), 변수 j gain = 평균(D1₋ⱼ − D1). 경기 부트스트랩(boot회, seed 고정)의 2.5·97.5 백분위를 구간으로.
- `verdict(ci_low: float, ci_high: float, test_gain_ci_low: float) -> str` — 학습 구간이 0을 벗어나고(`ci_low > 0 or ci_high < 0`) 테스트 개선 구간 하한 > 0이면 `real`, 둘 중 하나만이면 `maybe`, 둘 다 아니면 `useless`.
- `build_evidence(rows) -> dict` — `EvidenceData` 모양:
  - `method`: 한국어 한 문단(팀-경기 포아송 GLM, 공격·수비·구장 요인, 2021–2025 학습, 2026 검증, 경기 부트스트랩 2,000회)
  - `trainSeasons`, `testSeason`, `games {train, test}`, `joint`, `items`
  - item마다 `runsPctPerUnit = (exp(β) − 1) × 100`, `note`는 한 줄 해석(예: "기온 10°C 오를 때 득점 +2.1% (95% 구간 −0.3~+4.6%), 2026 예측 개선은 확인되지 않음"). 선발 휴식 변수 note에는 선발 기록이 있는 경기 비율을, `home` note에는 "홈팀은 이기고 있으면 9회말을 치르지 않아 득점 기준 홈 이점이 작게 잡힌다"를 덧붙인다.
- `build.py`에 `STAGES["evidence"]` 등록: `BUILD_DIR/context/team_games.json` → `BUILD_DIR/app/evidence.json`. 요약: 변수별 verdict와 runsPctPerUnit.

### 테스트
- `glm`: 알려진 계수로 만든 합성 포아송 데이터(n=20,000, 고정 seed)에서 계수 복원 오차 < 0.02, se가 몬테카를로 반복 추정 표준편차의 ±30% 이내, 오프셋이 반영됨, 벌점 열이 0 쪽으로 수축.
- `design`: 열 수·이름, 변환 적용(기온 30 → 1.0).
- `verdict` 규칙 표.
- 합성 팀-경기 데이터(득점에 실제로 영향을 주는 변수 1개, 영향 없는 변수 1개, 6시즌)로 `build_evidence`가 효과 있는 변수를 `real`, 효과 없는 변수를 `useless`로 판정한다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
npm run data -- --only snapshot,context,evidence
.venv/Scripts/python -c "import json; e=json.load(open('data/build/app/evidence.json',encoding='utf-8')); assert len(e['items'])==10; assert e['games']['test']>=500; assert all(i['verdict'] in ('real','maybe','useless') and i['ciLow']<=i['beta']<=i['ciHigh'] for i in e['items']); print({i['id']:(i['verdict'], round(i['runsPctPerUnit'],2)) for i in e['items']})"
```

(worktree에서는 `npm run data` 앞에 `TMI_RAW_DIR="C:/Users/김재일/Desktop/aiwanted/data/raw"`를 붙인다.)

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ADR-004의 모델식·시즌 분리·판정 규칙을 그대로 따르는가?
   - ADR-007 의존성(numpy)만 쓰는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/2-data/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`(변수별 판정 요약 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 결과가 기대와 다르다고 변수 정의·시즌 분리·판정 기준·부트스트랩 설정을 바꿔 판정을 맞추지 마라. 이유: 결과를 있는 그대로 보여주는 것이 판정소의 목적이다(ADR-004).
- 2026 데이터를 β 추정에 섞지 마라. 이유: 검증 누수.
- statsmodels·scipy 등 다른 패키지를 쓰지 마라. 이유: ADR-007.
- `src/`를 수정하지 마라.
- 기존 테스트를 깨뜨리지 마라.
