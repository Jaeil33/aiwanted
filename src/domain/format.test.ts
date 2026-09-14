import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_LABEL,
  MODE_LABEL,
  basesText,
  formatDeltaPp,
  formatPct,
  josa,
  situationText,
} from './format';

describe('formatPct', () => {
  it('확률을 소수 첫째 자리 퍼센트로 쓴다', () => {
    expect(formatPct(0.362)).toBe('36.2%');
    expect(formatPct(0.5)).toBe('50.0%');
    expect(formatPct(0)).toBe('0.0%');
    expect(formatPct(1)).toBe('100.0%');
  });
});

describe('formatDeltaPp', () => {
  it('0.1%p 이상은 소수 첫째 자리', () => {
    expect(formatDeltaPp(0.006)).toBe('+0.6%p');
    expect(formatDeltaPp(0.123)).toBe('+12.3%p');
    expect(formatDeltaPp(-0.123)).toBe('−12.3%p');
  });

  it('0.1%p 미만은 소수 둘째 자리, 음수 부호는 U+2212', () => {
    expect(formatDeltaPp(-0.0007)).toBe('−0.07%p');
    expect(formatDeltaPp(0.0005)).toBe('+0.05%p');
  });

  it('0.005%p 미만이거나 숫자가 아니면 ±0.00%p', () => {
    expect(formatDeltaPp(0)).toBe('±0.00%p');
    expect(formatDeltaPp(0.00004)).toBe('±0.00%p');
    expect(formatDeltaPp(-0.00004)).toBe('±0.00%p');
    expect(formatDeltaPp(Number.NaN)).toBe('±0.00%p');
  });
});

describe('josa', () => {
  it('받침이 있으면 이·은·을, 없으면 가·는·를', () => {
    expect(josa('감독', '이/가')).toBe('감독이');
    expect(josa('투수', '이/가')).toBe('투수가');
    expect(josa('홈런', '은/는')).toBe('홈런은');
    expect(josa('타자', '은/는')).toBe('타자는');
    expect(josa('짜장면', '을/를')).toBe('짜장면을');
    expect(josa('투수', '을/를')).toBe('투수를');
  });

  it('으로/로는 받침이 없거나 ㄹ 받침이면 로', () => {
    expect(josa('투수', '으로/로')).toBe('투수로');
    expect(josa('볼', '으로/로')).toBe('볼로');
    expect(josa('삼진', '으로/로')).toBe('삼진으로');
  });

  it('한글로 끝나지 않으면 받침 없는 쪽을 붙인다', () => {
    expect(josa('KIA', '이/가')).toBe('KIA가');
    expect(josa('LG', '은/는')).toBe('LG는');
    expect(josa('SSG', '으로/로')).toBe('SSG로');
  });
});

describe('basesText', () => {
  it('주자 비트마스크를 글로 쓴다', () => {
    expect(basesText(0)).toBe('주자 없음');
    expect(basesText(1)).toBe('1루');
    expect(basesText(2)).toBe('2루');
    expect(basesText(4)).toBe('3루');
    expect(basesText(3)).toBe('1·2루');
    expect(basesText(5)).toBe('1·3루');
    expect(basesText(6)).toBe('2·3루');
    expect(basesText(7)).toBe('만루');
  });
});

describe('situationText', () => {
  it('이닝·초말·아웃·주자를 한 줄로 쓴다', () => {
    expect(situationText({ inning: 9, half: 1, outs: 2, bases: 7 })).toBe('9회말 2사 만루');
    expect(situationText({ inning: 1, half: 0, outs: 0, bases: 0 })).toBe('1회초 무사 주자 없음');
    expect(situationText({ inning: 10, half: 0, outs: 1, bases: 5 })).toBe('10회초 1사 1·3루');
    expect(situationText({ inning: 11, half: 1, outs: 3, bases: 0 })).toBe('11회말 3아웃 주자 없음');
  });

  it('GameState를 그대로 받는다', () => {
    const state = { inning: 9, half: 1 as const, outs: 2, bases: 7, away: 4, home: 4, slotAway: 3, slotHome: 5 };
    expect(situationText(state)).toBe('9회말 2사 만루');
  });
});

describe('라벨', () => {
  it('근거 등급 라벨', () => {
    expect(EVIDENCE_LABEL).toEqual({ measured: '실측', plausible: '그럴듯함', fun: '상상' });
  });

  it('모드 라벨', () => {
    expect(MODE_LABEL).toEqual({ real: '현실 모드', toon: '만화 모드' });
  });
});
