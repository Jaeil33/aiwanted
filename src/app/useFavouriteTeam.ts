import { useCallback, useSyncExternalStore } from 'react';
import { isTeamCode } from '../domain/teams';
import type { TeamCode } from '../types/data';

/*
 * 응원팀 한 값만 브라우저에 저장한다(ADR-034, ARCHITECTURE 브라우저 저장소 금지의 유일한 예외).
 * 진행 중 경기·TMI·그 밖의 설정은 저장하지 않는다. 읽기·쓰기가 막혀도(사생활 보호 모드) 앱은 팀 없이 돈다.
 */

export const FAVOURITE_TEAM_KEY = 'tmi.team';

/** 저장된 응원팀. 없거나 팀 코드가 아니거나 저장소를 읽을 수 없으면 null */
export function readFavouriteTeam(): TeamCode | null {
  try {
    const value = window.localStorage.getItem(FAVOURITE_TEAM_KEY);
    return value !== null && isTeamCode(value) ? value : null;
  } catch {
    return null;
  }
}

/** 이 탭의 구독자: 저장소 이벤트는 다른 탭에서만 오므로 우리가 직접 알린다 */
const listeners = new Set<() => void>();
/** 저장이 막혔을 때만 쓰는 이 탭의 기억. undefined면 저장소가 진실이다 */
let fallback: TeamCode | null | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// 값이 문자열이나 null이라 useSyncExternalStore가 요구하는 참조 안정성은 저절로 지켜진다: 캐시하지 않는다
function getSnapshot(): TeamCode | null {
  return fallback === undefined ? readFavouriteTeam() : fallback;
}

const getServerSnapshot = (): TeamCode | null => null;

/** 응원팀을 바꾼다. 저장이 막혀도 화면 값은 바뀐다 */
export function setFavouriteTeam(code: TeamCode | null): void {
  try {
    if (code === null) window.localStorage.removeItem(FAVOURITE_TEAM_KEY);
    else window.localStorage.setItem(FAVOURITE_TEAM_KEY, code);
    fallback = undefined;
  } catch {
    // 저장소가 막혔다(사생활 보호 모드·차단): 이 탭에서만 기억한다
    fallback = code;
  }
  for (const listener of [...listeners]) listener();
}

/** [응원팀, 바꾸기]. 같은 탭의 다른 화면도 함께 바뀐다 */
export function useFavouriteTeam(): [TeamCode | null, (code: TeamCode | null) => void] {
  const team = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const set = useCallback((code: TeamCode | null) => setFavouriteTeam(code), []);
  return [team, set];
}
