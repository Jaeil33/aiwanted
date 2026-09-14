import { describe, expect, it } from 'vitest';
import type { EventIndex, PitchCode } from '../types/domain';
import { EV, EVENT_LABEL, PITCH_CODES, PITCH_CODE_LABEL, PITCH_TYPES } from './events';

describe('EV', () => {
  it('사건 벡터 순서 [K, BB, HR, 3B, 2B, 1B, OUT]의 인덱스', () => {
    expect(EV).toEqual({ K: 0, BB: 1, HR: 2, T3: 3, D2: 4, S1: 5, OUT: 6 });
    const indexes: EventIndex[] = Object.values(EV);
    expect([...indexes].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('EVENT_LABEL', () => {
  it('사건 순서대로 한국어 이름을 둔다', () => {
    expect(EVENT_LABEL).toEqual(['삼진', '볼넷', '홈런', '3루타', '2루타', '안타', '범타']);
    expect(EVENT_LABEL[EV.HR]).toBe('홈런');
    expect(EVENT_LABEL[EV.OUT]).toBe('범타');
  });
});

describe('PITCH_CODES', () => {
  it('인덱스가 PitchRow code(0 B·1 T·2 S·3 F·4 X)와 같다', () => {
    expect(PITCH_CODES).toEqual(['B', 'T', 'S', 'F', 'X']);
    expect(PITCH_CODES.indexOf('X')).toBe(4);
  });

  it('공 결과마다 라벨이 있다', () => {
    const expected: Record<PitchCode, string> = { B: '볼', T: '스트라이크', S: '헛스윙', F: '파울', X: '타격' };
    expect(PITCH_CODE_LABEL).toEqual(expected);
    for (const code of PITCH_CODES) expect(PITCH_CODE_LABEL[code]).not.toBe('');
  });
});

describe('PITCH_TYPES', () => {
  it('파이프라인과 같은 구종 9개, 마지막은 기타', () => {
    expect(PITCH_TYPES).toEqual(['직구', '투심', '커터', '슬라이더', '스위퍼', '커브', '체인지업', '포크', '기타']);
  });
});
