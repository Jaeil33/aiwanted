// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isGameSummaryList } from '../src/live/validate';
import { fixtureNaverSchedule } from '../src/test/fixtures/naverRelay';
import { GET } from './games';

/* 가짜 전역 fetch만 쓴다. 실제 네이버를 부르지 않는다. */

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const req = (query: string, ip: string) =>
  new Request(`https://tmi.example/api/games${query}`, { headers: { 'x-forwarded-for': ip } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/games', () => {
  it('전역 fetch로 네이버를 부르고 GameSummary 목록을 돌려준다', async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockImplementation(async () => ok({ result: { games: fixtureNaverSchedule() } }));
    vi.stubGlobal('fetch', fetchSpy);
    const res = await GET(req('?date=2026-09-15', '192.0.2.10'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { games: unknown };
    expect(isGameSummaryList(body.games)).toBe(true);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('api-gw.sports.naver.com');
  });

  it('날짜 모양이 틀리면 400이고 네이버를 부르지 않는다', async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await GET(req('?date=nope', '192.0.2.11'));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('업스트림이 죽으면 502다', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async () => new Response('', { status: 503 })));
    const res = await GET(req('?date=2026-09-15', '192.0.2.12'));
    expect(res.status).toBe(502);
  });
});
