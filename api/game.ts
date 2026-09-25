import { createGameCache } from './_lib/gameCache.js';
import { handleGame } from './_lib/liveHandlers.js';
import { createRateLimiter } from './_lib/rateLimit.js';

/** IP당 분당 60회(ADR-017). 서버리스 인스턴스가 살아 있는 동안 유지된다 */
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000, now: () => Date.now() });
/** 같은 경기 요청을 하나로 합치고 끝난 경기를 잠깐 기억한다 */
const cache = createGameCache({ now: () => Date.now() });

/** Vercel Web 표준 함수: GET /api/game?id=<gameId> */
export async function GET(request: Request): Promise<Response> {
  return handleGame(request, { fetch, limiter, cache, now: () => Date.now() });
}
