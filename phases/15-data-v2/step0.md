# Step 0: all-players

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ARCHITECTURE.md`(데이터 흐름, 데이터 계약), `/docs/ADR.md`(ADR-005, ADR-021)
- `pipeline/tmi_pipeline/stats.py`, `snapshot.py`, `build.py`, `contract.py`와 각 테스트, `pipeline/tests/fixtures/`
- `src/types/data.ts`(`CoreData.teamLineups`, 키 규칙), `src/data/appData.ts`(`hitterOf`·`pitcherOf`)
- `phases/13-situation/index.json`의 step 0 summary

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다(pytest).

## 배경

2026-09-15 조사: `stats.py`의 `season_rates`는 시즌 기록만으로 2026 타자 287명·투수 288명의 `rel`을 계산할 수 있지만, `snapshot.py`가 16개 장면에 나온 선수만 남겨 `core.json`에 146명뿐이다. 실시간·직접 만들기에는 모든 선수가 필요하다(ADR-021). 같은 id(`55121` 등)가 타자·투수 둘 다인 경우가 있다.

## 작업

### `snapshot.py`
- `players`: 2026 시즌 기록이 있는 모든 타자(타석 > 0)·투수(이닝 > 0). 같은 id가 둘 다면 투수 `<id>`, 타자 `<id>:H`(레코드 `id`는 원래 id).
- 손: 가장 믿을 만한 원천을 조사해 쓴다 — 시즌 기록 파일의 투타 필드가 있으면 그것, 없으면 수집한 중계의 라인업 `hitType`(원자료에 있으면), 없으면 기존 추정(투구 손은 릴리스 위치). 원천별 개수를 build 로그에 남긴다.
- `teamLineups`: 팀마다 수집한 중계의 최근 10경기 선발 타순에서 타순별로 가장 많이 나온 선수(한 선수는 한 칸만, 충돌하면 다음 순위), 모자라면 그 팀 타석 수 상위 선수로 채운다. 길이 9.
- `line`(화면 표시용 시즌 기록)은 기존 필드를 유지한다.
- 크기 예산: `core.json` 200KB 이하(넘으면 build 실패). 수치는 소수 4자리.
- `scenes.json`·`pitches.json`·기존 산출물은 그대로 만든다(16-broadcast-ui가 정리한다).

### `contract.py`와 TS 쪽 테스트
- 계약 테스트에 `teamLineups`와 `<id>:H` 규칙을 넣는다. `src/data/appData.test.ts`에 합성 core(키 충돌·팀 기본 타선 포함)를 읽는 테스트를 더한다.

### 테스트(pytest, 합성 픽스처)
- 모든 선수가 들어감, 0타석 타자 제외, id 충돌 키, 손 원천 우선순위, 팀 기본 타선(중복 없음·길이 9·모자랄 때 채우기), 크기 예산 실패.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
npm run data   # 원자료가 있는 로컬에서 core.json 선수 수·크기를 summary에
```

## 검증 절차

1. 위 AC 커맨드를 실행한다. worktree면 `TMI_RAW_DIR="C:/Users/김재일/Desktop/aiwanted/data/raw"`를 붙인다.
2. 체크리스트: `git status`에 `data/`가 없는가? 실존 선수 이름이 테스트 픽스처에 없는가? 앱이 새 core.json으로 뜨는가(`npm run build`)?
3. `phases/15-data-v2/index.json`의 step 0을 업데이트한다(선수 수·손 원천별 개수·core.json 크기).

## 금지사항

- `data/`를 커밋하지 마라.
- 선수 사진·로고 URL을 싣지 마라. 이유: ADR-005.
- 엔진 `rel` 계산식(`stats.py` 사전 가중치)을 바꾸지 마라. 이유: 엔진 신뢰도 수치가 바뀐다.
