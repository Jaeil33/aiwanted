# Step 2: relay-parser

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ARCHITECTURE.md`, `/docs/ADR.md`(ADR-014, ADR-017, **ADR-028**, ADR-032)
- **`pipeline/tmi_pipeline/relay.py` 전체** — 이 step이 옮기는 원본이다. 상수·분기·한계 주석까지 읽는다.
- `pipeline/tmi_pipeline/snapshot.py`의 `_play_seq`·`scene_lineups`(타선 복원), `pipeline/tmi_pipeline/contract.py`
- `src/types/live.ts`, `src/types/data.ts`(`Situation`), `src/test/fixtures/live.ts`(step 1)
- `src/domain/events.ts`(`PITCH_TYPES`), `phases/14-live-data/step0.md`(이 step이 흡수한 원안, 네이버 응답 모양)

테스트를 먼저 쓴다(Vitest). 순수 모듈이다 — `fetch`·DOM·타이머·`Math.random`을 쓰지 마라.

## 배경

네이버 중계를 타석·투구로 읽는 코드가 **이미 Python에 있다**(`relay.py`, 140경기 11,434타석 42,854투구에서 돌아간 코드). 앱은 같은 일을 브라우저·서버 함수에서 해야 하므로 TS로 한 벌 더 만든다. 두 구현이 어긋나면 파이프라인이 만든 확률과 화면이 보여주는 타석이 서로 다른 경기가 된다. 그래서 **실제 원자료로 대조하는 것이 이 step의 완료 조건**이다.

원자료 모양(`phases/14-live-data/step0.md:16-25` 조사분):
- 일정: `GET https://api-gw.sports.naver.com/schedule/games?fields=basic&upperCategoryId=kbaseball&categoryId=kbo&fromDate=&toDate=` → `result.games[]`
- 중계: `GET .../schedule/games/{gameId}/relay[?inning=N]` → `result.textRelayData`. 머리 필드(`currentGameState`·라인업)는 이닝 인자와 무관하게 **항상 현재**, `textRelays`만 그 이닝이다.
- 로컬 파일 `data/raw/naver/relay/*.json`은 `{ game, textRelays }`로 이닝이 합쳐져 있다.

`api/game.ts`(step 3)가 이 모듈에 닿는다. 상대 import에 `.js` 확장자를 붙인다(ADR-028).

## 작업

### `src/domain/events.ts` (추가)
`PITCH_RESULT_CODE`(`B`0 `T`1 `S`2 `V`2 `F`3 `W`3 `H`4)를 더한다. `pipeline/tmi_pipeline/contract.py`와 같아야 한다.

### `src/live/relay.ts` (새 파일, 순수)
`relay.py`를 그대로 옮긴다. 상수·경계 조건을 바꾸지 마라.

- `chrono(payload)` / `sortedOptions(relay)` — `textOptions`가 있는 relay를 첫 `seqno` 순으로, 옵션을 `seqno` 순으로.
- `walkPitches(opts, ptsById)` — 투구마다 `{ option, pts, balls, strikes }`(**던지기 전** 볼·스트라이크). `B`는 볼 +1(최대 3), `STRIKE_RESULTS`(T·S·V·F·W)는 스트라이크 +1(최대 2).
- `pitchRow(t, p, balls, strikes)` — `PitchRow` 16칸. 구종은 `PITCH_TYPES` 인덱스(없으면 `기타`), `stance === 'L'`이면 0 아니면 1, PTS 10개는 소수 3자리 반올림.
- `eventOf(text)` — 공백 없앤 문장에 `낫아웃`이 있으면 삼진(0). 아니면 `EVENT_KEYWORDS` 순서대로 먼저 걸리는 것, 없으면 6.
- `basesOf(state)` / `validHomeWp(metric)` — 비트마스크, 홈+원정 합 99~101 밖이면 null.
- `plateAppearances(payload)` — 타자 소개(type 8 + `batterRecord`)가 있는 relay만. 투구도 결과도 없으면 **건너뛰고 번호를 매기지 않는다**. 결과 옵션(13·23)이 없으면 `complete: false`. 투수는 첫 투구의 `currentGameState.pitcher`, 없으면 소개 시점 투수(ADR-014). 득점은 `홈인` 주석 수 + 홈런이면 1.
- `substitutions(payload)` — type 2 중 들어온·나간 id가 모두 있는 것. 종류는 `:` 뒤 첫 단어, 팀은 대타·대주자면 공격 팀 나머지는 수비 팀. `seq` 순 정렬.
- `lineupsAt(pas, subs, target)` — `snapshot.scene_lineups` 그대로. 모르는 칸은 `null`.
- `summaryFromSchedule(game)` — 일정 한 경기 → `GameSummary`. `statusCode` `BEFORE`→`before`, `RESULT`→`final`, `cancel`→`cancelled`, `suspended`→`suspended`, 나머지→`live`. `reversedHomeAway`는 무시한다(id가 원정-홈 순서를 담는다).
- `latestInning(payload)` — `textRelayData.inn`.
- `localRelayPayloads(raw)` — 로컬 `{ game, textRelays }`를 `parseRelay`가 받는 모양으로.
- `parseRelay({ summary, payloads, names? })` → `LiveGame`. `plateAppearances`는 `no` 1부터, `lineups`는 `lineupsAt`, 모르는 칸이 있으면 그 타석은 그대로 두되 `null`을 빈 문자열로 바꾸지 말고 **타석을 뺀다**(9명이 확정된 타석만 `PaRecord`가 된다). `current`는 마지막 relay의 진행 중 타석.

