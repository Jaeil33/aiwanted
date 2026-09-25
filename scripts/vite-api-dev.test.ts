import { describe, expect, it, vi } from 'vitest';
import { apiDevPlugin, apiNameOf, toWebRequest, writeWebResponse } from './vite-api-dev';

/*
 * npm run dev에서 /api를 함께 띄우는 미들웨어. 변환 함수만 따로 검사한다(네트워크·Vite 서버 없음).
 */

describe('apiNameOf', () => {
  it('/api/<이름>에서 이름을 읽는다', () => {
    expect(apiNameOf('/api/games')).toBe('games');
    expect(apiNameOf('/api/games?from=2026-09-01&to=2026-09-30')).toBe('games');
    expect(apiNameOf('/api/game/')).toBe('game');
    expect(apiNameOf('/api/interpret')).toBe('interpret');
  });

  it('/api 밖이거나 이름이 이상하면 null', () => {
    for (const url of ['/', '/index.html', '/api', '/api/', '/apigames', '/api/a/b', '/api/../secret', '/api/games.ts']) {
      expect(apiNameOf(url)).toBeNull();
    }
  });
});

describe('toWebRequest', () => {
  it('메서드·주소·헤더를 옮긴다', () => {
    const request = toWebRequest(
      { method: 'GET', url: '/api/games?date=2026-09-15', headers: { 'x-forwarded-for': '1.2.3.4', accept: 'application/json' } },
      null,
      'http://localhost:5173',
    );
    expect(request.method).toBe('GET');
    expect(new URL(request.url).pathname).toBe('/api/games');
    expect(new URL(request.url).searchParams.get('date')).toBe('2026-09-15');
    expect(request.headers.get('x-forwarded-for')).toBe('1.2.3.4');
  });

  it('POST 본문을 그대로 넘긴다', async () => {
    const request = toWebRequest(
      { method: 'POST', url: '/api/interpret', headers: { 'content-type': 'application/json' } },
      '{"text":"비가 온다"}',
      'http://localhost:5173',
    );
    expect(request.method).toBe('POST');
    await expect(request.json()).resolves.toEqual({ text: '비가 온다' });
  });

  it('GET에는 본문을 넣지 않는다', () => {
    const request = toWebRequest({ method: 'GET', url: '/api/games', headers: {} }, '버려질 본문', 'http://localhost:5173');
    expect(request.body).toBeNull();
  });

  it('홉 단위 헤더는 옮기지 않는다', () => {
    // connection·transfer-encoding을 그대로 옮기면 undici가 요청을 거부한다
    const request = toWebRequest(
      { method: 'GET', url: '/api/games', headers: { connection: 'keep-alive', 'transfer-encoding': 'chunked', host: 'localhost:5173' } },
      null,
      'http://localhost:5173',
    );
    expect(request.headers.get('connection')).toBeNull();
    expect(request.headers.get('transfer-encoding')).toBeNull();
  });

  it('여러 번 온 헤더를 합친다', () => {
    const request = toWebRequest(
      { method: 'GET', url: '/api/games', headers: { 'x-forwarded-for': ['1.1.1.1', '2.2.2.2'] } },
      null,
      'http://localhost:5173',
    );
    expect(request.headers.get('x-forwarded-for')).toBe('1.1.1.1, 2.2.2.2');
  });
});

describe('writeWebResponse', () => {
  const fakeRes = () => ({ statusCode: 0, headers: {} as Record<string, string>, body: '', setHeader(n: string, v: string) { this.headers[n] = v; }, end(chunk?: Uint8Array | string) { this.body = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk); } });

  it('상태·헤더·본문을 옮긴다', async () => {
    const res = fakeRes();
    await writeWebResponse(
      res,
      new Response(JSON.stringify({ games: [] }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/json');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(res.body)).toEqual({ games: [] });
  });

  it('한글 본문이 깨지지 않는다', async () => {
    const res = fakeRes();
    await writeWebResponse(res, new Response(JSON.stringify({ error: '경기를 찾지 못했어요' }), { status: 404 }));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: '경기를 찾지 못했어요' });
  });
});

describe('apiDevPlugin', () => {
  it('개발 서버에만 붙는다', () => {
    const plugin = apiDevPlugin();
    expect(plugin.name).toBe('tmi-api-dev');
    expect(plugin.apply).toBe('serve');
  });

  it('/api 밖 요청은 다음 미들웨어로 넘긴다', () => {
    const plugin = apiDevPlugin();
    const use = vi.fn();
    const configureServer = plugin.configureServer;
    if (typeof configureServer !== 'function') throw new Error('configureServer가 함수가 아니다');
    configureServer.call({} as never, { middlewares: { use }, config: { root: '.' } } as never);
    const handler = use.mock.calls[0][0] as (req: unknown, res: unknown, next: () => void) => void;
    const next = vi.fn();
    handler({ url: '/index.html', method: 'GET', headers: {} }, {}, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
