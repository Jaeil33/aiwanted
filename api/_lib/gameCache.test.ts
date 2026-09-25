import { describe, expect, it, vi } from 'vitest';
import { createGameCache } from './gameCache';

/*
 * 보는 사람 수와 상관없이 네이버 호출을 묶어야 차단 위험이 작다(ADR-017).
 * 시계는 주입한다 — 서버 함수 층이지만 이 모듈 자체는 시간을 읽지 않는다.
 */

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('createGameCache', () => {
  it('같은 키의 동시 요청을 한 번만 실행한다', async () => {
    const cache = createGameCache({ now: clock().now });
    const fn = vi.fn(async () => 'v');
    const [a, b, c] = await Promise.all([
      cache.run('k', 1000, fn),
      cache.run('k', 1000, fn),
      cache.run('k', 1000, fn),
    ]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect([a, b, c]).toEqual(['v', 'v', 'v']);
  });

  it('다른 키는 따로 실행한다', async () => {
    const cache = createGameCache({ now: clock().now });
    const fn = vi.fn(async () => 'v');
    await Promise.all([cache.run('a', 1000, fn), cache.run('b', 1000, fn)]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('TTL 안에서는 기억한 값을 준다', async () => {
    const c = clock();
    const cache = createGameCache({ now: c.now });
    const fn = vi.fn(async () => 'v');
    await cache.run('k', 1000, fn);
    c.advance(999);
    await cache.run('k', 1000, fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('TTL이 지나면 다시 실행한다', async () => {
    const c = clock();
    const cache = createGameCache({ now: c.now });
    const fn = vi.fn(async () => 'v');
    await cache.run('k', 1000, fn);
    c.advance(1001);
    await cache.run('k', 1000, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('TTL 0이면 기억하지 않지만 동시 요청은 합친다', async () => {
    const cache = createGameCache({ now: clock().now });
    const fn = vi.fn(async () => 'v');
    await Promise.all([cache.run('k', 0, fn), cache.run('k', 0, fn)]);
    expect(fn).toHaveBeenCalledTimes(1);
    await cache.run('k', 0, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('실패는 기억하지 않는다', async () => {
    const cache = createGameCache({ now: clock().now });
    const fn = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(cache.run('k', 10_000, fn)).rejects.toThrow('boom');
    await expect(cache.run('k', 10_000, fn)).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('실패해도 같은 오류를 기다리던 쪽에 모두 전한다', async () => {
    const cache = createGameCache({ now: clock().now });
    const fn = vi.fn(async () => {
      throw new Error('boom');
    });
    const results = await Promise.allSettled([cache.run('k', 100, fn), cache.run('k', 100, fn)]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('최대 개수를 넘으면 오래된 것부터 버린다', async () => {
    const cache = createGameCache({ now: clock().now, maxEntries: 2 });
    const fn = vi.fn(async () => 'v');
    await cache.run('a', 10_000, fn);
    await cache.run('b', 10_000, fn);
    await cache.run('c', 10_000, fn);
    expect(cache.size()).toBeLessThanOrEqual(2);
    await cache.run('a', 10_000, fn);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('기억한 값이 있어도 TTL이 0이면 새로 실행한다', async () => {
    const c = clock();
    const cache = createGameCache({ now: c.now });
    const fn = vi.fn(async () => 'v');
    await cache.run('k', 10_000, fn);
    await cache.run('k', 0, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
