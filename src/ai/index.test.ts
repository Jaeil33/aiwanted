import { describe, expect, it } from 'vitest';
import * as ai from './index';

describe('src/ai 공개 API', () => {
  it('내보내는 이름 목록', () => {
    expect(Object.keys(ai).sort()).toEqual([
      'AiError',
      'VERDICT_TOOL',
      'buildInterpretPrompt',
      'buildVerdictPrompt',
      'checkSensitive',
      'evidenceToolResult',
      'interpretTmi',
      'judgeTmi',
      'normalizeInterpretation',
      'normalizeVerdict',
      'pickProvider',
      'prepareText',
      'resolveArtifactSample',
      'ruleInterpret',
      'rulesVerdict',
    ]);
  });

  it('함수(클래스 포함)는 함수, 도구 정의는 객체', () => {
    for (const [name, value] of Object.entries(ai)) {
      expect(typeof value, name).toBe(name === 'VERDICT_TOOL' ? 'object' : 'function');
    }
  });
});
