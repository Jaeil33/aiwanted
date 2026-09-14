# Step 0: trust-report

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` ("데이터 흐름"의 trust_states → trust-report)
- `/docs/ADR.md` (ADR-002, ADR-004)
- 계약: `src/types/data.ts`(`TrustData`)
- 엔진: `src/engine/index.ts`(`createGame`, `LineupSlot`, `TeamConfig`)
- 입력 생성기: `pipeline/tmi_pipeline/trust_states.py`와 그 테스트(입력 JSON 모양)
- 기존 스크립트: `scripts/run-python.ts`, `package.json`

원자료와 생성물은 `data/`(git 제외)에 있다. `data/build/trust/states.json`이 없으면 `npm run data -- --only trust`로 만든다. git worktree에서 실행 중이면 `TMI_RAW_DIR="C:/Users/김재일/Desktop/aiwanted/data/raw"`를 붙인다.

## 작업

### `scripts/trust-report.ts` (테스트 먼저 `scripts/trust-report.test.ts`)
- `TrustStates` 타입(파이프라인 출력 모양): `{ season: number; league: number[]; players: Record<string, number[]>; bullpens: Record<string, number[]>; games: Array<{ gameId: string; date: string; away: string; home: string; homeWin: 0 | 1 | null; pas: Array<{ inning: number; half: 0 | 1; outs: number; bases: number; away: number; home: number; slotAway: number; slotHome: number; lineupAway: (string | null)[]; lineupHome: (string | null)[]; pitcher: string; naverHomeWp: number }> }> }`
- `startingLineup(pas, side): (string | null)[]` — 타순마다 처음 알려진 타자.
- `computeTrust(states: TrustStates, opts?: { maxGames?: number }): TrustData`
  - `homeWin`이 null인 경기는 뺀다.
  - 경기마다 시작 라인업(모르면 rel 1 벡터), 팀 불펜(`bullpens[팀]`, 없으면 1 벡터), `league`로 `createGame({ effects: [], mode: 'real', countTable: null })`을 한 번 만든다.
  - 타석마다 투수 rel(`players[pitcher]`, 없으면 1 벡터)로 `evaluate(state, pitcher, { detail: false })`. 엔진 예측 = `winHome + tie / 2`.
  - Brier·로그 손실(확률은 [1e-6, 1 − 1e-6]로 자름)을 엔진·네이버(`naverHomeWp`)·항상 0.5에 대해 계산.
  - 보정: 엔진 예측 10구간(0.1 간격)마다 `{ lo, hi, predicted(평균), actual(홈 승률), n }`, n이 0인 구간은 뺀다.
  - `note`: "2025 시즌 기록만으로 만든 엔진을 2026 중계 타석에 적용했어요. 선수 교체는 시작 라인업으로 고정했어요."
  - 엔진이 평가할 수 없는 상태라 `evaluate`가 RangeError를 던지는 타석(예: 점수 차가 엔진 한도 밖)은 건너뛴다. 건너뛴 수를 CLI 요약에 출력하고, 0보다 크면 note 끝에 " 엔진 범위 밖 타석 N개는 뺐어요."를 붙인다. 다른 예외는 그대로 던진다.
- CLI(직접 실행될 때만): `--in`(기본 `data/build/trust/states.json`), `--out`(기본 `data/build/app/trust.json`), `--max-games`. 요약(경기·타석 수, 세 Brier)을 출력한다.
- `package.json` scripts에 `"trust": "tsx scripts/trust-report.ts"` 추가.

### 테스트
- 합성 states(경기 2개, 타석 몇 개, 무승부 1개)로: 무승부 제외, 상수 Brier = 평균((0.5 − y)²) 정확히, 네이버 Brier 직접 계산값과 같음, 보정 구간 n 합 = 타석 수, startingLineup 규칙, 모든 확률 0~1.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
npm run trust -- --max-games 40
node -e "const t=require('./data/build/app/trust.json'); if(!(t.plateAppearances>1000 && t.brier.engine>0 && t.brier.engine<0.25)){console.error(t);process.exit(1)} console.log(t.games, t.plateAppearances, t.brier)"
```

## 검증 절차

1. 위 AC 커맨드를 실행한다. 전체 경기(`--max-games` 없이)도 한 번 돌려 `data/build/app/trust.json`을 최종본으로 남긴다.
2. 아키텍처 체크리스트를 확인한다:
   - 확률 계산이 `src/engine`만 쓰는가?
   - 2026 시즌 기록을 쓰지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (`data/` 커밋 없음)
3. 결과에 따라 `phases/6-release/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`(세 Brier 값 포함)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 엔진이 네이버보다 나쁘게 나와도 수치를 보정하거나 표본을 골라내지 마라. 이유: 결과를 그대로 보여주는 것이 신뢰도 페이지의 목적이다.
- 엔진 코드를 수정하지 마라. 이유: 검증 대상이다.
- 기존 테스트를 깨뜨리지 마라.
