# Step 0: relay-parser

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md`(실시간 경기, 상황, 서버 함수), `/docs/ADR.md`(ADR-005, ADR-014, ADR-016, ADR-017)
- `pipeline/tmi_pipeline/relay.py`(전체), `pipeline/tmi_pipeline/snapshot.py`(타선·교체 복원, 수비 팀 다음 타순, 타석 방향, 투구 손), `pipeline/tmi_pipeline/trust_states.py`(`game_states`), `pipeline/tmi_pipeline/contract.py`
- `pipeline/tests/fixture_games.py`, `pipeline/tests/test_relay.py`
- `src/types/live.ts`, `src/types/data.ts`, `src/domain/events.ts`(`PITCH_TYPES`), `src/engine/game.ts`(`startNextHalf`), `src/test/fixtures/live.ts`
- `phases/13-situation/index.json`의 step 0 summary

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 배경: 네이버 응답 모양 (2026-09-15 조사)

- 경기 목록 `GET https://api-gw.sports.naver.com/schedule/games?fields=basic&upperCategoryId=kbaseball&categoryId=kbo&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD` → `result.games[]`: `gameId, gameDate, gameDateTime, stadium, homeTeamCode, homeTeamName, homeTeamScore, awayTeamCode, awayTeamName, awayTeamScore, statusCode("BEFORE"·"RESULT"·그 밖), statusInfo("경기전"·"경기취소"·"7회말"…), cancel, suspended`. `reversedHomeAway`는 무시한다(gameId가 날짜·원정·홈 순서).
- 중계 `GET …/schedule/games/{gameId}/relay[?inning=N]` → `result.textRelayData`(경기 전이면 `null`):
  - `inn, homeOrAway("0" 초·"1" 말), currentGameState, homeLineup, awayLineup, homeEntry, awayEntry, inningScore, textRelays[]`.
  - inning 파라미터가 없으면 최신 이닝. **머리(`currentGameState`·라인업)는 파라미터와 상관없이 지금 값**이고 `textRelays`만 그 이닝(양 초말, `no` 내림차순)이다.
  - `currentGameState`: 문자열 숫자 `homeScore, awayScore, pitcher, batter, ball, strike, out, base1, base2, base3`(주자 칸은 "0"이 아니면 주자). ball·strike는 **투구 뒤** 값이고, 반이닝 사이에는 out이 "3"일 수 있다.
  - `…Lineup.batter[]`: `batOrder, pcode, name, seqno, cin, cout, pa, hitType("우투좌타"), posName`. 지금 뛰는 선수는 같은 타순에서 `cout`이 없고 `seqno`가 가장 큰 행. `…Lineup.pitcher[]`: `pcode, name, seqno, hitType`.
  - `textRelays[]`: `no, inn, homeOrAway, textOptions[], ptsOptions[], metricOption`. `textOptions[]`: `type`(1 투구, 13·23 결과 등 relay.py 규칙), `text, stuff`(구종), `speed, pitchResult`(B·T·S·V·F·W·H), `ptsPitchId`("yymmdd_HHMMSS", 추적 없으면 "-1"), `currentGameState`. `ptsOptions[]`: `pitchId, x0, z0, vx0, vy0, vz0, ax, ay, az, topSz, bottomSz, stance`. `metricOption`: `homeTeamWinRate, awayTeamWinRate`(0~100).
- 로컬 원자료 `data/raw/naver/relay/*.json`은 `{ game, textRelays }`(모든 이닝 합본, 라인업 머리 없음)다.

## 작업