### `src/live/validate.ts` (새 파일, 순수)
`isGameSummary`, `isGameSummaryList`, `isLiveGame`. 서버 응답을 믿지 않고 모양을 검사한다(step 4가 쓴다).

### `src/test/fixtures/naverRelay.ts` (새 파일, 합성)
네이버 원자료 모양의 합성 payload. 실존 선수 이름 금지. 1회초·1회말에 양 팀 아홉 명이 모두 서고(타선 복원에 18칸이 다 필요하다), 대타 교체와 결과 없이 끊긴 타석이 하나씩 있다. 로컬 파일 모양과 실시간 응답 모양(머리에 `currentGameState`가 있는)을 모두 낸다.

### `scripts/check-relay-parity.ts` + `npm run check:relay`
로컬 `data/raw/naver/relay/*.json` 140경기를 TS 파서와 Python 산출물(`data/build/trust/states.json`)로 각각 읽어 타석 수·사건·득점·투구 수·투구 전 볼카운트를 맞춘다. **일치율 99% 미만이면 실패(exit 1)**. 네트워크를 부르지 않는다. 원자료가 없으면 건너뛰고 그 사실을 알린다(CI·다른 기계).

## Acceptance Criteria

- `npm run test` 전부 통과, 기존 테스트 수가 줄지 않는다.
- `npx tsc -p tsconfig.app.json --noEmit`·`npm run lint`·`npm run build` 통과.
- `npm run check:relay`가 실제 140경기에서 **타석·사건·득점·투구 일치율 99% 이상**.
- `parseRelay`가 합성 원자료에서 계약을 지키는 `LiveGame`을 낸다(`isLiveGame` 통과, `no` 1부터 오름차순, 타선 9명).

  *2026-09-26 정정*: 원안은 "step 1의 `fixtureLiveGame()`과 같은 배열"이었으나 그건 불가능하다. 타선 복원은 슬롯마다
  그 슬롯의 첫 타석이 있어야 하는데 `fixtureLiveGame()`은 타석이 8개뿐이라 18칸 중 대부분이 `null`이 되고, 그런 타석은
  `parseRelay`가 뺀다. 그래서 양 팀 아홉 명이 모두 한 번씩 서는 합성 원자료(`fixtureNaverRelay`)로 확인한다.
- `src/live/`에 `fetch`·DOM·타이머·`Math.random`이 없다.

## 검증 절차

1. `npm run test`
2. `npm run check:relay` — 일치율과 어긋난 타석 수를 출력
3. `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`, `npm run build`

## 금지사항

- `relay.py`의 상수·분기·경계값을 "더 낫게" 바꾸지 마라. 어긋나면 대조가 깨진다. 고칠 곳을 찾으면 양쪽을 같이 고치고 그 이유를 적는다.
- 네트워크를 부르지 마라. 이 step은 파싱만 한다.
- `src/live`에서 확장자 없는 상대 import를 쓰지 마라(ADR-028).
- `data/raw`·`data/build`의 비앱 산출물을 커밋하지 마라(ADR-023).
- 픽스처에 실존 선수 이름을 쓰지 마라(공개 저장소).
- 화면·기존 세션·파이프라인 동작을 바꾸지 마라.
