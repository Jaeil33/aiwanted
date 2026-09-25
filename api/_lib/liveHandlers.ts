import {
  latestInning,
  parseRelay,
  summaryFromSchedule,
} from '../../src/live/relay.js';
import type { GameSummary, LiveGame } from '../../src/types/live.js';
import { createGameCache } from './gameCache.js';
import { NaverError, fetchRelay, fetchSchedule } from './naver.js';
import type { createRateLimiter } from './rateLimit.js';

/*
 * /api/games·/api/game의 속. 서버 함수 파일(api/games.ts·api/game.ts)은 이것만 부른다.
 * 네이버 원문을 그대로 넘기지 않고 GameSummary·LiveGame으로 줄인다(ADR-017).
 *
 * Vercel 기본 함수 빌드라 상대 import에 .js 확장자를 붙인다(ADR-028).
 * 이걸 빠뜨리면 로컬 테스트는 다 통과하고 배포에서만 500이 난다.
 */

export interface LiveDeps {
  fetch: typeof fetch;
  limiter: ReturnType<typeof createRateLimiter>;
  cache: ReturnType<typeof createGameCache>;
  now: () => number;
}

/** 월 달력 한 장 + 여유. 넘는 기간은 400으로 막는다 */
export const MAX_RANGE_DAYS = 45;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const GAME_ID = /^\d{8}[A-Z]{4}\d{5}$/;
const DAY_MS = 86_400_000;
/** 한국 표준시 UTC+9 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 끝난 이닝 payload 10분, 끝난 경기 LiveGame 1시간 */
const FINISHED_INNING_TTL_MS = 10 * 60 * 1000;
const FINISHED_GAME_TTL_MS = 60 * 60 * 1000;

const CACHE_BY_STATUS: Record<string, string> = {
  live: 'public, s-maxage=5, stale-while-revalidate=30',
  before: 'public, s-maxage=60, stale-while-revalidate=300',
  final: 'public, s-maxage=86400, stale-while-revalidate=604800',
  cancelled: 'public, s-maxage=86400, stale-while-revalidate=604800',
  suspended: 'public, s-maxage=60, stale-while-revalidate=300',
};
const LIST_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';
const NO_STORE = 'no-store';

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

/** x-forwarded-for의 첫 값, 없으면 'anon' */
function clientKey(request: Request): string {
  const first = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  return first ? first.slice(0, 64) : 'anon';
}

function rateLimited(request: Request, deps: LiveDeps): Response | null {
  const result = deps.limiter.check(clientKey(request));
  if (result.ok) return null;
  return json(429, { error: 'rate_limited' }, {
    'retry-after': String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))),
    'cache-control': NO_STORE,
  });
}

/** NaverError를 HTTP 상태로. 업스트림 502, 느림 504, 모양 502 */
function upstreamFailure(e: unknown): Response {
  if (!(e instanceof NaverError)) return json(500, { error: 'internal' }, { 'cache-control': NO_STORE });
  if (e.code === 'timeout') return json(504, { error: 'timeout' }, { 'cache-control': NO_STORE });
  const body = e.status === null ? { error: e.code } : { error: e.code, status: e.status };
  return json(502, body, { 'cache-control': NO_STORE });
}

/** 서울 기준 오늘(YYYY-MM-DD) */
export function seoulToday(now: number): string {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 두 날짜 사이의 일수. 같은 날이면 0 */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

interface Range {
  from: string;
  to: string;
}

/** 질의에서 기간을 읽는다. 모양이 틀리거나 너무 길면 null(400) */
export function rangeOf(url: URL, now: number): Range | null {
  const date = url.searchParams.get('date');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (date !== null) {
    return ISO_DATE.test(date) ? { from: date, to: date } : null;
  }
  if (from === null && to === null) {
    const today = seoulToday(now);
    return { from: today, to: today };
  }
  if (from === null || to === null || !ISO_DATE.test(from) || !ISO_DATE.test(to)) return null;
  const span = daysBetween(from, to);
  if (Number.isNaN(span) || span < 0 || span > MAX_RANGE_DAYS) return null;
  return { from, to };
}

/** GET /api/games?date= | ?from=&to= */
export async function handleGames(request: Request, deps: LiveDeps): Promise<Response> {
  const limited = rateLimited(request, deps);
  if (limited) return limited;

  const url = new URL(request.url);
  const range = rangeOf(url, deps.now());
  if (range === null) return json(400, { error: 'bad_range' }, { 'cache-control': NO_STORE });

  try {
    const games = await deps.cache.run(`schedule:${range.from}:${range.to}`, 0, () =>
      fetchSchedule(deps, range));
    return json(200, { games: games.map(summaryFromSchedule) }, { 'cache-control': LIST_CACHE });
  } catch (e) {
    return upstreamFailure(e);
  }
}

/** gameId 앞 여덟 자리가 경기 날짜다 */
function dateOfGameId(gameId: string): string {
  return `${gameId.slice(0, 4)}-${gameId.slice(4, 6)}-${gameId.slice(6, 8)}`;
}

const emptyGame = (summary: GameSummary, fetchedAt: string): LiveGame => ({
  summary,
  names: {},
  hands: {},
  plateAppearances: [],
  current: null,
  fetchedAt,
});

/** GET /api/game?id=<gameId> */
export async function handleGame(request: Request, deps: LiveDeps): Promise<Response> {
  const limited = rateLimited(request, deps);
  if (limited) return limited;

  const url = new URL(request.url);
  const gameId = url.searchParams.get('id') ?? '';
  if (!GAME_ID.test(gameId)) return json(400, { error: 'bad_game_id' }, { 'cache-control': NO_STORE });

  const date = dateOfGameId(gameId);
  try {
    const games = await deps.cache.run(`schedule:${date}:${date}`, 0, () =>
      fetchSchedule(deps, { from: date, to: date }));
    const summary = games.map(summaryFromSchedule).find((g) => g.gameId === gameId);
    if (summary === undefined) return json(404, { error: 'not_found' }, { 'cache-control': NO_STORE });

    const cacheControl = CACHE_BY_STATUS[summary.status] ?? LIST_CACHE;
    const fetchedAt = new Date(deps.now()).toISOString();

    // 경기 전·취소면 중계가 없다. 부르지 않는다
    if (summary.status === 'before' || summary.status === 'cancelled') {
      return json(200, emptyGame(summary, fetchedAt), { 'cache-control': cacheControl });
    }

    const finished = summary.status === 'final';
    const gameTtl = finished ? FINISHED_GAME_TTL_MS : 0;
    const game = await deps.cache.run(`game:${gameId}`, gameTtl, async () => {
      // 이닝 인자 없이 부르면 지금 이닝만 온다. 거기서 전체 이닝 수를 안다
      const head = await deps.cache.run(`relay:${gameId}:head`, 0, () => fetchRelay(deps, gameId));
      if (head === null) return emptyGame(summary, fetchedAt);
      const inn = latestInning(head);
      const innings: unknown[] = [];
      for (let i = 1; i < inn; i++) {
        const ttl = finished || i < inn ? FINISHED_INNING_TTL_MS : 0;
        innings.push(await deps.cache.run(`relay:${gameId}:${i}`, ttl, () => fetchRelay(deps, gameId, i)));
      }
      return parseRelay({
        summary,
        payloads: [...innings.filter((x) => x !== null), head],
        fetchedAt,
      });
    });

    return json(200, game, { 'cache-control': cacheControl });
  } catch (e) {
    return upstreamFailure(e);
  }
}
