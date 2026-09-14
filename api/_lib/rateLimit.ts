/*
 * 고정 창 요청 제한(서버리스 인스턴스 메모리). 모든 키가 같은 창(now를 windowMs로 나눈 구간)을 쓰고,
 * 창이 바뀌면 지난 창의 키를 한꺼번에 버린다(오래된 키 정리).
 */

export interface RateLimiter {
  check(key: string): { ok: boolean; retryAfterMs: number };
  /** 지금 창에서 기억하는 키 수 */
  size(): number;
}

export function createRateLimiter(opts: { limit: number; windowMs: number; now: () => number }): RateLimiter {
  let windowStart = Number.NaN;
  let counts = new Map<string, number>();

  return {
    check(key) {
      const t = opts.now();
      const start = Math.floor(t / opts.windowMs) * opts.windowMs;
      if (start !== windowStart) {
        windowStart = start;
        counts = new Map();
      }
      const used = counts.get(key) ?? 0;
      if (used >= opts.limit) return { ok: false, retryAfterMs: start + opts.windowMs - t };
      counts.set(key, used + 1);
      return { ok: true, retryAfterMs: 0 };
    },
    size() {
      return counts.size;
    },
  };
}
