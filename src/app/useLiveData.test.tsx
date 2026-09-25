import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LiveError, type LiveApi } from '../live/providers/http';
import { fixtureGameSummaries, fixtureLiveGame } from '../test/fixtures/live';
import { useGames, useLiveGame } from './useLiveData';

/*
 * 폴링은 없다(ADR-032). 한 번 받고, refresh()로만 다시 받는다.
 */

const GAMES = fixtureGameSummaries();
const GAME = fixtureLiveGame();
const RANGE = { from: '2026-09-14', to: '2026-09-15' };
const GAME_ID = '20260915LGOB02026';

/** games·game을 주는 가짜 LiveApi. 부른 횟수와 신호를 기록한다 */
function fakeApi(over: Partial<LiveApi> = {}): LiveApi & { signals: AbortSignal[] } {
  const signals: AbortSignal[] = [];
  return {
    games: vi.fn(async (_range, signal) => {
      if (signal) signals.push(signal);
      return GAMES;
    }),
    game: vi.fn(async (_id, signal) => {
      if (signal) signals.push(signal);
      return GAME;
    }),
    ...over,
    signals,
  };
}

describe('useGames', () => {
  it('한 번 받아서 목록을 준다', async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useGames(api, RANGE));
    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.data).toEqual(GAMES);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(api.games).toHaveBeenCalledTimes(1);
  });

  it('폴링하지 않는다: 시간이 흘러도 한 번만 부른다', async () => {
    vi.useFakeTimers();
    try {
      const api = fakeApi();
      renderHook(() => useGames(api, RANGE));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600_000);
      });
      expect(api.games).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('refresh()로만 다시 받는다', async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useGames(api, RANGE));
    await waitFor(() => {
      expect(result.current.data).toEqual(GAMES);
    });
    act(() => {
      result.current.refresh();
    });
    await waitFor(() => {
      expect(api.games).toHaveBeenCalledTimes(2);
    });
  });

  it('기간이 바뀌면 다시 받고 앞 요청을 끊는다', async () => {
    const api = fakeApi();
    const { result, rerender } = renderHook(({ range }) => useGames(api, range), { initialProps: { range: RANGE } });
    await waitFor(() => {
      expect(result.current.data).toEqual(GAMES);
    });
    rerender({ range: { from: '2026-09-20', to: '2026-09-20' } });
    await waitFor(() => {
      expect(api.games).toHaveBeenCalledTimes(2);
    });
    expect(api.signals[0].aborted).toBe(true);
  });

  it('같은 기간으로 다시 그려도 더 부르지 않는다', async () => {
    const api = fakeApi();
    const { result, rerender } = renderHook(({ range }) => useGames(api, range), { initialProps: { range: RANGE } });
    await waitFor(() => {
      expect(result.current.data).toEqual(GAMES);
    });
    rerender({ range: { from: RANGE.from, to: RANGE.to } });
    rerender({ range: { from: RANGE.from, to: RANGE.to } });
    expect(api.games).toHaveBeenCalledTimes(1);
  });

  it('api가 null이면 부르지 않고 기다리지도 않는다', () => {
    const { result } = renderHook(() => useGames(null, RANGE));
    expect(result.current).toMatchObject({ data: null, error: null, loading: false });
  });

  it('range가 null이면 부르지 않는다', () => {
    const api = fakeApi();
    const { result } = renderHook(() => useGames(api, null));
    expect(result.current.loading).toBe(false);
    expect(api.games).not.toHaveBeenCalled();
  });

  it('오류 코드를 그대로 준다', async () => {
    const api = fakeApi({
      games: vi.fn(async () => {
        throw new LiveError('upstream');
      }),
    });
    const { result } = renderHook(() => useGames(api, RANGE));
    await waitFor(() => {
      expect(result.current.error).toBe('upstream');
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('LiveError가 아닌 오류는 network로 본다', async () => {
    const api = fakeApi({
      games: vi.fn(async () => {
        throw new Error('뭔가 잘못됐다');
      }),
    });
    const { result } = renderHook(() => useGames(api, RANGE));
    await waitFor(() => {
      expect(result.current.error).toBe('network');
    });
  });

  it('언마운트하면 요청을 끊는다', async () => {
    const seen: AbortSignal[] = [];
    const api = fakeApi({
      games: vi.fn(
        (_range, signal) =>
          new Promise<typeof GAMES>((resolve) => {
            if (signal) seen.push(signal);
            signal?.addEventListener('abort', () => {
              resolve(GAMES);
            });
          }),
      ),
    });
    const { unmount } = renderHook(() => useGames(api, RANGE));
    unmount();
    expect(seen).toHaveLength(1);
    expect(seen[0].aborted).toBe(true);
    // 끊긴 뒤 늦게 도착한 응답이 React 경고를 내지 않는다
    await act(async () => {
      await Promise.resolve();
    });
  });
});

describe('useLiveGame', () => {
  it('경기 하나를 받는다', async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useLiveGame(api, GAME_ID));
    await waitFor(() => {
      expect(result.current.data).toEqual(GAME);
    });
    expect(api.game).toHaveBeenCalledWith(GAME_ID, expect.any(AbortSignal));
  });

  it('경기 id가 바뀌면 앞 경기 값을 내보내지 않는다', async () => {
    const api = fakeApi();
    const { result, rerender } = renderHook(({ id }) => useLiveGame(api, id), { initialProps: { id: GAME_ID } });
    await waitFor(() => {
      expect(result.current.data).toEqual(GAME);
    });
    rerender({ id: '20260916HTSK02026' });
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it('gameId가 null이면 부르지 않는다', () => {
    const api = fakeApi();
    const { result } = renderHook(() => useLiveGame(api, null));
    expect(result.current.loading).toBe(false);
    expect(api.game).not.toHaveBeenCalled();
  });

  it('cancelled 오류는 화면에 남기지 않는다', async () => {
    const api = fakeApi({
      game: vi.fn(async () => {
        throw new LiveError('cancelled');
      }),
    });
    const { result } = renderHook(() => useLiveGame(api, GAME_ID));
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    expect(result.current.error).toBeNull();
  });
});
