import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { formatRoute, parseHash, type Route } from './router';

/** 이 탭의 구독자: setRoute가 hashchange 이벤트(비동기)를 기다리지 않고 곧바로 알린다 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('hashchange', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('hashchange', listener);
  };
}

const readHash = () => window.location.hash;
const serverHash = () => '';

/** 지금 해시 라우트와 라우트를 바꾸는 함수. hashchange를 구독한다 */
export function useHashRoute(): [Route, (route: Route) => void] {
  const hash = useSyncExternalStore(subscribe, readHash, serverHash);
  const route = useMemo(() => parseHash(hash), [hash]);
  const setRoute = useCallback((next: Route) => {
    const target = formatRoute(next);
    if (window.location.hash === target) return;
    window.location.hash = target;
    for (const listener of [...listeners]) listener();
  }, []);
  return [route, setRoute];
}
