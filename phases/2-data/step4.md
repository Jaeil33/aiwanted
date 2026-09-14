# Step 4: trust-states

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` ("데이터 흐름"의 trust_states → trust-report)
- `/docs/PRD.md` (핵심 기능 7의 엔진 신뢰도)
- `/docs/ADR.md` (ADR-002, ADR-004의 시간 순 검증 원칙)
- 이전 step 산출물: `pipeline/tmi_pipeline/relay.py`(`plate_appearances`, `valid_home_wp`), `stats.py`(`season_rates`, `bullpen`), `snapshot.py`(라인업·slot 계산), `io.py`, `build.py`

엔진 신뢰도 리포트(나중 phase의 `scripts/trust-report.ts`)가 쓸 입력을 만든다. 엔진 계산은 TypeScript 쪽에서 하므로 여기서는 **상태와 정답만** 뽑는다. worktree에서는 `TMI_RAW_DIR="C:/Users/김재일/Desktop/aiwanted/data/raw"`를 붙인다.

## 작업

### `pipeline/tmi_pipeline/trust_states.py` (테스트 먼저 `pipeline/tests/test_trust_states.py`)
- `build_trust_states(raw_dir: Path) -> dict`
  - 선수 능력치는 **2025 시즌 기록**으로 `season_rates`를 만든다(2026 경기 검증에 2026 기록을 쓰면 미래 정보가 섞인다). 2025 기록이 없는 선수는 `players`에 넣지 않는다(리포트가 리그 평균으로 대신한다).
  - relay 경기마다:
    - `homeWin`: 최종 점수 홈 > 원정이면 1, 원정 > 홈이면 0, 같으면 `null`(무승부는 리포트에서 제외).
    - 타석마다: `inning, half, outs, bases, away, home`(타석 시작 상태), `slotAway, slotHome`(공격 팀은 이번 타자 `batOrder − 1`, 상대는 상대의 마지막 `batOrder % 9`, 기록이 없으면 0), `lineupAway`, `lineupHome`(그 시점까지 각 타순의 마지막 타자 id, 모르면 null, 길이 9), `pitcher`(투수 id), `naverHomeWp`(직전 유효 타석의 홈 승리확률 /100). 직전 유효 WP가 없는 타석(경기 첫 타석 등)은 넣지 않는다.
  - 반환: `{"season": 2025, "league": [...7], "players": {id: rel}, "bullpens": {팀코드: rel}, "games": [{"gameId", "date", "away", "home", "homeWin", "pas": [...]}]}`
- `build.py`에 `STAGES["trust"]` 등록 → `BUILD_DIR/trust/states.json`. 요약: 경기 수, 타석 수, 무승부 경기 수, 라인업 null 비율, 2025 기록이 있는 타석 투수 비율.

### 테스트 (합성 픽스처)
- 픽스처 경기의 타석 상태, 라인업 진행(타순 교체 반영), slot 계산, 직전 유효 WP 매칭(무효 행 건너뜀), 첫 타석 제외.
- 무승부 경기의 `homeWin` null.
- 시즌 기록 로더가 2025 파일만 요청하는지(파일 경로를 기록하는 가짜 로더로 확인).

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
npm run data -- --only trust
.venv/Scripts/python -c "import json; t=json.load(open('data/build/trust/states.json',encoding='utf-8')); g=t['games']; n=sum(len(x['pas']) for x in g); assert t['season']==2025; assert len(g)>=100, len(g); assert n>=8000, n; print('games', len(g), 'plate appearances', n)"
```

(worktree에서는 `npm run data` 앞에 `TMI_RAW_DIR="C:/Users/김재일/Desktop/aiwanted/data/raw"`를 붙인다.)

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 2026 시즌 기록 파일을 읽지 않는가?
   - ADR-007 의존성만 쓰는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (`data/build/trust`가 git에 안 들어감)
3. 결과에 따라 `phases/2-data/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`(경기·타석 수 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 2026 시즌 기록으로 선수 능력치를 만들지 마라. 이유: 검증에 미래 정보가 섞인다.
- 엔진 확률을 Python으로 다시 구현하지 마라. 이유: 확률은 `src/engine`만 계산한다(CLAUDE.md CRITICAL).
- 네이버 승리확률 값을 보정·가공하지 마라(유효성 필터와 /100만). 이유: 비교 기준이다.
- `src/`를 수정하지 마라.
- 기존 테스트를 깨뜨리지 마라.
