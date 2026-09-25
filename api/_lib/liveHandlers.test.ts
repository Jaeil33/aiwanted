import { describe, expect, it, vi } from 'vitest';
import { isGameSummaryList, isLiveGame } from '../../src/live/validate';
import { fixtureNaverRelay, fixtureNaverSchedule } from '../../src/test/fixtures/naverRelay';
import { createGameCache } from './gameCache';
import { MAX_RANGE_DAYS, handleGame, handleGames } from './liveHandlers';
import { createRateLimiter } from './rateLimit';

/*
 * 서버 함수의 입구. 진짜 네트워크를 부르지 않는다 — fetch는 주입한다.
 */

const SCHEDULE = fixtureNaverSchedule();
const RELAY = fixtureNaverRelay();
/** 2026-09-15 잠실 LG-두산. fixtureNaverSchedule[1]이 진행 중 경기다 */
const GAME_ID = '20260915LGOB02026';
const NOW = Date.parse('2026-09-15T09:00:00Z');

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/** 일정·중계를 모두 돌려주는 가짜 네이버 */
function fakeNaver(over: { games?: unknown[]; relay?: unknown } = {}) {
  return vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/relay')) {
      return ok({ result: { textRelayData: over.relay ?? { inn: 2, textRelays: RELAY.textRelays } } });
    }
    return ok({ result: { games: over.games ?? SCHEDULE } });
  });
}

function deps(fetchImpl: ReturnType<typeof fakeNaver>, limit = 60) {
  return {
    fetch: fetchImpl as never,
    limiter: createRateLimiter({ limit, windowMs: 60_000, now: () => NOW }),
    cache: createGameCache({ now: () => NOW }),
    now: () => NOW,
  };
}

const get = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

