// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { AiHttpError, ANTHROPIC_MESSAGES_URL, callMessages, extractJson, firstText, runToolLoop } from './anthropic';
import type { MessagesArgs, MessagesResponse, ToolDef } from './anthropic';

const KEY = 'sk-ant-test-0000-SECRET';

interface Call {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}
type Reply = () => Response | Promise<Response>;

/** 순서대로 답하는 가짜 fetch(마지막 답을 반복). 요청 본문은 보낸 순간의 JSON으로 기록한다. 실제 네트워크는 쓰지 않는다 */
function fakeFetch(...replies: Reply[]) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {}, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return replies[Math.min(calls.length, replies.length) - 1]();
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const message = (content: unknown[], stopReason = 'end_turn'): Reply => () =>
  new Response(
    JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-test', content, stop_reason: stopReason, usage: { input_tokens: 10, output_tokens: 5 } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
const status = (code: number): Reply => () => new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'nope' } }), { status: code });

const args = (over: Partial<MessagesArgs> = {}): MessagesArgs => ({
  apiKey: KEY,
  model: 'claude-test',
  messages: [{ role: 'user', content: '프롬프트' }],
  maxTokens: 700,
  ...over,
});

const errorOf = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

const lookupDef: ToolDef = {
  name: 'lookupEvidence',
  description: '조회',
  input_schema: { type: 'object', properties: { variable: { type: 'string' } }, required: ['variable'] },
};

describe('callMessages', () => {
  it('Messages API로 POST하고 헤더(x-api-key·anthropic-version·content-type)와 본문 모양을 지킨다', async () => {
    const { fetchImpl, calls } = fakeFetch(message([{ type: 'text', text: '안녕' }]));
    const res = await callMessages(args({ system: '시스템', tools: [lookupDef], thinking: { type: 'disabled' } }), fetchImpl);
    expect(res.content).toEqual([{ type: 'text', text: '안녕' }]);
    expect(res.stop_reason).toBe('end_turn');
    expect(calls).toHaveLength(1);
    expect(ANTHROPIC_MESSAGES_URL).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toEqual({ 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' });
    expect(calls[0].body).toEqual({
      model: 'claude-test',
      max_tokens: 700,
      system: '시스템',
      messages: [{ role: 'user', content: '프롬프트' }],
      tools: [lookupDef],
      thinking: { type: 'disabled' },
    });
  });

  it('system·tools·thinking이 없으면 본문에 넣지 않는다', async () => {
    const { fetchImpl, calls } = fakeFetch(message([{ type: 'text', text: '안녕' }]));
    await callMessages(args({ tools: [] }), fetchImpl);
    expect(calls[0].body).toEqual({ model: 'claude-test', max_tokens: 700, messages: [{ role: 'user', content: '프롬프트' }] });
  });

  const STATUS: Array<[number, string]> = [
    [429, 'rate_limited'],
    [500, 'upstream'],
    [529, 'upstream'],
    [400, 'bad_request'],
    [401, 'bad_request'],
    [404, 'bad_request'],
  ];

  it.each(STATUS)('HTTP %i → AiHttpError %s (메시지에 키 없음)', async (code, expected) => {
    const { fetchImpl } = fakeFetch(status(code));
    const error = await errorOf(callMessages(args(), fetchImpl));
    expect(error).toBeInstanceOf(AiHttpError);
    expect(error).toMatchObject({ code: expected, status: code });
    expect((error as Error).message).not.toContain(KEY);
  });

  it('네트워크 오류 → upstream', async () => {
    const { fetchImpl } = fakeFetch(() => Promise.reject(new TypeError(`fetch failed for ${KEY}`)));
    const error = await errorOf(callMessages(args(), fetchImpl));
    expect(error).toBeInstanceOf(AiHttpError);
    expect(error).toMatchObject({ code: 'upstream', status: null });
    expect((error as Error).message).not.toContain(KEY);
  });

  it('200인데 JSON이 아니거나 content가 없으면 bad_response', async () => {
    for (const reply of [() => new Response('<html>oops</html>', { status: 200 }), () => new Response(JSON.stringify({ id: 'x' }), { status: 200 })]) {
      const { fetchImpl } = fakeFetch(reply);
      expect(await errorOf(callMessages(args(), fetchImpl))).toMatchObject({ code: 'bad_response' });
    }
  });
});

  it('workspaceId를 주면 anthropic-workspace-id 헤더를 붙이고, 없으면 붙이지 않는다', async () => {
    const withId = fakeFetch(message([{ type: 'text', text: '안녕' }]));
    await callMessages(args({ workspaceId: 'wrkspc_test' }), withId.fetchImpl);
    expect(withId.calls[0].init.headers).toEqual({
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-workspace-id': 'wrkspc_test',
    });

    const without = fakeFetch(message([{ type: 'text', text: '안녕' }]));
    await callMessages(args({}), without.fetchImpl);
    expect(without.calls[0].init.headers).not.toHaveProperty('anthropic-workspace-id');
  });

describe('firstText', () => {
  const base = { id: 'msg', model: 'claude-test', role: 'assistant' as const, stop_reason: 'end_turn' };

  it('첫 text 블록의 글, 없으면 빈 문자열', () => {
    const res: MessagesResponse = {
      ...base,
      content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: '첫째' }, { type: 'text', text: '둘째' }],
    };
    expect(firstText(res)).toBe('첫째');
    expect(firstText({ ...base, content: [{ type: 'tool_use', id: 'toolu_1', name: 'lookupEvidence', input: {} }] })).toBe('');
    expect(firstText({ ...base, content: [] })).toBe('');
  });
});

