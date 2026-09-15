import { describe, expect, it } from 'vitest';
import type { TmiEntry } from '../types/domain';
import { actualResultText, gradeOf, statLine } from './headline';

describe('actualResultText', () => {
  it('"이름 : 결과"에서 결과만, 괄호 설명은 뺀다', () => {
    expect(actualResultText('김타자 : 우익수 앞 1루타')).toBe('우익수 앞 1루타');
    expect(actualResultText('김타자 : 좌중간 뒤 홈런 (홈런거리:130M)')).toBe('좌중간 뒤 홈런');
    expect(actualResultText('볼넷')).toBe('볼넷');
  });
});

describe('statLine', () => {
  it('타자는 타율·OPS, 투수는 ERA·WHIP', () => {
    expect(statLine({ kind: 'H', line: { avg: 0.265, obp: 0.344, slg: 0.338 } }, 'H')).toBe('타율 .265 · OPS .682');
    expect(statLine({ kind: 'H', line: { avg: 0.312, obp: 0.41, slg: 0.62 } }, 'H')).toBe('타율 .312 · OPS 1.030');
    expect(statLine({ kind: 'P', line: { era: 7.37888, whip: 1.8599999 } }, 'P')).toBe('ERA 7.38 · WHIP 1.86');
  });

  it('기록이 없거나 숫자가 아니면 "2026 기록 없음"', () => {
    expect(statLine(undefined, 'H')).toBe('2026 기록 없음');
    expect(statLine({ kind: 'P', line: { era: '-' } }, 'P')).toBe('2026 기록 없음');
    expect(statLine({ kind: 'P', line: { era: 3.1 } }, 'H')).toBe('2026 기록 없음');
  });
});

const knob = (evidence: 'measured' | 'plausible' | 'fun') => ({
  kind: 'knob' as const,
  knob: 'stamina' as const,
  subject: 'pitcher' as const,
  strength: -1,
  scope: 'game' as const,
  evidence,
  why: '',
});

const entry = (id: string, parts: TmiEntry['interpretation']['parts'], refused = false): TmiEntry => ({
  id,
  text: id,
  interpretation: { source: 'rules', refused, reason: '', comment: '', parts },
});

describe('gradeOf', () => {
  it('TMI가 없거나 모두 거부면 null', () => {
    expect(gradeOf([])).toBeNull();
    expect(gradeOf([entry('a', [], true)])).toBeNull();
  });

  it('여러 TMI면 가장 약한 등급(상상 < 그럴듯함 < 실측), 실측 변수는 실측', () => {
    const measured = { kind: 'measured' as const, variable: 'temp_c' as const, value: 33, subject: 'everyone' as const, why: '' };
    expect(gradeOf([entry('a', [measured])])).toBe('measured');
    expect(gradeOf([entry('a', [measured]), entry('b', [knob('plausible')])])).toBe('plausible');
    expect(gradeOf([entry('a', [knob('plausible')]), entry('b', [knob('fun')]), entry('c', [measured])])).toBe('fun');
  });
});
