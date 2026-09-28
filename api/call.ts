import { handleCall } from './_lib/handlers.js';
import { createRateLimiter } from './_lib/rateLimit.js';

/*
 * IP당 분당 20회. 해석·판정(10회, ADR-006)보다 넉넉한 이유: 자막은 사용자가 누르는 게 아니라
 * 타석이 끝날 때마다 저절로 난다(23-commentary). 서버리스 인스턴스가 살아 있는 동안 유지된다.
 */
const limiter = createRateLimiter({ limit: 20, windowMs: 60_000, now: () => Date.now() });

/** Vercel Web 표준 함수: POST /api/call. API 키와 모델은 process.env에서만 읽는다 */
export async function POST(request: Request): Promise<Response> {
  return handleCall(request, { env: process.env, fetch, limiter });
}
