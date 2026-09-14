// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureContext } from '../src/ai/test-helpers';
import { POST } from './interpret';

/* 가짜 전역 fetch만 쓴다. 실제 Anthropic API를 부르지 않는다. */

const KEY = 'sk-ant-api03-ENTRY-INTERPRET-KEY';
const body = JSON.stringify({ text: '오늘 기온 35도, 폭염', ctx: fixtureContext(), measuredAvailable: true });
const post = (ip: string) =>
  new Request('https://tmi.example/api/interpret', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('POST /api/interpret', () => {
  it('process.env에 키가 없으면 503이고 전역 fetch를 부르지 않는다', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await POST(post('192.0.2.1'));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'ai_unconfigured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('process.env의 키·모델과 전역 fetch로 Anthropic을 부르고 응답에 키를 싣지 않는다', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', KEY);
    vi.stubEnv('TMI_MODEL_INTERPRET', 'claude-haiku-4-5');
    const raw = { refused: false, reason: '', comment: '더위에 공이 뜨네요', parts: [] };
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-haiku-4-5', content: [{ type: 'text', text: JSON.stringify(raw) }], stop_reason: 'end_turn' }),
        { status: 200 },
      ));
    vi.stubGlobal('fetch', fetchSpy);
    const res = await POST(post('192.0.2.2'));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(JSON.parse(text)).toEqual({ raw });
    expect(text).not.toContain(KEY);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
    expect(init?.headers).toMatchObject({ 'x-api-key': KEY });
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'claude-haiku-4-5', max_tokens: 700 });
  });
});
