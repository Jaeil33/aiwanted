import { createGameCache } from './_lib/gameCache.js';
import { handleGames } from './_lib/liveHandlers.js';
import { createRateLimiter } from './_lib/rateLimit.js';

/** IP당 분당 60회(ADR-017). 서버리스 인스턴스가 살아 있는 동안 유지된다 */
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000, now: () => Date.now() });
/** 같은 기간 조회를 합친다. 인스턴스가 죽으면 같이 사라진다 */
const cache = createGameCache({ now: () => Date.now() });

/** Vercel Web 표준 함수: GET /api/games?date= 또는 ?from=&to= */
export async function GET(request: Request): Promise<Response> {
  return handleGames(request, { fetch, limiter, cache, now: () => Date.now() });
}
