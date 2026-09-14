import { decodeShare, encodeShare, type SharePayload } from '../game';

/** URL 해시 라우트 (ARCHITECTURE "상태 관리"): #/, #/scene/:id(?t=공유 값), #/result, #/evidence, #/about */
export type Route =
  | { screen: 'home' }
  | { screen: 'play'; sceneId: string; share: SharePayload | null }
  | { screen: 'result' }
  | { screen: 'evidence' }
  | { screen: 'about' };

const SCENE_PATH = /^\/scene\/([^/]+)$/;

/** 해시를 라우트로 읽는다. 모르는 값은 첫 화면, 공유 값이 틀렸거나 다른 장면의 것이면 share null */
export function parseHash(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = raw.indexOf('?');
  const path = q === -1 ? raw : raw.slice(0, q);
  const query = q === -1 ? '' : raw.slice(q + 1);
  switch (path) {
    case '':
    case '/':
      return { screen: 'home' };
    case '/result':
      return { screen: 'result' };
    case '/evidence':
      return { screen: 'evidence' };
    case '/about':
      return { screen: 'about' };
    default:
      break;
  }
  const match = SCENE_PATH.exec(path);
  if (!match) return { screen: 'home' };
  let sceneId: string;
  try {
    sceneId = decodeURIComponent(match[1]);
  } catch {
    return { screen: 'home' };
  }
  const token = new URLSearchParams(query).get('t');
  const share = token ? decodeShare(token) : null;
  return { screen: 'play', sceneId, share: share !== null && share.sceneId === sceneId ? share : null };
}

/** 라우트를 해시 문자열로 쓴다 */
export function formatRoute(route: Route): string {
  switch (route.screen) {
    case 'home':
      return '#/';
    case 'play': {
      const base = `#/scene/${encodeURIComponent(route.sceneId)}`;
      return route.share ? `${base}?t=${encodeShare(route.share)}` : base;
    }
    default:
      return `#/${route.screen}`;
  }
}
