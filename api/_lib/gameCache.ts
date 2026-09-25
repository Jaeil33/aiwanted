/*
 * 서버리스 인스턴스 안의 요청 합치기 + 짧은 기억(ADR-017).
 * 보는 사람 수와 상관없이 네이버 호출을 묶어야 차단 위험이 작다.
 * 인스턴스가 죽으면 같이 사라진다 — 진짜 캐시는 CDN(Cache-Control)이 한다.
 *
 * 시계는 주입한다. 상대 import에 .js 확장자를 붙인다(ADR-028).
 */

/** 인스턴스 메모리를 지키는 상한. 넘으면 먼저 들어온 것부터 버린다 */
const DEFAULT_MAX_ENTRIES = 64;

interface Entry {
  value: unknown;
  expiresAt: number;
}

export interface GameCache {
  /**
   * `key`의 값을 준다. 기억한 값이 살아 있으면 그것을, 아니면 `fn`을 부른다.
   * 같은 키로 동시에 들어온 요청은 하나로 합친다. 실패는 기억하지 않는다.
   * `ttlMs`가 0이면 기억하지 않지만 합치기는 한다.
   */
  run<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
  size(): number;
}

export function createGameCache(opts: { now: () => number; maxEntries?: number }): GameCache {
  const max = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const entries = new Map<string, Entry>();
  const inFlight = new Map<string, Promise<unknown>>();

  function remember(key: string, value: unknown, ttlMs: number): void {
    if (ttlMs <= 0) return;
    entries.delete(key);
    entries.set(key, { value, expiresAt: opts.now() + ttlMs });
    while (entries.size > max) {
      const oldest = entries.keys().next();
      if (oldest.done) break;
      entries.delete(oldest.value);
    }
  }

  return {
    run<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
      if (ttlMs > 0) {
        const hit = entries.get(key);
        if (hit !== undefined && hit.expiresAt > opts.now()) return Promise.resolve(hit.value as T);
        if (hit !== undefined) entries.delete(key);
      }
      const running = inFlight.get(key);
      if (running !== undefined) return running as Promise<T>;

      const promise = fn()
        .then((value) => {
          remember(key, value, ttlMs);
          return value;
        })
        .finally(() => {
          inFlight.delete(key);
        });
      inFlight.set(key, promise);
      return promise;
    },
    size() {
      return entries.size;
    },
  };
}
