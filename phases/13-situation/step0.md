# Step 0: contracts

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/PRD.md`, `/docs/ARCHITECTURE.md`(핵심 계약 전체), `/docs/ADR.md`(ADR-005, ADR-013, ADR-014, ADR-016~022)
- `src/types/domain.ts`, `src/types/data.ts`, `src/data/appData.ts`, `src/data/appData.test.ts`
- `src/test/fixtures/` 전체
- `pipeline/tmi_pipeline/contract.py`, `pipeline/tests/test_contract.py`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 배경

2026-09-15 실시간 전환(ADR-016~022). 경기 종류 셋(실시간·지난 경기·직접 만들기)이 모두 `Situation`으로 모이고, 서버 함수가 네이버 중계를 `LiveGame`으로 줄여 돌려준다. 이 step은 뒤 phase(13 step 1~3, 14-live-data, 15-data-v2, 16-broadcast-ui, 17-tally)가 병렬로 기대는 **공용 계약만** 고정한다. 화면·엔진 동작은 바꾸지 않는다.

## 작업

### `src/types/live.ts` (타입만, 새 파일)
ARCHITECTURE "실시간 경기 (`src/types/live.ts`)"의 `GameStatus`, `TeamLine`, `GameSummary`, `PaRecord`, `LiveGame`을 글자 그대로 옮긴다. `TeamCode`·`PitchRow`는 `./data`, `GameState`·`EventIndex`는 `./domain`에서 type import한다.

### `src/types/data.ts`
- ARCHITECTURE "상황 (`src/types/data.ts`)"의 `SituationKind`, `Situation`, `CustomForm`, `MatchupIndex`, `TallyKey`, `TallyRow`를 추가한다.
- `CoreData`에 `teamLineups: Partial<Record<TeamCode, string[]>>`를 추가한다(주석: 팀 기본 타순 0~8의 선수 id, ADR-021).
- `CoreData.players` 주석에 키 규칙을 적는다: 같은 id가 타자·투수 둘 다면 투수 기록은 `<id>`, 타자 기록은 `<id>:H`.
- `SceneRecord`·`AppData.scenes`는 16-broadcast-ui가 지울 때까지 그대로 둔다.

### `src/data/appData.ts`
- core 검증: `teamLineups`가 없으면 `{}`로 채우고, 있으면 값이 길이 9 문자열 배열인지 본다. 플레이어 키 `<id>:H`를 허용한다(레코드 `id`는 원래 id, `kind`는 `H`).
- 조회 헬퍼(테스트 먼저):
  - `hitterOf(core, id): PlayerRecord | undefined` — `<id>:H`를 먼저, 없으면 `<id>`가 `kind: 'H'`일 때.
  - `pitcherOf(core, id): PlayerRecord | undefined` — `<id>`가 `kind: 'P'`일 때.
- 기존 `APP_DATA`·검증 동작은 유지한다(현재 `data/build`에 `teamLineups`가 없어도 앱이 뜬다).

### `pipeline/tmi_pipeline/contract.py`
- TS와 같은 필드 이름 목록·검증이 있으면 `teamLineups`, 타자 키 `<id>:H`, `MatchupIndex`(`generatedAt, range, games, rows`) 규칙을 추가하고 `pipeline/tests/test_contract.py`에 테스트한다.

### 합성 픽스처
- `src/test/fixtures/live.ts`: 가상 이름(김타자·박투수 등)으로 만든 빌더.
  - `fixtureGameSummaries()`: before·live·final 3개(서로 다른 gameId, 올바른 id 모양).
  - `fixtureLiveGame()`: 타석 8개 — 삼진, 볼넷, 홈런(2점), 병살(아웃 2 증가), 1루타, 대타 교체 1회(교체 뒤 타선 반영), 3아웃 뒤 다음 반이닝, 주루사로 끊긴 타석(`complete: false`, `event: null`) — 와 `current` 1개.
  - `fixtureSituations()`: live·past·custom 각 1개(custom은 `actual: null`, count 1-2).
  - `fixtureMatchupIndex()`: 경기 2개·타석 6행.
- `src/test/fixtures/live.test.ts`: 계약 불변식 — 타순 길이 9, outs 0~2, 투구 행 길이 16·카운트 범위, `no` 오름차순, `situation.count` 범위, `Situation.id` 규칙, `MatchupIndex.rows`의 games 인덱스 범위.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - 새 타입이 ARCHITECTURE 코드 블록과 필드 이름·주석 의미까지 같은가?
   - 픽스처·테스트에 실존 선수 이름이 없는가?
   - 화면·엔진·재생 동작이 바뀌지 않았는가(기존 테스트 전부 통과)?
3. `phases/13-situation/index.json`의 step 0을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`(추가한 타입·헬퍼 이름)
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 화면·엔진·세션 동작을 바꾸지 마라. 이유: 뒤 phase가 이 계약에 병렬로 기댄다.
- ARCHITECTURE에 없는 필드를 계약 타입에 더하지 마라. 필요하면 blocked로 보고한다. 이유: 병렬 phase끼리 계약이 어긋난다.
- `data/`를 커밋하지 마라. 픽스처에 실존 선수 이름을 쓰지 마라.
- 기존 테스트를 깨뜨리지 마라.
