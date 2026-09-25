import { isTeamCode } from '../domain/teams';
import { decodeShare, encodeShare, type SharePayload } from '../game';
import type { Situation, TeamCode } from '../types/data';

/**
 * URL 해시 라우트 (ARCHITECTURE "상태 관리"). 브라우저 저장소는 쓰지 않는다(ADR-039) — 상태는 전부 주소에 있다.
 *
 * `#/`                     홈(추천 승부처)
 * `#/teams`                팀 고르기
 * `#/team/:code?m=YYYY-MM` 그 팀 일정 달력
 * `#/game/:gameId`         그 경기 타석 목록
 * `#/pa/:gameId/:no?t=`    그 타석 되돌려보기
 * `#/scene/:id?t=`         골라 둔 장면(19-season step 10에서 사라진다)
 * `#/result` `#/evidence` `#/about`
 */
export type Route =
  | { screen: 'home' }
  | { screen: 'teams' }
  | { screen: 'team'; code: TeamCode; month: string | null }
  | { screen: 'game'; gameId: string }
  | { screen: 'pa'; gameId: string; no: number; share: SharePayload | null }
  | { screen: 'play'; sceneId: string; share: SharePayload | null }
  | { screen: 'result' }
  | { screen: 'evidence' }
  | { screen: 'about' };

const SCENE_PATH = /^\/scene\/([^/]+)$/;
const TEAM_PATH = /^\/team\/([A-Z]{2})$/;
const GAME_PATH = /^\/game\/(\d{8}[A-Z]{4}\d{5})$/;
const PA_PATH = /^\/pa\/(\d{8}[A-Z]{4}\d{5})\/(\d+)$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 타석 하나의 상황 id: 공유 값이 이 id와 맞아야 읽는다 */
export const situationIdOf = (gameId: string, no: number): string => `${gameId}-${no}`;

/** 공유 값(?t=)을 읽는다. 없거나 틀렸거나 다른 상황의 것이면 null */
function shareOf(query: string, situationId: string): SharePayload | null {
  const token = new URLSearchParams(query).get('t');
  if (!token) return null;
  const share = decodeShare(token);
  return share !== null && share.sceneId === situationId ? share : null;
}

/** 해시를 라우트로 읽는다. 모르는 값은 첫 화면 */
export function parseHash(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = raw.indexOf('?');
  const path = q === -1 ? raw : raw.slice(0, q);
  const query = q === -1 ? '' : raw.slice(q + 1);
  switch (path) {
    case '':
    case '/':
      return { screen: 'home' };
    case '/teams':
      return { screen: 'teams' };
    case '/result':
      return { screen: 'result' };
    case '/evidence':
      return { screen: 'evidence' };
    case '/about':
      return { screen: 'about' };
    default:
      break;
  }

  const team = TEAM_PATH.exec(path);
  if (team) {
    if (!isTeamCode(team[1])) return { screen: 'home' };
    const month = new URLSearchParams(query).get('m');
    return { screen: 'team', code: team[1], month: month !== null && MONTH.test(month) ? month : null };
  }

  const game = GAME_PATH.exec(path);
  if (game) return { screen: 'game', gameId: game[1] };

  const pa = PA_PATH.exec(path);
  if (pa) {
    const no = Number(pa[2]);
    if (!Number.isInteger(no) || no < 1) return { screen: 'home' };
    return { screen: 'pa', gameId: pa[1], no, share: shareOf(query, situationIdOf(pa[1], no)) };
  }

  const scene = SCENE_PATH.exec(path);
  if (!scene) return { screen: 'home' };
  let sceneId: string;
  try {
    sceneId = decodeURIComponent(scene[1]);
  } catch {
    return { screen: 'home' };
  }
  return { screen: 'play', sceneId, share: shareOf(query, sceneId) };
}

/** 라우트를 해시 문자열로 쓴다 */
export function formatRoute(route: Route): string {
  switch (route.screen) {
    case 'home':
      return '#/';
    case 'teams':
      return '#/teams';
    case 'team':
      return route.month === null ? `#/team/${route.code}` : `#/team/${route.code}?m=${route.month}`;
    case 'game':
      return `#/game/${route.gameId}`;
    case 'pa': {
      const base = `#/pa/${route.gameId}/${route.no}`;
      return route.share ? `${base}?t=${encodeShare(route.share)}` : base;
    }
    case 'play': {
      const base = `#/scene/${encodeURIComponent(route.sceneId)}`;
      return route.share ? `${base}?t=${encodeShare(route.share)}` : base;
    }
    default:
      return `#/${route.screen}`;
  }
}

/** 그 상황을 여는 라우트. 지난 경기 타석이면 `#/pa/…`, 골라 둔 장면이면 `#/scene/…` */
export function routeForSituation(situation: Situation, share: SharePayload | null): Route {
  if (situation.gameId !== null && situation.paNo !== null) {
    return { screen: 'pa', gameId: situation.gameId, no: situation.paNo, share };
  }
  return { screen: 'play', sceneId: situation.id, share };
}
