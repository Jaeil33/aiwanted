import { describe, expect, it } from 'vitest';
import { mulberry } from './random';

describe('mulberry', () => {
  it('같은 시드는 같은 수열을 만든다', () => {
    const a = mulberry(11);
    const b = mulberry(11);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it('프로토타입 mulberry와 같은 값을 낸다(시드 11: 관중석 점 배치)', () => {
    const r = mulberry(11);
    expect(r()).toBe(0.5115870486479253);
    expect(r()).toBe(0.5299464082345366);
    expect(r()).toBe(0.6081185641232878);
  });

  it('값은 [0, 1) 범위이고 시드가 다르면 수열도 다르다', () => {
    const r = mulberry(7);
    const xs = Array.from({ length: 1000 }, () => r());
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(mulberry(7)()).not.toBe(mulberry(8)());
  });
});