describe('handleGames', () => {
  it('기간의 경기 목록을 계약대로 돌려준다', async () => {
    const res = await handleGames(get('https://x/api/games?from=2026-09-14&to=2026-09-15'), deps(fakeNaver()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { games: unknown };
    expect(isGameSummaryList(body.games)).toBe(true);
  });

  it('날짜 하나만 줘도 된다', async () => {
    const f = fakeNaver();
    const res = await handleGames(get('https://x/api/games?date=2026-09-15'), deps(f));
    expect(res.status).toBe(200);
    const url = new URL(String(f.mock.calls[0][0]));
    expect(url.searchParams.get('fromDate')).toBe('2026-09-15');
    expect(url.searchParams.get('toDate')).toBe('2026-09-15');
  });

  it('아무것도 안 주면 서울 기준 오늘이다', async () => {
    const f = fakeNaver();
    // NOW는 09-15 09:00Z = 서울 09-15 18:00
    await handleGames(get('https://x/api/games'), deps(f));
    expect(new URL(String(f.mock.calls[0][0])).searchParams.get('fromDate')).toBe('2026-09-15');
  });

  it('서울 날짜는 UTC와 다를 수 있다', async () => {
    const f = fakeNaver();
    const lateUtc = Date.parse('2026-09-15T16:00:00Z'); // 서울 09-16 01:00
    await handleGames(get('https://x/api/games'), {
      ...deps(f),
      now: () => lateUtc,
      cache: createGameCache({ now: () => lateUtc }),
    });
    expect(new URL(String(f.mock.calls[0][0])).searchParams.get('fromDate')).toBe('2026-09-16');
  });

  it('날짜 모양이 틀리면 400이다', async () => {
    for (const q of ['?date=2026/09/15', '?date=abc', '?from=2026-09-01', '?from=x&to=2026-09-02']) {
      const res = await handleGames(get(`https://x/api/games${q}`), deps(fakeNaver()));
      expect(res.status).toBe(400);
    }
  });

  it('끝이 시작보다 앞서면 400이다', async () => {
    const res = await handleGames(get('https://x/api/games?from=2026-09-15&to=2026-09-01'), deps(fakeNaver()));
    expect(res.status).toBe(400);
  });

  it(`기간이 ${MAX_RANGE_DAYS}일을 넘으면 400이다`, async () => {
    const res = await handleGames(get('https://x/api/games?from=2026-01-01&to=2026-09-15'), deps(fakeNaver()));
    expect(res.status).toBe(400);
    const okRes = await handleGames(get('https://x/api/games?from=2026-09-01&to=2026-09-30'), deps(fakeNaver()));
    expect(okRes.status).toBe(200);
  });

  it('CDN 캐시 헤더를 붙인다', async () => {
    const res = await handleGames(get('https://x/api/games?date=2026-09-15'), deps(fakeNaver()));
    expect(res.headers.get('cache-control')).toContain('s-maxage=60');
  });

  it('요청 제한을 넘으면 429에 retry-after를 붙인다', async () => {
    const d = deps(fakeNaver(), 1);
    const headers = { 'x-forwarded-for': '1.2.3.4' };
    await handleGames(get('https://x/api/games?date=2026-09-15', headers), d);
    const res = await handleGames(get('https://x/api/games?date=2026-09-15', headers), d);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });

  it('업스트림이 죽으면 502, 느리면 504다', async () => {
    const dead = vi.fn(async () => new Response('', { status: 500 }));
    expect((await handleGames(get('https://x/api/games?date=2026-09-15'), deps(dead as never))).status).toBe(502);
    const slow = vi.fn(async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    expect((await handleGames(get('https://x/api/games?date=2026-09-15'), deps(slow as never))).status).toBe(504);
  });
});

describe('handleGame', () => {
  it('계약을 지키는 LiveGame을 돌려준다', async () => {
    const res = await handleGame(get(`https://x/api/game?id=${GAME_ID}`), deps(fakeNaver()));
    expect(res.status).toBe(200);
    expect(isLiveGame(await res.json())).toBe(true);
  });

  it('경기 id 모양이 틀리면 400이다', async () => {
    for (const id of ['', 'abc', '20260915LGOB', '20260915lgob02026']) {
      const res = await handleGame(get(`https://x/api/game?id=${id}`), deps(fakeNaver()));
      expect(res.status).toBe(400);
    }
  });

  it('그 날짜 일정에 없는 경기면 404다', async () => {
    const res = await handleGame(get('https://x/api/game?id=20260915HTSK02026'), deps(fakeNaver({ games: [] })));
    expect(res.status).toBe(404);
  });

  it('경기 전이면 중계를 아예 부르지 않는다', async () => {
    const f = fakeNaver({ games: [{ ...SCHEDULE[0], gameId: GAME_ID }] });
    const res = await handleGame(get(`https://x/api/game?id=${GAME_ID}`), deps(f));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plateAppearances: unknown[]; current: unknown };
    expect(body.plateAppearances).toEqual([]);
    expect(body.current).toBeNull();
    expect(f.mock.calls.every((c) => !String(c[0]).includes('/relay'))).toBe(true);
  });

  it('취소된 경기도 중계를 부르지 않는다', async () => {
    const cancelled = { ...SCHEDULE[3], gameId: GAME_ID };
    const f = fakeNaver({ games: [cancelled] });
    await handleGame(get(`https://x/api/game?id=${GAME_ID}`), deps(f));
    expect(f.mock.calls.every((c) => !String(c[0]).includes('/relay'))).toBe(true);
  });

  it('이닝 없이 한 번 부른 뒤 앞 이닝을 채운다', async () => {
    const f = fakeNaver();
    await handleGame(get(`https://x/api/game?id=${GAME_ID}`), deps(f));
    const relayCalls = f.mock.calls.map((c) => new URL(String(c[0]))).filter((u) => u.pathname.endsWith('/relay'));
    expect(relayCalls[0].searchParams.has('inning')).toBe(false);
    // inn이 2이므로 1이닝을 더 부른다
    expect(relayCalls.map((u) => u.searchParams.get('inning'))).toContain('1');
  });

  it('상태마다 캐시 헤더가 다르다', async () => {
    const live = await handleGame(get(`https://x/api/game?id=${GAME_ID}`), deps(fakeNaver()));
    expect(live.headers.get('cache-control')).toContain('s-maxage=5');

    const finalGame = { ...SCHEDULE[2], gameId: GAME_ID };
    const done = await handleGame(get(`https://x/api/game?id=${GAME_ID}`), deps(fakeNaver({ games: [finalGame] })));
    expect(done.headers.get('cache-control')).toContain('s-maxage=86400');

    const before = await handleGame(get(`https://x/api/game?id=${GAME_ID}`), deps(fakeNaver({ games: [{ ...SCHEDULE[0], gameId: GAME_ID }] })));
    expect(before.headers.get('cache-control')).toContain('s-maxage=60');
  });

  it('오류 응답은 캐시하지 않는다', async () => {
    const dead = vi.fn(async () => new Response('', { status: 500 }));
    const res = await handleGame(get(`https://x/api/game?id=${GAME_ID}`), deps(dead as never));
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('업스트림 오류를 상태로 옮긴다', async () => {
    const slow = vi.fn(async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    expect((await handleGame(get(`https://x/api/game?id=${GAME_ID}`), deps(slow as never))).status).toBe(504);

    const junk = vi.fn(async () => ok({ nope: true }));
    expect((await handleGame(get(`https://x/api/game?id=${GAME_ID}`), deps(junk as never))).status).toBe(502);
  });

  it('같은 경기를 동시에 물어도 네이버 중계는 한 번씩만 부른다', async () => {
    const f = fakeNaver();
    const d = deps(f);
    await Promise.all([
      handleGame(get(`https://x/api/game?id=${GAME_ID}`), d),
      handleGame(get(`https://x/api/game?id=${GAME_ID}`), d),
      handleGame(get(`https://x/api/game?id=${GAME_ID}`), d),
    ]);
    const relayCalls = f.mock.calls.filter((c) => String(c[0]).includes('/relay'));
    // 이닝 없이 1번 + 1이닝 1번
    expect(relayCalls).toHaveLength(2);
  });

  it('요청 제한을 넘으면 429다', async () => {
    const d = deps(fakeNaver(), 1);
    const headers = { 'x-forwarded-for': '5.6.7.8' };
    await handleGame(get(`https://x/api/game?id=${GAME_ID}`, headers), d);
    const res = await handleGame(get(`https://x/api/game?id=${GAME_ID}`, headers), d);
    expect(res.status).toBe(429);
  });

  it('네이버 원문을 그대로 돌려주지 않는다', async () => {
    // ADR-017: 요약만 넘긴다. 원문 키가 새어 나오면 안 된다
    const res = await handleGame(get(`https://x/api/game?id=${GAME_ID}`), deps(fakeNaver()));
    const text = await res.text();
    expect(text).not.toContain('textOptions');
    expect(text).not.toContain('ptsOptions');
    expect(text).not.toContain('currentPlayersInfo');
  });
});
