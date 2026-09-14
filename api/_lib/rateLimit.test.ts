// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rateLimit';

function clock(start: number) {
  let t = start;
  return {
    now: () => t,
    set: (value: number) => {
      t = value;
    },
  };
}

describe('createRateLimiter', () => {
  it('창 안에서 limit번까지 허용하고, 넘으면 ok false와 창이 끝날 때까지 남은 시간', () => {
    const c = clock(1_000);
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: c.now });
    expect([1, 2, 3].map(() => limiter.check('203.0.113.7'))).toEqual(Array(3).fill({ ok: true, retryAfterMs: 0 }));
    expect(limiter.check('203.0.113.7')).toEqual({ ok: false, retryAfterMs: 59_000 });
    c.set(45_000);
    expect(limiter.check('203.0.113.7')).toEqual({ ok: false, retryAfterMs: 15_000 });
  });

  it('창이 지나면 다시 허용한다', () => {
    const c = clock(0);
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: c.now });
    limiter.check('ip');
    limiter.check('ip');
    expect(limiter.check('ip').ok).toBe(false);
    c.set(59_999);
    expect(limiter.check('ip')).toEqual({ ok: false, retryAfterMs: 1 });
    c.set(60_000);
    expect(limiter.check('ip')).toEqual({ ok: true, retryAfterMs: 0 });
    expect(limiter.check('ip').ok).toBe(true);
    expect(limiter.check('ip').ok).toBe(false);
  });

  it('키마다 따로 센다', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    expect(limiter.check('a').ok).toBe(true);
    expect(limiter.check('a').ok).toBe(false);
    expect(limiter.check('b').ok).toBe(true);
  });

  it('창이 바뀌면 지난 창의 키를 정리한다', () => {
    const c = clock(0);
    const limiter = createRateLimiter({ limit: 5, windowMs: 1_000, now: c.now });
    for (const key of ['a', 'b', 'c']) limiter.check(key);
    expect(limiter.size()).toBe(3);
    c.set(1_500);
    limiter.check('d');
    expect(limiter.size()).toBe(1);
  });
});
