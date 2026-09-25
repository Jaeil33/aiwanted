import { describe, expect, it, vi } from 'vitest';
import { NAVER_TIMEOUT_MS, NaverError, fetchRelay, fetchSchedule, scheduleUrl } from './naver';

/*
 * 네이버 호출은 주입한 fetch로만 한다. 여기 테스트는 진짜 네트워크를 부르지 않는다.
 */

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const deps = (fetchImpl: typeof fetch) => ({ fetch: fetchImpl });

describe('scheduleUrl', () => {
  it('기간과 KBO 분류를 담는다', () => {
    const url = new URL(scheduleUrl('2026-09-01', '2026-09-30'));
    expect(url.host).toBe('api-gw.sports.naver.com');
    expect(url.searchParams.get('fromDate')).toBe('2026-09-01');
    expect(url.searchParams.get('toDate')).toBe('2026-09-30');
    expect(url.searchParams.get('categoryId')).toBe('kbo');
    expect(url.searchParams.get('upperCategoryId')).toBe('kbaseball');
    // fields에 stadium이 빠지면 구장이 빈 문자열로 온다
    expect(url.searchParams.get('fields')).toContain('stadium');
    // size를 안 주면 10경기만 온다: 한 달 달력이 이틀치만 차는 버그가 났다(2026-09-26)
    expect(Number(url.searchParams.get('size'))).toBeGreaterThanOrEqual(155);
  });
});

describe('fetchSchedule', () => {
  it('result.games를 돌려준다', async () => {
    const games = [{ gameId: '20260915LGOB02026' }];
    const f = vi.fn<typeof fetch>().mockImplementation(async () => ok({ result: { games } }));
    await expect(fetchSchedule(deps(f as never), { from: '2026-09-15', to: '2026-09-15' })).resolves.toEqual(games);
  });

  it('브라우저 User-Agent를 보내고 Origin·Referer는 보내지 않는다', async () => {
    // 외부 Origin이 붙으면 네이버가 403을 준다(ADR-017)
    const f = vi.fn<typeof fetch>().mockImplementation(async () => ok({ result: { games: [] } }));
    await fetchSchedule(deps(f as never), { from: '2026-09-15', to: '2026-09-15' });
    const init = f.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['user-agent']).toMatch(/Mozilla/);
    expect(headers.accept).toBe('application/json');
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('origin');
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('referer');
  });

  it('제한 시간을 걸고 중단 신호를 넘긴다', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => ok({ result: { games: [] } }));
    await fetchSchedule(deps(f as never), { from: '2026-09-15', to: '2026-09-15' });
    expect((f.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
    expect(NAVER_TIMEOUT_MS).toBe(8000);
  });

  it('2xx가 아니면 upstream 오류에 상태를 담는다', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => new Response('nope', { status: 403 }));
    await expect(fetchSchedule(deps(f as never), { from: '2026-09-15', to: '2026-09-15' }))
      .rejects.toMatchObject({ code: 'upstream', status: 403 });
  });

  it('모양이 틀리면 shape 오류다', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => ok({ result: {} }));
    await expect(fetchSchedule(deps(f as never), { from: '2026-09-15', to: '2026-09-15' }))
      .rejects.toMatchObject({ code: 'shape' });
  });

  it('JSON이 아니면 shape 오류다', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => new Response('<html>', { status: 200 }));
    await expect(fetchSchedule(deps(f as never), { from: '2026-09-15', to: '2026-09-15' }))
      .rejects.toMatchObject({ code: 'shape' });
  });

  it('중단되면 timeout 오류다', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    await expect(fetchSchedule(deps(f as never), { from: '2026-09-15', to: '2026-09-15' }))
      .rejects.toMatchObject({ code: 'timeout' });
  });

  it('연결 자체가 실패하면 상태 없는 upstream 오류다', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(fetchSchedule(deps(f as never), { from: '2026-09-15', to: '2026-09-15' }))
      .rejects.toMatchObject({ code: 'upstream', status: null });
  });

  it('재시도하지 않는다', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => new Response('', { status: 500 }));
    await expect(fetchSchedule(deps(f as never), { from: '2026-09-15', to: '2026-09-15' })).rejects.toThrow(NaverError);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('fetchRelay', () => {
  it('경기 id로 부르고 textRelayData를 돌려준다', async () => {
    const data = { inn: 5, textRelays: [] };
    const f = vi.fn<typeof fetch>().mockImplementation(async () => ok({ result: { textRelayData: data } }));
    await expect(fetchRelay(deps(f as never), '20260915LGOB02026')).resolves.toEqual(data);
    expect(String(f.mock.calls[0][0])).toContain('/schedule/games/20260915LGOB02026/relay');
  });

  it('이닝을 주면 질의에 담는다', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => ok({ result: { textRelayData: { inn: 3 } } }));
    await fetchRelay(deps(f as never), '20260915LGOB02026', 3);
    expect(new URL(String(f.mock.calls[0][0])).searchParams.get('inning')).toBe('3');
  });

  it('이닝을 안 주면 질의에 담지 않는다', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => ok({ result: { textRelayData: { inn: 3 } } }));
    await fetchRelay(deps(f as never), '20260915LGOB02026');
    expect(new URL(String(f.mock.calls[0][0])).searchParams.has('inning')).toBe(false);
  });

  it('경기 전이면 null을 돌려준다 (오류가 아니다)', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => ok({ result: { textRelayData: null } }));
    await expect(fetchRelay(deps(f as never), '20260915LGOB02026')).resolves.toBeNull();
  });

  it('result가 없으면 shape 오류다', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => ok({}));
    await expect(fetchRelay(deps(f as never), '20260915LGOB02026')).rejects.toMatchObject({ code: 'shape' });
  });
});
