import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare, type SharePayload } from './share';

/** 테스트용 기준 구현: 바이트를 base64url(패딩 없음)로 */
function bytesToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** encodeShare 검증을 거치지 않고 임의 JSON 값을 인코딩한다 */
const rawEncode = (value: unknown): string => bytesToBase64url(new TextEncoder().encode(JSON.stringify(value)));

const KOREAN: SharePayload = {
  sceneId: 'fixture-walkoff',
  texts: ['원정투수가 경기 전 짜장면 곱빼기를 먹었다', '오늘 기온 35도, 폭염', '따옴표 "와 \\ 백슬래시, 이모지 🙂'],
  mode: 'toon',
};

describe('encodeShare · decodeShare', () => {
  it('한글·따옴표·이모지가 든 값을 왕복한다', () => {
    const encoded = encodeShare(KOREAN);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeShare(encoded)).toEqual(KOREAN);
  });

  it('UTF-8 JSON {sceneId, texts, mode}의 base64url(패딩 없음)이다', () => {
    expect(encodeShare(KOREAN)).toBe(rawEncode({ sceneId: KOREAN.sceneId, texts: KOREAN.texts, mode: KOREAN.mode }));
    const empty: SharePayload = { sceneId: 's', texts: [], mode: 'real' };
    expect(decodeShare(encodeShare(empty))).toEqual(empty);
  });

  it('80자 TMI 3개까지 받는다', () => {
    const full: SharePayload = { sceneId: 'fixture-walkoff', texts: ['가'.repeat(80), 'a'.repeat(80), '나'.repeat(80)], mode: 'real' };
    expect(decodeShare(encodeShare(full))).toEqual(full);
  });

  it('81자 TMI나 4개는 거절한다', () => {
    expect(decodeShare(rawEncode({ sceneId: 'x', texts: ['가'.repeat(81)], mode: 'real' }))).toBeNull();
    expect(decodeShare(rawEncode({ sceneId: 'x', texts: ['a', 'b', 'c', 'd'], mode: 'real' }))).toBeNull();
  });

  it('모르는 필드는 버린다', () => {
    expect(decodeShare(rawEncode({ sceneId: 'x', texts: ['오늘 폭염'], mode: 'real', extra: 1 }))).toEqual({
      sceneId: 'x',
      texts: ['오늘 폭염'],
      mode: 'real',
    });
  });

  it('base64url·UTF-8·JSON 형식이 틀리면 null', () => {
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('!!!!')).toBeNull();
    expect(decodeShare('abc=')).toBeNull();
    expect(decodeShare('a')).toBeNull();
    expect(decodeShare(bytesToBase64url(new TextEncoder().encode('not json')))).toBeNull();
    expect(decodeShare(bytesToBase64url(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])))).toBeNull();
  });

  it('모양이 틀리면 null', () => {
    const cases: unknown[] = [
      null,
      'text',
      42,
      [],
      { texts: [], mode: 'real' },
      { sceneId: '', texts: [], mode: 'real' },
      { sceneId: 7, texts: [], mode: 'real' },
      { sceneId: 'x', mode: 'real' },
      { sceneId: 'x', texts: '오늘 폭염', mode: 'real' },
      { sceneId: 'x', texts: [1], mode: 'real' },
      { sceneId: 'x', texts: ['   '], mode: 'real' },
      { sceneId: 'x', texts: [] },
      { sceneId: 'x', texts: [], mode: 'comic' },
    ];
    for (const value of cases) expect(decodeShare(rawEncode(value)), JSON.stringify(value)).toBeNull();
  });
});
