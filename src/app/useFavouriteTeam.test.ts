import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAVOURITE_TEAM_KEY, readFavouriteTeam, setFavouriteTeam, useFavouriteTeam } from './useFavouriteTeam';

/*
 * 응원팀 한 값만 브라우저에 저장한다(ADR-034). 저장소가 막혀도 앱이 돌아야 한다.
 */

beforeEach(() => {
  window.localStorage.clear();
  // 저장이 막혔을 때 쓰는 모듈 기억까지 되돌린다
  setFavouriteTeam(null);
  window.localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('readFavouriteTeam', () => {
  it('저장한 팀 코드를 읽는다', () => {
    window.localStorage.setItem(FAVOURITE_TEAM_KEY, 'HH');
    expect(readFavouriteTeam()).toBe('HH');
  });

  it('없거나 팀 코드가 아니면 null', () => {
    expect(readFavouriteTeam()).toBeNull();
    window.localStorage.setItem(FAVOURITE_TEAM_KEY, 'ZZ');
    expect(readFavouriteTeam()).toBeNull();
  });

  it('저장소를 읽을 수 없어도 던지지 않는다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readFavouriteTeam()).toBeNull();
  });
});

describe('useFavouriteTeam', () => {
  it('처음에는 저장된 값, 고르면 저장하고 알린다', () => {
    const { result } = renderHook(() => useFavouriteTeam());
    expect(result.current[0]).toBeNull();
    act(() => {
      result.current[1]('LT');
    });
    expect(result.current[0]).toBe('LT');
    expect(window.localStorage.getItem(FAVOURITE_TEAM_KEY)).toBe('LT');
  });

  it('null을 주면 지운다', () => {
    window.localStorage.setItem(FAVOURITE_TEAM_KEY, 'HH');
    const { result } = renderHook(() => useFavouriteTeam());
    expect(result.current[0]).toBe('HH');
    act(() => {
      result.current[1](null);
    });
    expect(result.current[0]).toBeNull();
    expect(window.localStorage.getItem(FAVOURITE_TEAM_KEY)).toBeNull();
  });

  it('같은 탭의 다른 화면도 함께 바뀐다', () => {
    const a = renderHook(() => useFavouriteTeam());
    const b = renderHook(() => useFavouriteTeam());
    act(() => {
      a.result.current[1]('SS');
    });
    expect(b.result.current[0]).toBe('SS');
  });

  it('저장소에 쓸 수 없어도 화면 값은 바뀐다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useFavouriteTeam());
    act(() => {
      result.current[1]('KT');
    });
    expect(result.current[0]).toBe('KT');
  });
});
