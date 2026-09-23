/*
 * Anthropic Messages API 클라이언트(서버리스 함수 전용). ADR-007에 따라 SDK 없이 fetch로 부른다.
 * API 키는 호출하는 쪽이 환경변수에서 읽어 넘긴다. 오류 메시지에는 키·요청 원문·응답 본문을 넣지 않는다.
 * 코드에서 재시도하지 않는다(ADR-006).
 */

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';

export type AiHttpErrorCode = 'rate_limited' | 'upstream' | 'bad_request' | 'bad_response' | 'refused';

export class AiHttpError extends Error {
  readonly code: AiHttpErrorCode;
  /** 업스트림 HTTP 상태. 응답을 받지 못했으면 null */
  readonly status: number | null;

  constructor(code: AiHttpErrorCode, message: string = code, status: number | null = null) {
    super(message);
    this.name = 'AiHttpError';
    this.code = code;
    this.status = status;
  }
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/** 응답 content 블록. thinking 같은 다른 블록은 읽지 않고 도구 루프에서 그대로 되돌려 보낸다 */
export type ContentBlock = TextBlock | ToolUseBlock | { type: string; [key: string]: unknown };

export interface Message {
  role: 'user' | 'assistant';
  content: string | Array<ContentBlock | ToolResultBlock>;
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
}

export interface MessagesResponse {
  id: string;
  model: string;
  role: 'assistant';
  content: ContentBlock[];
  stop_reason: string | null;
  usage?: Record<string, unknown>;
}

export interface MessagesArgs {
  apiKey: string;
  model: string;
  system?: string;
  messages: Message[];
  tools?: ToolDef[];
  maxTokens: number;
  /** 생략하면 모델 기본값. thinking 토큰도 max_tokens에 들어가므로 짧은 JSON 답에서는 끈다 */
  thinking?: { type: 'disabled' } | { type: 'adaptive' };
  /*
   * workspace에 속하지 않은 조직 단위 키는 이 값이 없으면 400으로 거절된다
   * ("This API key is not scoped to a workspace"). workspace 키면 비워 둔다.
   */
  workspaceId?: string;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === 'text' && typeof (block as { text?: unknown }).text === 'string';
}

function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  const b = block as { id?: unknown; name?: unknown };
  return block.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string';
}

function parseMessagesResponse(data: unknown): MessagesResponse | null {
  if (!isRecord(data) || !Array.isArray(data.content)) return null;
  if (!data.content.every((block) => isRecord(block) && typeof block.type === 'string')) return null;
  return {
    ...(data as unknown as MessagesResponse),
    stop_reason: typeof data.stop_reason === 'string' ? data.stop_reason : null,
  };
}

/** POST /v1/messages 한 번. 429 → rate_limited, 5xx·네트워크 오류 → upstream, 그 밖의 4xx → bad_request */
export async function callMessages(args: MessagesArgs, fetchImpl: typeof fetch): Promise<MessagesResponse> {
  const body: Record<string, unknown> = { model: args.model, max_tokens: args.maxTokens };
  if (args.system) body.system = args.system;
  body.messages = args.messages;
  if (args.tools && args.tools.length > 0) body.tools = args.tools;
  if (args.thinking) body.thinking = args.thinking;

  let response: Response;
  try {
    response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'x-api-key': args.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
        ...(args.workspaceId ? { 'anthropic-workspace-id': args.workspaceId } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AiHttpError('upstream', 'Anthropic API에 연결하지 못했어요.');
  }
  if (response.status === 429) throw new AiHttpError('rate_limited', 'Anthropic API 호출 한도에 걸렸어요. (HTTP 429)', 429);
  if (response.status >= 500) throw new AiHttpError('upstream', `Anthropic API 서버 오류 (HTTP ${response.status})`, response.status);
  if (!response.ok) throw new AiHttpError('bad_request', `Anthropic API가 요청을 거절했어요. (HTTP ${response.status})`, response.status);

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new AiHttpError('bad_response', 'Anthropic API 응답이 JSON이 아니에요.', response.status);
  }
  const parsed = parseMessagesResponse(data);
  if (!parsed) throw new AiHttpError('bad_response', 'Anthropic API 응답 모양이 달라요.', response.status);
  return parsed;
}

/** 첫 text 블록의 글. 없으면 '' */
export function firstText(res: MessagesResponse): string {
  return res.content.find(isTextBlock)?.text ?? '';
}

/** text의 첫 `{`부터 문자열·이스케이프를 고려해 짝이 맞는 `}`까지. 없으면 null */
function balancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** 모델 답에서 JSON 객체 하나를 꺼낸다: 코드펜스 안을 먼저, 그다음 전체 글에서 첫 `{`부터 짝이 맞는 `}`까지. 실패하면 bad_response */
export function extractJson(text: string): unknown {
  const fenced = /```[a-zA-Z]*[ \t]*\r?\n?([\s\S]*?)```/.exec(text);
  const candidates = fenced ? [fenced[1], text] : [text];
  for (const candidate of candidates) {
    const slice = balancedObject(candidate);
    if (slice === null) continue;
    try {
      return JSON.parse(slice) as unknown;
    } catch {
      // 다음 후보를 본다
    }
  }
  throw new AiHttpError('bad_response', 'AI 응답에서 JSON 객체를 찾지 못했어요.');
}

export interface LoopTool {
  def: ToolDef;
  execute(input: unknown): unknown;
}

async function runTool(tools: readonly LoopTool[], use: ToolUseBlock): Promise<ToolResultBlock> {
  const tool = tools.find((t) => t.def.name === use.name);
  if (!tool) {
    return { type: 'tool_result', tool_use_id: use.id, content: JSON.stringify({ error: `알 수 없는 도구: ${use.name.slice(0, 64)}` }), is_error: true };
  }
  try {
    const value = await tool.execute(use.input);
    return { type: 'tool_result', tool_use_id: use.id, content: typeof value === 'string' ? value : JSON.stringify(value ?? null) };
  } catch {
    return { type: 'tool_result', tool_use_id: use.id, content: JSON.stringify({ error: '도구를 실행하지 못했어요.' }), is_error: true };
  }
}

/**
 * 도구 루프: stop_reason이 tool_use면 한 응답의 tool_use 블록을 모두 실행해 한 user 메시지의 tool_result로 붙이고 다시 부른다.
 * 끝나면 마지막 응답의 텍스트를 돌려준다. maxRounds번 불러도 끝나지 않으면 bad_response, 모델이 거절하면 refused.
 */
export async function runToolLoop(args: MessagesArgs, tools: LoopTool[], fetchImpl: typeof fetch, maxRounds = 4): Promise<string> {
  const defs = tools.map((t) => t.def);
  const messages: Message[] = [...args.messages];
  for (let round = 0; round < maxRounds; round += 1) {
    const res = await callMessages({ ...args, messages: [...messages], tools: defs }, fetchImpl);
    if (res.stop_reason === 'refusal') throw new AiHttpError('refused', 'AI가 답하지 않기로 했어요.');
    if (res.stop_reason !== 'tool_use') return res.content.filter(isTextBlock).map((block) => block.text).join('\n');
    const uses = res.content.filter(isToolUseBlock);
    if (uses.length === 0) throw new AiHttpError('bad_response', '도구 호출 응답에 tool_use 블록이 없어요.');
    const results: ToolResultBlock[] = [];
    for (const use of uses) results.push(await runTool(tools, use));
    messages.push({ role: 'assistant', content: res.content }, { role: 'user', content: results });
  }
  throw new AiHttpError('bad_response', `도구 호출이 ${maxRounds}번 안에 끝나지 않았어요.`);
}
