// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ruleInterpret } from '../src/ai/rules';
import { fixtureContext, fixtureEvidence } from '../src/ai/test-helpers';
import { POST } from './verdict';

/* 가짜 전역 fetch만 쓴다. 실제 Anthropic API를 부르지 않는다. */

const KEY = 'sk-ant-api03-ENTRY-VERDICT-KEY';
const ctx = fixtureContext();
const TEXT = '오늘 34도 폭염';
const body = JSON.stringify({ text: TEXT, interpretation: ruleInterpret(TEXT, ctx, { measuredAvailable: true }), ctx, evidence: fixtureEvidence() });
const post = (ip: string) =>
  new Request('https://tmi.example/api/verdict', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('POST /api/verdict', () => {
  it('process.env에 키가 없으면 503이고 전역 fetch를 부르지 않는다', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await POST(post('192.0.2.11'));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'ai_unconfigured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('process.env의 키·모델과 전역 fetch로 판정 도구와 함께 Anthropic을 부르고 응답에 키를 싣지 않는다', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', KEY);
    vi.stubEnv('TMI_MODEL_VERDICT', 'claude-sonnet-4-6');
    const raw = { variables: ['temp_c'], verdict: 'maybe', headline: '애매해요', body: '기록표 기준으로 확실하지 않아요.' };
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', content: [{ type: 'text', text: JSON.stringify(raw) }], stop_reason: 'end_turn' }),
        { status: 200 },
      ));
    vi.stubGlobal('fetch', fetchSpy);
    const res = await POST(post('192.0.2.12'));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ raw });
    expect(text).not.toContain(KEY);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
    expect(init?.headers).toMatchObject({ 'x-api-key': KEY });
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'claude-sonnet-4-6', max_tokens: 900, tools: [{ name: 'lookupEvidence' }] });
  });
});
