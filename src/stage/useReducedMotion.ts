import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function mediaList(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(QUERY);
}

function subscribe(onChange: () => void): () => void {
  const list = mediaList();
  if (!list || typeof list.addEventListener !== 'function') return () => {};
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

const getSnapshot = (): boolean => mediaList()?.matches ?? false;
const getServerSnapshot = (): boolean => false;

/** 사용자가 동작 줄이기(prefers-reduced-motion: reduce)를 켰는지. 설정이 바뀌면 다시 그린다. matchMedia가 없으면 false */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
