# Step 4: live-client

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ARCHITECTURE.md`(패턴, 상태 관리), `/docs/ADR.md`(ADR-006, ADR-017, ADR-028, ADR-032)
- `src/ai/providers/http.ts`와 테스트(제한 시간·취소·오류 처리 방식을 그대로 따른다), `src/app/platform.ts`
- `api/games.ts`, `api/game.ts`, `api/_lib/liveHandlers.ts`, `src/live/validate.ts`, `src/types/live.ts`
- `phases/14-live-data/step2.md`(이 step이 흡수한 원안. 폴링은 뺀다)

테스트를 먼저 쓴다. 어떤 테스트도 진짜 네트워크를 부르지 않는다(`fetch`는 주입한다).

## 배경

step 3이 서버 함수를 세웠다. 이제 브라우저가 그것을 부른다. **폴링은 만들지 않는다**(ADR-032:
이번 범위는 지난 경기 탐색이고, 실시간 갱신은 뒤로 미뤘다). 대신 손으로 다시 받는 `refresh()`를 둔다.

## 작업

### `src/live/providers/http.ts` (새 파일)
```ts
export type LiveErrorCode = 'network' | 'timeout' | 'cancelled' | 'rate' | 'notFound' | 'upstream' | 'shape';
export class LiveError extends Error { readonly code: LiveErrorCode }
export interface DateRange { from: string; to: string }
export interface LiveApi {
  games(range: DateRange, signal?: AbortSignal): Promise<GameSummary[]>;
  game(gameId: string, signal?: AbortSignal): Promise<LiveGame>;
}
export function createLiveApi(opts: { baseUrl: string; fetch: typeof fetch; gamesTimeoutMs?: number; gameTimeoutMs?: number }): LiveApi;
```
- 응답은 `src/live/validate.ts`로 검사하고 틀리면 `LiveError('shape')`.
- 상태 옮김: 404 `notFound`, 429 `rate`, 그 밖의 비 2xx `upstream`, 연결 실패 `network`, 제한 시간 `timeout`, 바깥 신호 취소 `cancelled`.
- 제한 시간 기본 `games` 10초·`game` 25초(서버 maxDuration 10·20초). 재시도 없음.
- 떼어 낸 `fetch`로 부른다(Illegal invocation 방지).

### `src/app/platform.ts`
- `apiBase`: 아티팩트 모드(`import.meta.env.MODE === 'artifact'`)면 null, 아니면 `VITE_API_BASE` → `VITE_AI_API_BASE` → **`/api`**.
  지금까지는 환경변수가 없으면 null이라 배포에서 `/api`를 아예 부르지 않았다(ADR-029·030에서 하루를 태운 함정). 기본값을 `/api`로 바꿔 그 함정을 없앤다. 기존 `VITE_AI_API_BASE`는 그대로 받는다(배포 설정을 깨지 않는다).
- `Platform.liveApi: LiveApi | null` — `apiBase`와 `fetch`가 모두 있을 때만 만든다.

### `src/app/useLiveData.ts` (새 파일)
```ts
export interface Loaded<T> { data: T | null; error: LiveErrorCode | null; loading: boolean; refresh(): void }
export function useGames(api: LiveApi | null, range: DateRange | null): Loaded<GameSummary[]>;
export function useLiveGame(api: LiveApi | null, gameId: string | null): Loaded<LiveGame>;
```
- 한 번 받는다. 폴링하지 않는다. 키(범위·경기 id)가 바뀌거나 언마운트되면 `AbortController`로 끊는다.
- 겹치지 않는다: 앞 요청을 끊고 새로 부른다. 늦게 온 응답은 버린다.
- `api`가 null이면 부르지 않고 `loading: false`.

### 개발 서버 `/api` 미들웨어 — `scripts/vite-api-dev.ts` (새 파일)
- 변환 함수를 순수하게 나눠 테스트한다: `apiNameOf(url)`, `toWebRequest({method,url,headers}, body, origin)`, `writeWebResponse(res, response)`.
- 플러그인 `apiDevPlugin()`: `configureServer`에서 `/api/<name>`을 `server.ssrLoadModule('/api/<name>.ts')`로 불러 `GET`/`POST`에 Web `Request`를 넘기고 `Response`를 Node 응답으로 쓴다. 없는 이름 404, 메서드 없으면 405, 모듈이 던지면 500.
- `vite.config.ts`의 일반 모드에만 넣는다(아티팩트 빌드에는 넣지 않는다).

## Acceptance Criteria

- `npm run test` 전부 통과, 기존 테스트 수가 줄지 않는다.
- `npx tsc -b`·`npm run lint`·`npm run build` 통과.
- 어떤 테스트도 진짜 네트워크를 부르지 않는다.
- `npm run dev`로 띄웠을 때 `/api/games`가 JSON을 돌려준다(네트워크가 되면 1회 확인).

## 금지사항

- 폴링·백오프·가시성 구독을 만들지 마라(ADR-032, 범위 밖).
- 화면을 만들지 마라(step 9).
- 브라우저 저장소에 경기 데이터를 두지 마라(ARCHITECTURE 상태 관리).
- `src/live/providers` 밖에서 `fetch`를 쓰지 마라(순수 모듈 규칙).
- 새 패키지를 설치하지 마라.
