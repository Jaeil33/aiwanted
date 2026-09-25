# Step 9: screens

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/UI_GUIDE.md`, `/docs/ADR.md`(**ADR-032**, ADR-014, ADR-025, ADR-034)
- `src/app/router.ts`·`App.tsx`, `src/app/screens/LobbyScreen.tsx`(옮겨 올 표기), `src/game/paList.ts`·`season.ts`
- `src/app/useLiveData.ts`, `src/app/screens/PlayScreen.tsx`

테스트를 먼저 쓴다.

## 원안에서 달라지는 것

원안(16-broadcast-ui step 5)의 **타석 화면을 새로 만들지 않는다**. `PlayScreen`이 이미 그 화면이다
(스코어버그·트래커·3단 확률 판·TMI 줄·도크). `#/pa/…`가 경기를 받아 `openSituation`으로 거기에 넘기면 된다.

## 작업

### 라우트 (`src/app/router.ts`)
`#/teams`, `#/team/:code?m=YYYY-MM`, `#/game/:gameId`, `#/pa/:gameId/:no?t=`를 더한다.
`#/scene/:id`는 step 10까지 남긴다. `routeForSituation(situation, share)`로 결과·공유가 어느 쪽이든 맞는 주소를 만든다.

### `src/app/useFavouriteTeam.ts` (새 파일)
`localStorage`의 `tmi.team` 한 값(ADR-034). 읽기·쓰기가 막혀도 던지지 않는다.
`useSyncExternalStore`로 같은 탭의 여러 화면이 함께 바뀐다. 값이 문자열이라 스냅샷을 캐시하지 않는다.

### 화면 넷
- **`HomeScreen`** — 추천 승부처 피드. 팀이 없으면 최근 경기 전체에서, 있으면 그 팀 경기에서 뽑는다.
  일정 요청 한 번 + 경기 셋. 훅은 개수가 고정이어야 하므로 `useLiveGame` 자리 셋을 미리 잡는다.
- **`TeamsScreen`** — 10구단 격자. 고르면 저장하고 그 팀 일정으로. "이 기기에만 남는다"를 말한다.
- **`TeamScreen`** — 월 달력. 칸에는 상대 팀 색 점과 승패 한 글자만(칸 폭 ~55px). 날짜를 누르면 아래에 경기 카드가 펼쳐져 스코어·구장·승부처를 보여준다. 오늘이 든 달보다 뒤로 가지 않는다.
- **`GameScreen`** — 경기 머리말(날짜·구장·최종 스코어) + 승부처 + 반이닝마다 묶은 전 타석.
- **`PaScreen`** — 경기를 받아 `situationFromPa` → `openSituation` → `PlayScreen`. 중계에서만 아는 값(이름·손·실제 투수 차례·그 경기 투구 표본)을 `extra`로 함께 넘긴다.
- **`LiveStatus`** — 기다림·오류·빈 목록 한 판. 넷이 함께 쓴다.

스포일러: 경기 결과·스코어는 공개하고 **그 타석 결과만** 숨긴다(목록에 결과 문장이 없다).
승부처 지수 숫자도 보여 주지 않는다(ADR-014).

## 실제로 띄워 보고 잡은 것 셋

1. **투수 이름이 id로 보였다.** `LiveGame.names`에는 타석에 선 선수만 있다(투수는 타석에 서지 않는다).
   번들 `core`에는 2026 전 선수가 있으므로(ADR-035) `nameMapOf(core)`를 만들어 목록에 넘긴다. core가 먼저다.
2. **달력에 이틀치만 찼다.** 네이버 일정 API는 `size`를 안 주면 **10경기**만 준다. `size=500`을 붙인다.
3. **중첩 `<header>`가 banner 랜드마크를 둘로 만들었다.** 화면 안쪽 머리말은 `<div>`로 둔다.

## Acceptance Criteria

- `npm run test`·`npx tsc -b`·`npm run lint`·`npm run build`·`npm run check:relay` 통과.
- `npm run dev`에서 홈 → 팀 → 달력 → 경기 → 타석까지 실제 2026 데이터로 이어진다.

## 금지사항

- 타석 화면을 새로 만들지 마라(`PlayScreen`을 쓴다).
- 목록에 타석 결과 문장이나 승부처 지수 숫자를 싣지 마라(ADR-014·032).
- 응원팀 말고 다른 값을 `localStorage`에 넣지 마라(ADR-034).
- 치르지 않은 경기(경기 전·취소)를 되돌려볼 수 있는 것처럼 보여 주지 마라.
