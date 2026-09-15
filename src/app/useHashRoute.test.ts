import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHashRoute } from './useHashRoute';

const clearHash = () => window.history.replaceState(null, '', '/');

beforeEach(clearHash);
afterEach(() => {
  vi.restoreAllMocks();
  clearHash();
});

describe('useHashRoute', () => {
  it('지금 해시의 라우트를 읽는다', () => {
    window.history.replaceState(null, '', '/#/about');
    const { result } = renderHook(() => useHashRoute());
    expect(result.current[0]).toEqual({ screen: 'about' });
  });

  it('해시가 없으면 첫 화면', () => {
    const { result } = renderHook(() => useHashRoute());
    expect(result.current[0]).toEqual({ screen: 'home' });
  });

  it('setRoute는 해시를 바꾸고 라우트도 곧바로 바뀐다', () => {
    const { result } = renderHook(() => useHashRoute());
    act(() => {
      result.current[1]({ screen: 'play', sceneId: 'fixture-walkoff', share: null });
    });
    expect(window.location.hash).toBe('#/scene/fixture-walkoff');
    expect(result.current[0]).toEqual({ screen: 'play', sceneId: 'fixture-walkoff', share: null });
  });

  it('replace면 방문 기록을 쌓지 않고 해시와 라우트만 바꾼다 (되돌려 보내기용)', () => {
    const { result } = renderHook(() => useHashRoute());
    const length = window.history.length;
    act(() => {
      result.current[1]({ screen: 'about' }, { replace: true });
    });
    expect(window.location.hash).toBe('#/about');
    expect(window.history.length).toBe(length);
    expect(result.current[0]).toEqual({ screen: 'about' });
  });

  it('같은 라우트로 다시 부르면 해시를 그대로 둔다', () => {
    window.history.replaceState(null, '', '/#/evidence');
    const { result } = renderHook(() => useHashRoute());
    const before = result.current[0];
    act(() => {
      result.current[1]({ screen: 'evidence' });
    });
    expect(window.location.hash).toBe('#/evidence');
    expect(result.current[0]).toBe(before);
  });

  it('바깥에서 해시가 바뀌면(hashchange) 따라간다', async () => {
    const { result } = renderHook(() => useHashRoute());
    act(() => {
      window.location.hash = '#/result';
    });
    await waitFor(() => expect(result.current[0]).toEqual({ screen: 'result' }));
  });

  it('언마운트하면 hashchange 구독을 푼다', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useHashRoute());
    const listener = add.mock.calls.find(([type]) => type === 'hashchange')?.[1];
    expect(listener).toBeTypeOf('function');
    unmount();
    expect(remove).toHaveBeenCalledWith('hashchange', listener);
  });
});
