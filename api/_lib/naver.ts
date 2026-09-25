/*
 * 네이버 스포츠 비공식 API 호출. 브라우저는 이 서버를 거쳐야 한다 — 외부 Origin으로 직접 부르면 403이다(ADR-017).
 * 원문을 그대로 돌려주지 않는다. 부르는 쪽(liveHandlers)이 src/live/relay.ts로 LiveGame까지 줄인다.
 *
 * Vercel 기본 함수 빌드를 쓰므로 상대 import에 .js 확장자를 붙인다(ADR-028).
 */

const BASE = 'https://api-gw.sports.naver.com/schedule/games';

/** 재시도는 하지 않는다. 느리면 부르는 쪽이 504로 옮긴다 */
export const NAVER_TIMEOUT_MS = 8000;

/** 브라우저처럼 보이는 UA. Origin·Referer는 절대 붙이지 않는다(403) */
const HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  accept: 'application/json',
};

export type NaverErrorCode = 'upstream' | 'timeout' | 'shape';

export class NaverError extends Error {
  readonly code: NaverErrorCode;
  /** 업스트림 HTTP 상태. 응답을 받지 못했으면 null (ADR-029와 같은 뜻) */
  readonly status: number | null;

  constructor(code: NaverErrorCode, message: string = code, status: number | null = null) {
    super(message);
    this.name = 'NaverError';
    this.code = code;
    this.status = status;
  }
}

export interface NaverDeps {
  fetch: typeof fetch;
}

/** 일정 조회 주소. 네이버가 fromDate·toDate 기간을 받으므로 한 팀의 한 달이 요청 한 번이다(ADR-032) */
/** 한 번에 받아 오는 경기 수. 한 달 최대 31일 × 5경기 = 155 */
export const SCHEDULE_PAGE_SIZE = 500;

export function scheduleUrl(from: string, to: string): string {
  const url = new URL(BASE);
  // 'basic'만 주면 stadium이 빠진다(2026-09-26 실제 응답으로 확인). 구장은 상황 맥락(돔·날씨)에 쓴다
  url.searchParams.set('fields', 'basic,stadium');
  url.searchParams.set('upperCategoryId', 'kbaseball');
  url.searchParams.set('categoryId', 'kbo');
  // size를 안 주면 10경기만 온다(2026-09-26 확인). 한 달이면 최대 155경기라 넉넉히 잡는다
  url.searchParams.set('size', String(SCHEDULE_PAGE_SIZE));
  url.searchParams.set('fromDate', from);
  url.searchParams.set('toDate', to);
  return url.toString();
}

/** 중계 조회 주소. 이닝을 주지 않으면 지금 이닝만 온다 */
export function relayUrl(gameId: string, inning?: number): string {
  const url = new URL(`${BASE}/${gameId}/relay`);
  if (inning !== undefined) url.searchParams.set('inning', String(inning));
  return url.toString();
}

async function getJson(deps: NaverDeps, url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NAVER_TIMEOUT_MS);
  let response: Response;
  try {
    response = await deps.fetch(url, { headers: { ...HEADERS }, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new NaverError('timeout');
    throw new NaverError('upstream', e instanceof Error ? e.message : 'fetch failed');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new NaverError('upstream', `HTTP ${response.status}`, response.status);
  try {
    return await response.json();
  } catch {
    throw new NaverError('shape', 'not json', response.status);
  }
}

const rec = (x: unknown): Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : {};

/** 기간의 경기 목록(원문). 부르는 쪽이 summaryFromSchedule로 줄인다 */
export async function fetchSchedule(deps: NaverDeps, range: { from: string; to: string }): Promise<unknown[]> {
  const body = await getJson(deps, scheduleUrl(range.from, range.to));
  const games = rec(rec(body).result).games;
  if (!Array.isArray(games)) throw new NaverError('shape', 'no result.games');
  return games;
}

/** 한 경기의 중계(원문). 경기 전이면 textRelayData가 null이고 이것은 오류가 아니다 */
export async function fetchRelay(deps: NaverDeps, gameId: string, inning?: number): Promise<unknown> {
  const body = await getJson(deps, relayUrl(gameId, inning));
  const result = rec(body).result;
  if (result === undefined || result === null) throw new NaverError('shape', 'no result');
  const data = rec(result).textRelayData;
  return data ?? null;
}
