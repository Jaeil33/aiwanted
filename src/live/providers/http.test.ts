import { describe, expect, it, vi } from 'vitest';
import { fixtureGameSummaries, fixtureLiveGame } from '../../test/fixtures/live';
import { LiveError, createLiveApi } from './http';

/*
 * 브라우저 → 서버 함수. 주입한 fetch로만 부른다. 진짜 네트워크를 쓰지 않는다.
 */

const RANGE = { from: '2026-09-14', to: '2026-09-15' };
const GAME_ID = '20260915LGOB02026';

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const api = (fetchImpl: typeof fetch, over: Partial<Parameters<typeof createLiveApi>[0]> = {}) =>
  createLiveApi({ baseUrl: '/api', fetch: fetchImpl, ...over });

/** 끊길 때까지 응답하지 않는 fetch */
const hanging = () =>
  vi.fn<typeof fetch>().mockImplementation(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      }),
  );

describe('createLiveApi.games', () => {
  it('기간을 질의에 담아 부르고 GameSummary 목록을 돌려준다', async () => {
    const games = fixtureGameSummaries();
    const f = vi.fn<typeof fetch>().mockImplementation(async () => ok({ games }));
    await expect(api(f).games(RANGE)).resolves.toEqual(games);
    const url = new URL(String(f.mock.calls[0][0]), 'https://x');
    expect(url.pathname).toBe('/api/games');
    expect(url.searchParams.get('from')).toBe('2026-09-14');
    expect(url.searchParams.get('to')).toBe('2026-09-15');
  });

  it('baseUrl 끝의 빗금을 지운다', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => ok({ games: [] }));
    await api(f, { baseUrl: '/api//' }).games(RANGE);
    expect(String(f.mock.calls[0][0]).startsWith('/api/games?')).toBe(true);
  });

  it('목록 모양이 계약과 다르면 shape 오류다', async () => {
    const broken = fixtureGameSummaries().map((g) => ({ ...g, status: 'nope' }));
    const f = vi.fn<typeof fetch>().mockImplementation(async () => ok({ games: broken }));
    await expect(api(f).games(RANGE)).rejects.toMatchObject({ code: 'shape' });
  });

  it('games 키가 없으면 shape 오류다', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => ok({ nope: [] }));
    await expect(api(f).games(RANGE)).rejects.toMatchObject({ code: 'shape' });
  });

  it('JSON이 아니면 shape 오류다', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => new Response('<html>', { status: 200 }));
    await expect(api(f).games(RANGE)).rejects.toMatchObject({ code: 'shape' });
  });
});

describe('createLiveApi.game', () => {
  it('경기 id를 질의에 담아 부르고 LiveGame을 돌려준다', async () => {
    const game = fixtureLiveGame();
    const f = vi.fn<typeof fetch>().mockImplementation(async () => ok(game));
    await expect(api(f).game(GAME_ID)).resolves.toEqual(game);
    const url = new URL(String(f.mock.calls[0][0]), 'https://x');
    expect(url.pathname).toBe('/api/game');
    expect(url.searchParams.get('id')).toBe(GAME_ID);
  });

  it('타석 번호가 어긋난 응답은 shape 오류다', async () => {
    // isLiveGame이 no === i+1을 확인한다. 어긋나면 Situation id가 다른 타석을 연다
    const game = fixtureLiveGame();
    const broken = { ...game, plateAppearances: game.plateAppearances.map((pa) => ({ ...pa, no: pa.no + 1 })) };
    const f = vi.fn<typeof fetch>().mockImplementation(async () => ok(broken));
    await expect(api(f).game(GAME_ID)).rejects.toMatchObject({ code: 'shape' });
  });
});

describe('createLiveApi 오류', () => {
  it.each([
    [404, 'notFound'],
    [429, 'rate'],
    [500, 'upstream'],
    [502, 'upstream'],
    [504, 'upstream'],
  ])('HTTP %i → %s', async (status, code) => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => new Response('', { status }));
    await expect(api(f).game(GAME_ID)).rejects.toMatchObject({ code });
  });

  it('연결 자체가 실패하면 network 오류다', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(api(f).games(RANGE)).rejects.toMatchObject({ code: 'network' });
  });

  it('제한 시간을 넘으면 timeout 오류다', async () => {
    const f = hanging();
    await expect(api(f, { gamesTimeoutMs: 5 }).games(RANGE)).rejects.toMatchObject({ code: 'timeout' });
  });

  it('바깥 신호로 끊으면 cancelled 오류다', async () => {
    const f = hanging();
    const controller = new AbortController();
    const promise = api(f).games(RANGE, controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('이미 끊긴 신호면 부르지 않는다', async () => {
    const f = vi.fn<typeof fetch>();
    const controller = new AbortController();
    controller.abort();
    await expect(api(f).game(GAME_ID, controller.signal)).rejects.toMatchObject({ code: 'cancelled' });
    expect(f).not.toHaveBeenCalled();
  });

  it('재시도하지 않는다', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => new Response('', { status: 500 }));
    await expect(api(f).games(RANGE)).rejects.toThrow(LiveError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('LiveError는 code를 담는다', () => {
    const error = new LiveError('shape');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('LiveError');
    expect(error.code).toBe('shape');
  });
});
