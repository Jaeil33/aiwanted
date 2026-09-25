// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLiveGame } from '../src/live/validate';
import { fixtureNaverRelay, fixtureNaverSchedule } from '../src/test/fixtures/naverRelay';
import { GET } from './game';

/* 가짜 전역 fetch만 쓴다. 실제 네이버를 부르지 않는다. */

const GAME_ID = '20260915LGOB02026';

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

function fakeNaver() {
  const relays = fixtureNaverRelay().textRelays;
  return vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/relay')) return ok({ result: { textRelayData: { inn: 2, textRelays: relays } } });
    return ok({ result: { games: fixtureNaverSchedule() } });
  });
}

const req = (query: string, ip: string) =>
  new Request(`https://tmi.example/api/game${query}`, { headers: { 'x-forwarded-for': ip } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/game', () => {
  it('전역 fetch로 네이버를 부르고 LiveGame을 돌려준다', async () => {
    vi.stubGlobal('fetch', fakeNaver());
    const res = await GET(req(`?id=${GAME_ID}`, '192.0.2.20'));
    expect(res.status).toBe(200);
    expect(isLiveGame(await res.json())).toBe(true);
  });

  it('경기 id가 틀리면 400이고 네이버를 부르지 않는다', async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await GET(req('?id=nope', '192.0.2.21'));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('네이버 원문을 그대로 돌려주지 않는다', async () => {
    vi.stubGlobal('fetch', fakeNaver());
    const res = await GET(req(`?id=${GAME_ID}`, '192.0.2.22'));
    const text = await res.text();
    expect(text).not.toContain('textOptions');
    expect(text).not.toContain('ptsOptions');
  });
});
