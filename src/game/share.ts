import type { Mode } from '../types/domain';

/** 공유 링크 `#/scene/:id?t=<encodeShare>`에 담는 값 */
export interface SharePayload {
  sceneId: string;
  texts: string[];
  mode: Mode;
}

/** TMI는 최대 3개, 각 80자(UTF-16 코드 단위: 입력창 maxLength·AI 해석과 같은 기준) */
const MAX_TEXTS = 3;
const MAX_TEXT_LENGTH = 80;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const DIGIT = new Map([...ALPHABET].map((ch, i) => [ch, i] as const));

/** 바이트 → base64url(패딩 없음) */
function toBase64url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  if (bytes.length - i === 1) {
    const n = bytes[i] << 16;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
  } else if (bytes.length - i === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63];
  }
  return out;
}

/** base64url(패딩 없음) → 바이트. 글자·길이가 틀리거나 남는 비트가 0이 아니면 null */
function fromBase64url(s: string): Uint8Array | null {
  if (s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (const ch of s) {
    const digit = DIGIT.get(ch);
    if (digit === undefined) return null;
    buffer = ((buffer << 6) | digit) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
  }
  if ((buffer & ((1 << bits) - 1)) !== 0) return null;
  return out;
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** UTF-8 JSON {sceneId, texts, mode}의 base64url */
export function encodeShare(p: SharePayload): string {
  const json = JSON.stringify({ sceneId: p.sceneId, texts: p.texts, mode: p.mode });
  return toBase64url(new TextEncoder().encode(json));
}

/**
 * 공유 값을 읽는다. base64url·UTF-8·JSON 형식이 틀리거나, sceneId가 빈 문자열이거나, texts가 3개를 넘거나
 * 빈 줄·80자 초과가 있거나, mode가 real|toon이 아니면 null. 모르는 필드는 버린다.
 */
export function decodeShare(s: string): SharePayload | null {
  if (typeof s !== 'string' || s === '') return null;
  const bytes = fromBase64url(s);
  if (!bytes) return null;
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { sceneId, texts, mode } = value;
  if (typeof sceneId !== 'string' || sceneId === '') return null;
  if (mode !== 'real' && mode !== 'toon') return null;
  if (!Array.isArray(texts) || texts.length > MAX_TEXTS) return null;
  const clean: string[] = [];
  for (const text of texts) {
    if (typeof text !== 'string' || text.trim() === '' || text.length > MAX_TEXT_LENGTH) return null;
    clean.push(text);
  }
  return { sceneId, texts: clean, mode };
}
