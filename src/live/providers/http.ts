import type { GameSummary, LiveGame } from '../../types/live.js';
import { isGameSummaryList, isLiveGame } from '../validate.js';

/*
 * 실시간·지난 경기 클라이언트(ADR-017). 브라우저는 네이버를 직접 부를 수 없으므로 서버 함수(api/games·api/game)만 부른다.
 * 폴링은 하지 않는다(ADR-032): 다시 받는 일은 화면의 refresh()가 시킨다.
 *
 * src/live 안에서 fetch를 쓰는 곳은 여기(providers)뿐이다(CLAUDE.md 순수 모듈 규칙).
 */

export type LiveErrorCode = 'network' | 'timeout' | 'cancelled' | 'rate' | 'notFound' | 'upstream' | 'shape';

/** 경기 요청 실패. code로 화면 문구와 다시 받기 여부를 고른다 */
export class LiveError extends Error {
  readonly code: LiveErrorCode;

  constructor(code: LiveErrorCode, message: string = code) {
    super(message);
    this.name = 'LiveError';
    this.code = code;
  }
}

/** YYYY-MM-DD 두 개. 하루면 from === to */
export interface DateRange {
  from: string;
  to: string;
}

export interface LiveApi {
  games(range: DateRange, signal?: AbortSignal): Promise<GameSummary[]>;
  game(gameId: string, signal?: AbortSignal): Promise<LiveGame>;
}

export interface LiveApiOptions {
  /** 서버리스 함수 경로의 앞부분. 예: "/api" */
  baseUrl: string;
  fetch: typeof fetch;
  gamesTimeoutMs?: number;
  gameTimeoutMs?: number;
}

/** 서버 maxDuration이 10초(games)·20초(game)다. 그보다 조금 넉넉하게 기다린다 */
const DEFAULT_GAMES_TIMEOUT_MS = 10_000;
const DEFAULT_GAME_TIMEOUT_MS = 25_000;

export function createLiveApi(opts: LiveApiOptions): LiveApi {
  const base = opts.baseUrl.replace(/\/+$/, '');
  // 브라우저 fetch는 다른 객체의 메서드로 부르면 Illegal invocation이다: 떼어 낸 함수로 부른다.
  const fetchImpl = opts.fetch;

  async function get(path: string, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw new LiveError('cancelled', '경기 요청이 취소됐어요.');
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    /** 요청이 중간에 끊겼으면 끊긴 이유(제한 시간·취소)가 먼저다 */
    const interrupted = (otherwise: LiveError): LiveError => {
      if (timedOut) return new LiveError('timeout', `경기 정보가 ${timeoutMs}ms 안에 오지 않았어요.`);
      if (signal?.aborted) return new LiveError('cancelled', '경기 요청이 취소됐어요.');
      return otherwise;
    };

    try {
      let response: Response;
      try {
        response = await fetchImpl(`${base}${path}`, { headers: { accept: 'application/json' }, signal: controller.signal });
      } catch {
        throw interrupted(new LiveError('network', '경기 서버에 연결하지 못했어요.'));
      }
      if (response.status === 404) throw new LiveError('notFound', '그 경기를 찾지 못했어요.');
      if (response.status === 429) throw new LiveError('rate', '잠깐 쉬었다가 다시 받아 주세요.');
      if (!response.ok) throw new LiveError('upstream', `경기 서버 오류 (HTTP ${response.status})`);
      try {
        return await response.json();
      } catch {
        throw interrupted(new LiveError('shape', '경기 서버 응답이 JSON이 아니에요.'));
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  return {
    async games(range, signal) {
      const query = new URLSearchParams({ from: range.from, to: range.to });
      const body = await get(`/games?${query}`, opts.gamesTimeoutMs ?? DEFAULT_GAMES_TIMEOUT_MS, signal);
      const games = typeof body === 'object' && body !== null ? (body as { games?: unknown }).games : undefined;
      if (!isGameSummaryList(games)) throw new LiveError('shape', '경기 목록 모양이 계약과 달라요.');
      return games;
    },

    async game(gameId, signal) {
      const query = new URLSearchParams({ id: gameId });
      const body = await get(`/game?${query}`, opts.gameTimeoutMs ?? DEFAULT_GAME_TIMEOUT_MS, signal);
      if (!isLiveGame(body)) throw new LiveError('shape', '경기 모양이 계약과 달라요.');
      return body;
    },
  };
}
