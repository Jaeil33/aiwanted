import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from './useReducedMotion';

const QUERY = '(prefers-reduced-motion: reduce)';

/** window.matchMedia 가짜: 상태 하나를 공유하고 change 리스너를 모은다 */
function fakeMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const queries: string[] = [];
  const matchMedia = vi.fn((query: string) => {
    queries.push(query);
    return {
      media: query,
      get matches() {
        return matches;
      },
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  });
  return {
    matchMedia,
    listeners,
    queries,
    set(next: boolean) {
      matches = next;
      for (const listener of [...listeners]) listener({ matches: next, media: QUERY } as MediaQueryListEvent);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useReducedMotion', () => {
  it('matchMedia가 없으면 false다', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('prefers-reduced-motion: reduce 질의 결과를 그대로 준다', () => {
    const on = fakeMatchMedia(true);
    vi.stubGlobal('matchMedia', on.matchMedia);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true);
    expect(on.queries.length).toBeGreaterThan(0);
    expect(on.queries.every((query) => query === QUERY)).toBe(true);

    const off = fakeMatchMedia(false);
    vi.stubGlobal('matchMedia', off.matchMedia);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
  });

  it('설정이 바뀌면(change 이벤트) 값을 갱신하고, 언마운트하면 구독을 푼다', () => {
    const media = fakeMatchMedia(false);
    vi.stubGlobal('matchMedia', media.matchMedia);
    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    expect(media.listeners.size).toBe(1);
    act(() => media.set(true));
    expect(result.current).toBe(true);
    act(() => media.set(false));
    expect(result.current).toBe(false);
    unmount();
    expect(media.listeners.size).toBe(0);
  });
});
