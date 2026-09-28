import { describe, expect, it, vi } from 'vitest';
import type { AiErrorCode, AiProvider } from './providers';
import { AiError } from './providers/errors';
import { narratePa } from './call';
import { rulesCall } from './rules';
import { fixtureCallFacts } from './test-helpers';

/*
 * 23-commentary: 타석이 끝난 뒤 자막 한 줄.
 * 해석·판정과 같은 골격이다 — AI 원문은 normalizeCall을 통과해야 하고, 실패·오류·AI 없음이면 규칙 자막으로 대신한다(ADR-003).
 */

const facts = fixtureCallFacts();
const AI_LINE = '어제 피자를 먹은 김타자, 2타점 적시 2루타를 쳐냅니다! 그 피자가 효과가 있었던 걸까요?';

/** call만 구현한 가짜 프로바이더. 해석·판정은 이 흐름에서 부르지 않는다 */
function fakeProvider(call: AiProvider['call']): AiProvider {
  return {
    name: 'http',
    interpret: () => Promise.reject(new Error('부르면 안 된다')),
    verdict: () => Promise.reject(new Error('부르면 안 된다')),
    call,
  };
}

const throwing = (e: unknown) => fakeProvider(() => Promise.reject(e));

describe('narratePa', () => {
  it('AI 원문을 검증해 자막으로 쓴다', async () => {
    const call = vi.fn(() => Promise.resolve({ line: AI_LINE }));
    const out = await narratePa(facts, fakeProvider(call));
    expect(out).toEqual({ source: 'ai', line: AI_LINE, disableProvider: false });
    expect(call).toHaveBeenCalledWith({ facts }, undefined);
  });

  it('AI가 없으면 규칙 자막', async () => {
    expect(await narratePa(facts, null)).toEqual({ source: 'rules', line: rulesCall(facts), disableProvider: false });
  });

  it('걸린 TMI가 없으면 AI를 부르지 않는다', async () => {
    const call = vi.fn(() => Promise.resolve({ line: AI_LINE }));
    const bare = fixtureCallFacts({ tmis: [] });
    expect(await narratePa(bare, fakeProvider(call))).toEqual({ source: 'rules', line: rulesCall(bare), disableProvider: false });
    expect(call).not.toHaveBeenCalled();
  });

  it('읽지 못하는 응답·퍼센트가 든 자막이면 규칙 자막', async () => {
    for (const raw of [null, {}, { line: '' }, '문자열', { line: '승리확률 62.1%!' }]) {
      const out = await narratePa(facts, fakeProvider(() => Promise.resolve(raw)));
      expect(out).toEqual({ source: 'rules', line: rulesCall(facts), disableProvider: false });
    }
  });

  it('AI 오류는 모두 규칙 자막으로 끝난다', async () => {
    const codes: AiErrorCode[] = ['unavailable', 'tools_unavailable', 'rate_limited', 'refused', 'bad_response', 'timeout', 'network', 'upstream'];
    for (const code of codes) {
      const out = await narratePa(facts, throwing(new AiError(code, '테스트')));
      expect(out).toEqual({ source: 'rules', line: rulesCall(facts), disableProvider: false });
    }
    expect(await narratePa(facts, throwing(new Error('알 수 없는 오류')))).toMatchObject({ source: 'rules' });
  });

  it('영구 unavailable이면 이 화면에서 프로바이더를 끈다', async () => {
    const out = await narratePa(facts, throwing(new AiError('unavailable', '테스트', { permanent: true })));
    expect(out).toEqual({ source: 'rules', line: rulesCall(facts), disableProvider: true });
  });

  it('취소는 던진다: 자막을 만들지 않는다', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(narratePa(facts, throwing(new AiError('cancelled', '취소')), controller.signal)).rejects.toThrow(AiError);
  });
});
