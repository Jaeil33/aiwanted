import { handleInterpret } from './_lib/handlers';
import { createRateLimiter } from './_lib/rateLimit';

/** IP당 분당 10회(ADR-006). 서버리스 인스턴스가 살아 있는 동안 유지된다 */
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000, now: () => Date.now() });

/** Vercel Web 표준 함수: POST /api/interpret. API 키와 모델은 process.env에서만 읽는다 */
export async function POST(request: Request): Promise<Response> {
  return handleInterpret(request, { env: process.env, fetch, limiter });
}
