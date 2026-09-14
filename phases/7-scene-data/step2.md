# Step 2: trust-rebuild

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` (데이터 흐름)
- `/docs/ADR.md` (ADR-002, ADR-014)
- `pipeline/tmi_pipeline/relay.py` (step 0: `pitcher_id`는 첫 투구 투수, `complete`)
- `pipeline/tmi_pipeline/trust_states.py`, `pipeline/tests/test_trust_states.py`
- `scripts/trust-report.ts`, `scripts/trust-report.test.ts`
- `phases/6-release/index.json`의 step 0 summary (이전 신뢰도 수치: 137경기·11,017타석, Brier 엔진 0.1567 · 네이버 0.1580 · 0.5 0.2500)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

### `pipeline/tmi_pipeline/trust_states.py`
- 타석마다 쓰는 투수는 `PlateAppearance.pitcher_id`(첫 투구 투수)다.
- 미완료 타석(`complete`가 False)은 신뢰도 상태에서 뺀다.
- 그 밖의 규칙(2025 기록, 시작 라인업, 무승부 경기 제외 등)은 그대로 둔다.

### 테스트
- 합성 경기에서 교체 직후 타석의 투수가 첫 투구 투수인지 확인한다.
- 미완료 타석이 빠지는지 확인한다.

## Acceptance Criteria

```bash
npm run test:py
npx vitest run scripts/trust-report.test.ts
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 실데이터로 신뢰도 리포트를 다시 만든다. git worktree면 앞에 `TMI_RAW_DIR="C:/Users/김재일/Desktop/aiwanted/data/raw"`를 붙인다.
   - `npm run data -- --only trust`
   - `npm run trust`
3. 새 `data/build/app/trust.json`에서 아래 값을 summary에 적는다.
   - 경기 수·타석 수
   - Brier 세 값(엔진·네이버·0.5)
   - 로그 손실 세 값
   - 이전 값 대비 차이
4. 아키텍처 체크리스트를 확인한다.
   - 수치 보정이나 표본 선별을 하지 않았는가?
   - `trust_states.py`와 그 테스트 밖을 고치지 않았는가?
5. `phases/7-scene-data/index.json`의 step 2를 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 엔진 값이 나빠져도 계수·표본을 조정하지 마라. 이유: 제출물 수치는 가공 없이 보고한다(허위 기재는 자격 상실).
- `data/`를 커밋하지 마라. 이유: 원자료·생성물 권리(ADR-005).
- README나 화면 문구를 고치지 마라. 이유: 나중 phase의 범위다.
- 기존 테스트를 깨뜨리지 마라.
