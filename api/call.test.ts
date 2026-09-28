// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureCallFacts } from '../src/ai/test-helpers';
import { POST } from './call';

/* 가짜 전역 fetch만 쓴다. 실제 Anthropic API를 부르지 않는다. */

const KEY = 'sk-ant-api03-ENTRY-CALL-KEY';
const body = JSON.stringify({ facts: fixtureCallFacts() });
const post = (ip: string) =>
  new Request('https://tmi.example/api/call', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('POST /api/call', () => {
  it('process.env에 키가 없으면 503이고 전역 fetch를 부르지 않는다', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await POST(post('192.0.2.21'));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'ai_unconfigured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('process.env의 키·모델과 전역 fetch로 Anthropic을 부르고 응답에 키를 싣지 않는다', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', KEY);
    vi.stubEnv('TMI_MODEL_CALL', 'claude-haiku-4-5');
    const raw = { line: '어제 피자를 먹은 김타자, 2타점 적시 2루타를 쳐냅니다!' };
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-haiku-4-5', content: [{ type: 'text', text: JSON.stringify(raw) }], stop_reason: 'end_turn' }),
        { status: 200 },
      ));
    vi.stubGlobal('fetch', fetchSpy);
    const res = await POST(post('192.0.2.22'));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ raw });
    expect(text).not.toContain(KEY);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
    expect(init?.headers).toMatchObject({ 'x-api-key': KEY });
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'claude-haiku-4-5', max_tokens: 300 });
    // 자막에는 도구가 없다
    expect(JSON.parse(String(init?.body)).tools).toBeUndefined();
  });

  it('자막은 분당 20회까지 받는다 (타석마다 저절로 나므로 해석·판정보다 넉넉하다)', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', KEY);
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-haiku-4-5', content: [{ type: 'text', text: '{"line":"자막 한 줄"}' }], stop_reason: 'end_turn' }),
        { status: 200 },
      ));
    vi.stubGlobal('fetch', fetchSpy);
    for (let i = 0; i < 20; i++) expect((await POST(post('192.0.2.23'))).status).toBe(200);
    expect((await POST(post('192.0.2.23'))).status).toBe(429);
  });
});
