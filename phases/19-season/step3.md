# Step 3: api-functions

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ARCHITECTURE.md`, `/docs/ADR.md`(**ADR-017**, **ADR-028**, ADR-029, ADR-032)
- `api/interpret.ts`, `api/verdict.ts`, `api/_lib/handlers.ts`, `api/_lib/rateLimit.ts`, **`api/_lib/nodeEsm.test.ts`**
- `src/live/relay.ts`, `src/live/validate.ts`(step 2), `src/types/live.ts`
- `phases/14-live-data/step1.md`(이 step이 흡수한 원안. ADR-028 때문에 다시 쓴다)

테스트를 먼저 쓴다(Vitest). 네트워크는 주입한 `fetch`로만 부르고, 테스트에서는 진짜 네트워크를 쓰지 마라.

## 배경

브라우저는 네이버를 직접 부를 수 없다(외부 Origin은 403). 그래서 서버 함수가 대신 부르고 `LiveGame`으로 줄여 돌려준다(ADR-017). 원문은 이닝당 95~253KB, 경기당 최대 1.6MB라 휴대폰에 그대로 넘기면 무겁다.

**원안과 달라지는 것 두 가지:**

1. **Build Output API를 쓰지 않는다.** ADR-028이 ADR-024를 대체했다. `api/*.ts`를 Vercel 기본 함수 빌드에 맡기고, 함수가 닿는 모듈의 상대 import에는 `.js` 확장자를 붙인다. 이걸 어기면 **로컬 테스트는 모두 통과하고 배포에서만 500(FUNCTION_INVOCATION_FAILED)이 난다.** `api/_lib/nodeEsm.test.ts`가 함수를 파일마다 임시 폴더로 옮겨 별도 node 프로세스에서 native import로 불러 이것을 잡는다. 새 함수도 그 테스트가 자동으로 발견한다.
2. **일정은 날짜 하나가 아니라 기간을 받는다.** ADR-032의 월 달력과 추천 피드가 기간 조회를 쓴다. 네이버 일정 API가 `fromDate`·`toDate`를 받으므로 한 팀의 한 달이 요청 한 번이다.

## 작업

### `api/_lib/naver.ts` (새 파일)
- `fetchSchedule(deps, { from, to })` → `result.games[]`
- `fetchRelay(deps, gameId, inning?)` → `result.textRelayData`(경기 전이면 null)
- 헤더: 브라우저 `User-Agent`와 `Accept: application/json`. **`Origin`·`Referer`를 붙이지 마라(403)**.
- 8초 `AbortController`, 재시도 없음.
- 오류는 `NaverError('upstream' | 'timeout' | 'shape')`. 업스트림 상태를 담는다(ADR-029와 같은 뜻).

### `api/_lib/gameCache.ts` (새 파일)
- 같은 키의 동시 요청을 하나로 합친다(`Map<string, Promise>`).
- 끝난 이닝 payload 10분, 끝난 경기 `LiveGame` 1시간. 시계는 주입한다.

### `api/_lib/liveHandlers.ts` (새 파일)
주입 가능한 순수 진입점. `api/games.ts`·`api/game.ts`는 이것만 부른다(테스트가 쉬워진다, `handlers.ts`와 같은 꼴).

- **`handleGames(request, deps)`** — `GET /api/games`
  - `?date=YYYY-MM-DD` 하나 또는 `?from=&to=` 기간. 둘 다 없으면 서울 기준 오늘.
  - 기간은 **최대 45일**(월 달력 한 장 + 여유). 넘거나 모양이 틀리면 400.
  - 응답 `{ games: GameSummary[] }`, `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.
- **`handleGame(request, deps)`** — `GET /api/game?id=<gameId>`
  - id는 `^\d{8}[A-Z]{4}\d{5}$`, 아니면 400. 그 날짜 일정에 없으면 404.
  - 경기 전·취소면 중계를 아예 부르지 않는다(`plateAppearances: []`, `current: null`).
  - 아니면 이닝 없이 한 번 불러 `latestInning`을 알아내고, 캐시에 없는 1..inn−1만 더 부른 뒤 `parseRelay`.
  - 캐시 헤더: 진행 중 `s-maxage=5, stale-while-revalidate=30`, 경기 전 60, 끝남·취소 `86400, stale-while-revalidate=604800`, 오류 `no-store`.
  - 오류 옮김: upstream 502, timeout 504, shape 502.
- 공통: IP당 **분당 60회**(`createRateLimiter`), 넘으면 429 + `Retry-After`.

### `api/games.ts`, `api/game.ts` (새 파일)
`export async function GET(request: Request)` 한 줄씩. `process.env`·`fetch`·limiter를 넘긴다. **상대 import에 `.js`를 붙인다.**

### `vercel.json`
새 함수의 제한 시간을 둔다(`games` 10초, `game` 20초). 지역은 건드리지 않는다.

## Acceptance Criteria

- `npm run test` 전부 통과, 기존 테스트 수가 줄지 않는다.
- **`api/_lib/nodeEsm.test.ts`가 `games`·`game`을 발견하고, 둘 다 별도 node 프로세스에서 오류 없이 로드된다.** (ADR-028 위반을 여기서 잡는다)
- 어떤 테스트도 진짜 네트워크를 부르지 않는다.
- `npx tsc -p tsconfig.app.json --noEmit`·`npm run lint`·`npm run build` 통과.

## 검증 절차

1. `npm run test`
2. `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`, `npm run build`
3. `api/`가 닿는 파일에 확장자 없는 상대 import가 없는지 훑는다

## 금지사항

- `api/`가 닿는 모듈에 확장자 없는 상대 import를 쓰지 마라(ADR-028). JSON import에는 `with { type: 'json' }`을 붙인다.
- 네이버 요청에 `Origin`·`Referer`를 붙이지 마라(403).
- 네이버 원문을 그대로 돌려주지 마라. `LiveGame`으로 줄인다(ADR-017).
- API 키·토큰을 응답·로그에 넣지 마라.
- 테스트에서 진짜 네트워크를 부르지 마라. `fetch`는 주입한다.
- Build Output API(`build:vercel`·`check:vercel`)를 만들지 마라(ADR-028).
- 화면·엔진·기존 함수 동작을 바꾸지 마라.