describe('extractJson', () => {
  it('JSON 한 덩어리는 그대로 읽는다', () => {
    expect(extractJson('{"a":1,"b":[1,2]}')).toEqual({ a: 1, b: [1, 2] });
  });

  it('코드펜스를 벗긴다', () => {
    expect(extractJson('```json\n{"refused":false,"parts":[]}\n```')).toEqual({ refused: false, parts: [] });
    expect(extractJson('결과예요.\n```\n{"ok":true}\n```\n참고하세요 {괄호}')).toEqual({ ok: true });
  });

  it('앞뒤 잡담을 무시하고 첫 {부터 짝이 맞는 }까지 읽는다 (문자열 안의 괄호·이스케이프 포함)', () => {
    expect(extractJson('해석 결과입니다: {"comment":"괄호 } 와 \\"따옴표\\"","parts":[{"kind":"knob"}]} 이상입니다 {"x":2}')).toEqual({
      comment: '괄호 } 와 "따옴표"',
      parts: [{ kind: 'knob' }],
    });
  });

  it.each(['', 'JSON이 없어요', '{"a":', '{"a": 1', '[1,2,3]', '```json\n{"a":\n```'])('JSON 객체가 없거나 깨지면 bad_response: %j', (text) => {
    let error: unknown = null;
    try {
      extractJson(text);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AiHttpError);
    expect(error).toMatchObject({ code: 'bad_response' });
  });
});

describe('runToolLoop', () => {
  it('tool_use면 도구를 실행해 tool_result로 붙여 다시 부르고, 두 번째 응답의 텍스트를 돌려준다', async () => {
    const firstContent = [
      { type: 'text', text: '기록을 찾아볼게요.' },
      { type: 'tool_use', id: 'toolu_01', name: 'lookupEvidence', input: { variable: 'temp_c' } },
    ];
    const { fetchImpl, calls } = fakeFetch(message(firstContent, 'tool_use'), message([{ type: 'text', text: '{"verdict":"maybe"}' }]));
    const execute = vi.fn((input: unknown) => ({ looked: input }));
    const text = await runToolLoop(args({ maxTokens: 900 }), [{ def: lookupDef, execute }], fetchImpl);
    expect(text).toBe('{"verdict":"maybe"}');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ variable: 'temp_c' });
    expect(calls).toHaveLength(2);
    for (const call of calls) expect(call.body).toMatchObject({ model: 'claude-test', max_tokens: 900, tools: [lookupDef] });
    expect(calls[0].body.messages).toEqual([{ role: 'user', content: '프롬프트' }]);
    expect(calls[1].body.messages).toEqual([
      { role: 'user', content: '프롬프트' },
      { role: 'assistant', content: firstContent },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01', content: JSON.stringify({ looked: { variable: 'temp_c' } }) }] },
    ]);
  });

  it('한 응답의 도구 호출은 한 user 메시지에 모으고, 모르는 도구·실패한 도구는 is_error로 알린다', async () => {
    const content = [
      { type: 'tool_use', id: 'toolu_a', name: 'lookupEvidence', input: { variable: 'temp_c' } },
      { type: 'tool_use', id: 'toolu_b', name: 'teleport', input: {} },
      { type: 'tool_use', id: 'toolu_c', name: 'lookupEvidence', input: { variable: 'boom' } },
    ];
    const { fetchImpl, calls } = fakeFetch(message(content, 'tool_use'), message([{ type: 'text', text: '끝' }]));
    const execute = (input: unknown) => {
      if ((input as { variable?: string }).variable === 'boom') throw new Error('boom');
      return 'plain text result';
    };
    await expect(runToolLoop(args(), [{ def: lookupDef, execute }], fetchImpl)).resolves.toBe('끝');
    const messages = calls[1].body.messages as Array<{ role: string; content: unknown }>;
    expect(messages).toHaveLength(3);
    expect(messages[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'toolu_a', content: 'plain text result' },
        { type: 'tool_result', tool_use_id: 'toolu_b', content: expect.stringContaining('error'), is_error: true },
        { type: 'tool_result', tool_use_id: 'toolu_c', content: expect.stringContaining('error'), is_error: true },
      ],
    });
  });

  it('도구 호출이 maxRounds(기본 4)를 넘으면 bad_response', async () => {
    const loop = message([{ type: 'tool_use', id: 'toolu_x', name: 'lookupEvidence', input: { variable: 'temp_c' } }], 'tool_use');
    const two = fakeFetch(loop);
    const error = await errorOf(runToolLoop(args(), [{ def: lookupDef, execute: () => ({}) }], two.fetchImpl, 2));
    expect(error).toBeInstanceOf(AiHttpError);
    expect(error).toMatchObject({ code: 'bad_response' });
    expect(two.calls).toHaveLength(2);

    const four = fakeFetch(loop);
    expect(await errorOf(runToolLoop(args(), [{ def: lookupDef, execute: () => ({}) }], four.fetchImpl))).toMatchObject({ code: 'bad_response' });
    expect(four.calls).toHaveLength(4);
  });

  it('refusal이면 refused, 업스트림 오류는 그대로 던진다', async () => {
    const refusal = fakeFetch(message([], 'refusal'));
    expect(await errorOf(runToolLoop(args(), [{ def: lookupDef, execute: () => ({}) }], refusal.fetchImpl))).toMatchObject({ code: 'refused' });
    const limited = fakeFetch(status(429));
    expect(await errorOf(runToolLoop(args(), [{ def: lookupDef, execute: () => ({}) }], limited.fetchImpl))).toMatchObject({ code: 'rate_limited' });
  });
});
