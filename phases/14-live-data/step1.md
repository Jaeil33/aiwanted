# Step 1: api-functions

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ARCHITECTURE.md`(데이터 흐름 서버리스, 서버 함수), `/docs/ADR.md`(ADR-006, ADR-017)
- `api/interpret.ts`, `api/_lib/handlers.ts`, `api/_lib/rateLimit.ts`와 테스트(요청 검증·제한·키 처리 방식을 따른다)
- `src/live/relay.ts`, `src/live/validate.ts`, `src/types/live.ts`
- `phases/14-live-data/index.json`의 step 0 summary

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

### `api/_lib/naver.ts`
```ts
export interface NaverDeps { fetch: typeof fetch; now: () => number }
export async function fetchSchedule(deps: NaverDeps, date: string): Promise<unknown[]>;          // result.games
export async function fetchRelay(deps: NaverDeps, gameId: string, inning?: number): Promise<unknown | null>; // result.textRelayData
```
- 헤더: `User-Agent`(일반 브라우저 문자열), `Accept: application/json`. **Origin·Referer 헤더를 보내지 않는다**(외부 Origin은 403).
- 제한 시간 8초(AbortController), 재시도 없음. 원격 비 200 → `NaverError('upstream', status)`, 제한 시간 → `NaverError('timeout')`, 모양 틀림 → `NaverError('shape')`.

### `api/_lib/gameCache.ts`
- 인스턴스 메모리: 같은 키의 진행 중 요청 합치기(`Map<key, Promise>`), 끝난 이닝 payload 캐시(경기·이닝별 10분), 끝난 경기 `LiveGame` 캐시(1시간). 시계는 주입.

### `api/games.ts` — `GET /api/games?date=YYYY-MM-DD`
- date 생략 시 서울 기준 오늘. 형식 틀리면 400.
- 응답 `{ games: GameSummary[] }`, `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.

### `api/game.ts` — `GET /api/game?id=<gameId>`
- id는 `^\d{8}[A-Z]{4}\d{5}$`, 아니면 400. 요약은 그 날짜 일정에서 찾고 없으면 404.
- 경기 전·취소: relay를 부르지 않고 `plateAppearances: []`, `current: null`.
- 그 밖: 최신 이닝 relay → `latestInning` → 1..inn−1 이닝 중 캐시에 없는 것만 순서대로 받기 → `parseRelay`.
- 캐시 헤더(ADR-017): live `public, s-maxage=5, stale-while-revalidate=30` / before `s-maxage=60` / final·cancelled `s-maxage=86400, stale-while-revalidate=604800` / 오류 `no-store`.
- 오류 매핑: upstream 502, timeout 504, shape 502, 모두 `{ error: 'upstream' | 'timeout' | 'shape' }`.

### 공통
- IP당 분당 60회 제한(`createRateLimiter` 재사용, 429 + `Retry-After`).
- Vercel Web 표준 export(`export async function GET(request: Request)`), 의존성 주입 가능한 핸들러(`handleGames(request, deps)`, `handleGame(request, deps)`)로 나눠 테스트한다.

### `vercel.json`
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "regions": ["icn1"],
  "functions": {
    "api/verdict.ts": { "maxDuration": 60 },
    "api/*.ts": { "maxDuration": 20 }
  }
}
```
(Vercel이 `functions` 글롭 겹침을 거부하면 파일별로 나눠 적는다.)

### 테스트
- 가짜 fetch로: 요청 URL·헤더(Origin 없음), 이닝 채우기(캐시된 이닝은 다시 안 부름), 동시 요청 합치기(원격 호출 1회), 상태별 캐시 헤더, 오류 매핑, 400·404·429, 경기 전 relay 미호출, 응답에 원문 큰 필드(`currentPlayersInfo`)가 없음.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 로컬 수동 점검(네트워크 가능할 때만, 결과는 summary에): `npx tsx -e`로 핸들러를 실제 fetch와 함께 불러 오늘 일정과 끝난 경기 1개를 받아 `isLiveGame` 통과·응답 크기를 적는다. 요청은 5회 이하, 1초 간격.
3. 체크리스트: 네이버 호출이 `api/_lib/naver.ts`에만 있는가? 키·토큰이 응답·로그에 없는가?
4. `phases/14-live-data/index.json`의 step 1을 업데이트한다.

## 금지사항

- 브라우저 코드에서 네이버를 부르지 마라. 이유: ADR-017.
- 원문 JSON을 그대로 돌려주지 마라. 이유: 크기·권리(ADR-005, ADR-017).
- 재시도 루프를 넣지 마라. 이유: 차단 위험.
- Vercel 배포·push를 하지 마라. 이유: 계정과 공개는 사용자가 정한다.