### `src/live/relay.ts` (순수)
```ts
export function summaryFromSchedule(game: unknown): GameSummary;               // 모양이 틀리면 Error
export function parseRelay(input: { summary: GameSummary; payloads: unknown[]; names?: Record<string, string> }): LiveGame;
export function latestInning(payload: unknown): number | null;                  // textRelayData.inn, null payload면 null
export function localRelayPayloads(raw: unknown): unknown[];                     // {game, textRelays} → textRelayData 모양 1개
```
- 상태: `cancel` → cancelled, `suspended` → suspended, `statusCode` RESULT → final, BEFORE → before, 그 밖 → live. `parseRelay`는 payload가 하나라도 null이 아닌데 summary가 before면 live로 고친다.
- payload 여러 개(이닝 순서 무관, 같은 `no` 중복 허용)의 `textRelays`를 `no`로 합치고 오름차순으로 걷는다. 머리는 `no`가 가장 큰 payload에서 읽는다.
- 타석·투구·사건·득점·투구 전 카운트·PitchRow는 **relay.py와 같은 결과**가 나오게 옮긴다(`plate_appearances`, `walk_pitches`, `pitch_row`, `event_of`, `bases_of`, 득점 "홈인" 규칙). 추적 없는 공(`-1`)은 행을 만들지 않지만 카운트는 센다.
- ADR-014: 투수는 첫 투구의 `currentGameState.pitcher`, 타선은 교체를 반영한 그 시점 선수(snapshot.py 규칙), 공격 팀 slot = 타자 타순−1, 수비 팀 slot = 그 팀 다음 타자.
- `before`: 첫 투구 직전 점수·아웃·주자. out "3"이면 `startNextHalf`와 같은 규칙으로 다음 반이닝 시작 상태.
- 이름·손: 라인업·엔트리의 `name`, `hitType`("우투좌타" → throws R·bats L, "양타" → S). 라인업 머리가 없으면(로컬 원자료) `input.names`를 쓰고 손은 비운다.
- `current`: 마지막 타석이 끝나지 않았고 상태가 live일 때 머리 `currentGameState`로 만든다(ball·strike는 그대로, out 3이면 null).
- `wpBeforeHome`·`wpAfterHome`: 타석 앞·뒤 `metricOption.homeTeamWinRate / 100`, 없으면 null. `startedAt`: 첫 추적 공 `ptsPitchId`의 시각.

### `src/live/validate.ts` (순수)
- `isGameSummary(x)`, `isGameSummaryList(x)`, `isLiveGame(x)`: 클라이언트가 서버 응답을 믿기 전에 쓰는 모양 검사(타순 길이 9, 투구 행 길이 16, outs 0~2 등).

### 합성 픽스처 `src/test/fixtures/naverRelay.ts`
- 가상 선수로 네이버 모양 payload를 만드는 빌더: 이닝 2개 payload(초·말), 대타 교체, 반이닝 전환, 주루사로 끝난 이닝, 추적 없는 공, 두 payload에 같은 `no` 중복, 몸에 맞는 공, 희생플라이, 병살, 낫아웃, 끝내기.

### 테스트
- 위 규칙마다 기대값과 반례. `parseRelay` 결과를 13-situation의 `situationFromPa`에 넣었을 때 모든 완료 타석이 상황이 되는지.
- `localRelayPayloads` 왕복.

### 로컬 일치 점검 `scripts/check-relay-parity.ts` (테스트 먼저 `scripts/check-relay-parity.test.ts`, 합성 입력)
- `data/raw/naver/relay/*.json`이 있으면 모두 `localRelayPayloads` → `parseRelay`로 읽고, `data/build/trust/states.json`(파이썬 `trust_states`)과 경기별 타석 수·사건·before 상태·투수·타자를 비교해 일치율을 출력한다. 원자료가 없으면 건너뛴다고 출력하고 exit 0.
- `package.json` scripts에 `"check:relay": "tsx scripts/check-relay-parity.ts"`.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
npm run check:relay   # 원자료가 있는 로컬에서는 사건·상태·투수·타자 일치율 99% 이상
```

## 검증 절차

1. 위 AC 커맨드를 실행한다. worktree면 `data/`가 없을 수 있다: `TMI_RAW_DIR` 규칙대로 메인 저장소의 `data/raw`를 읽게 한다(쓰지는 않는다).
2. 체크리스트: `src/live`가 순수한가? 픽스처에 실존 선수 이름이 없는가? 원자료를 테스트나 저장소에 복사하지 않았는가?
3. `phases/14-live-data/index.json`의 step 0을 업데이트한다(summary에 일치율).

## 금지사항

- 네트워크를 부르지 마라. 이유: 이 step은 순수 파서다(호출은 step 1).
- `data/` 원자료를 픽스처로 복사하지 마라. 이유: ADR-005.
- 파이썬 파이프라인 동작을 바꾸지 마라. 이유: 기준 결과다.
