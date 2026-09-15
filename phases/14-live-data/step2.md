# Step 2: live-client

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ARCHITECTURE.md`(패턴, 상태 관리), `/docs/ADR.md`(ADR-006, ADR-017)
- `src/app/platform.ts`와 테스트, `src/ai/providers/http.ts`와 테스트(제한 시간·오류 처리 방식), `vite.config.ts`
- `api/games.ts`, `api/game.ts`, `src/live/validate.ts`, `src/types/live.ts`
- `phases/14-live-data/index.json`의 summary

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

### `src/live/providers/http.ts`
```ts
export interface LiveApi {
  games(date: string, signal?: AbortSignal): Promise<GameSummary[]>;
  game(gameId: string, signal?: AbortSignal): Promise<LiveGame>;
}
export function createLiveApi(opts: { baseUrl: string; fetch: typeof fetch; timeoutMs?: number }): LiveApi;
```
- 응답은 `validate.ts`로 검사하고 틀리면 `LiveError('shape')`. 비 200은 `LiveError('upstream' | 'timeout' | 'rate' | 'notFound')`. 제한 시간 기본 10초. 재시도 없음. 떼어 낸 fetch로 부른다(Illegal invocation 방지).

### `src/app/platform.ts`
- `apiBase`: `import.meta.env.MODE === 'artifact'`이면 null, 아니면 `VITE_API_BASE`(없으면 `/api`). AI 프로바이더와 실시간 API가 같은 주소를 쓴다. `VITE_AI_API_BASE`는 없앤다(문서·테스트 함께).
- `Platform.liveApi: LiveApi | null`, `Platform.visibility: { hidden(): boolean; subscribe(cb): () => void }`.

### `src/app/useLiveGame.ts`, `src/app/useGames.ts`
```ts
export function useLiveGame(api: LiveApi | null, gameId: string, deps?: PollDeps): { game: LiveGame | null; error: LiveErrorCode | null; loading: boolean; refresh(): void };
export function useGames(api: LiveApi | null, date: string): { games: GameSummary[] | null; error: LiveErrorCode | null; loading: boolean };
```
- 폴링(ADR-017): live 5초, before·반이닝 사이(`current` null이고 live) 30초, final·cancelled·suspended는 한 번 받고 멈춤. 문서가 숨겨지면 멈추고 보이면 즉시 한 번 받는다. 오류는 10→20→40→60초로 늘리고 성공하면 원래 간격. 요청 중 새 요청을 겹치지 않는다. 화면을 떠나면 AbortController로 끊는다.
- 타이머·가시성은 `PollDeps`로 주입(가짜 타이머 테스트).

### 개발 서버 `/api` 미들웨어
- `scripts/vite-api-dev.ts`(테스트 먼저): Vite `configureServer`에서 `/api/<name>` 요청을 `server.ssrLoadModule('/api/<name>.ts')`로 불러 export된 `GET`/`POST`에 Web `Request`를 넘기고 `Response`를 Node 응답으로 쓴다. 없는 이름은 404, 메서드 없으면 405. 변환 함수(`toWebRequest`, `writeWebResponse`)를 순수하게 나눠 테스트한다.
- `vite.config.ts`의 일반 모드(아티팩트 아님)에만 플러그인을 넣는다.

### 테스트
- 프로바이더: 성공·모양 오류·상태 코드별 오류·제한 시간·취소.
- 훅: 상태별 간격, 숨김 멈춤·재개, 오류 백오프, 겹침 방지, 언마운트 취소.
- 미들웨어 변환 함수.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `npm run dev`로 띄워 `curl http://localhost:5173/api/games`가 JSON을 주는지 확인한다(네트워크 가능할 때, 1회).
3. 체크리스트: `src/live/providers`·`src/app` 밖에서 fetch·타이머를 쓰지 않았는가? 아티팩트 빌드에서 apiBase가 null인가?
4. `phases/14-live-data/index.json`의 step 2와 `phases/index.json`의 14-live-data 상태를 업데이트한다.

## 금지사항

- 화면을 만들지 마라. 이유: 16-broadcast-ui.
- 브라우저 저장소에 경기 데이터를 두지 마라. 이유: ARCHITECTURE 상태 관리.
- 새 패키지를 설치하지 마라(프록시 미들웨어 라이브러리 등).
