import { describe, expect, it } from 'vitest';
import type { PitcherPlanEntry } from '../types/domain';
import { pitcherAt } from './relief';

/*
 * 실제 투수 차례 찾기(ADR-033). 되돌려보다가 갈라진 경기에도 쓸 수 있어야 한다.
 */

/** 원정 선발 ap1이 1~6회말, 구원 ap2가 7회말 1사부터, ap3이 9회말. 홈 선발 hp1은 1~9회초 */
const PLAN: PitcherPlanEntry[] = [
  { inning: 1, half: 0, outs: 0, pitcher: 'hp1' },
  { inning: 1, half: 1, outs: 0, pitcher: 'ap1' },
  { inning: 7, half: 1, outs: 1, pitcher: 'ap2' },
  { inning: 9, half: 1, outs: 0, pitcher: 'ap3' },
];

const at = (inning: number, half: 0 | 1, outs = 0) => pitcherAt(PLAN, { inning, half, outs });

describe('pitcherAt', () => {
  it('같은 이닝·초말이면 그 투수다', () => {
    expect(at(1, 1)).toBe('ap1');
    expect(at(1, 0)).toBe('hp1');
  });

  it('바뀐 기록이 없는 이닝은 마지막 투수가 이어 던진다', () => {
    expect(at(5, 1)).toBe('ap1');
    expect(at(6, 1, 2)).toBe('ap1');
    expect(at(4, 0)).toBe('hp1');
  });

  it('반이닝 안에서는 아웃 수로 가른다', () => {
    expect(at(7, 1, 0)).toBe('ap1');
    expect(at(7, 1, 1)).toBe('ap2');
    expect(at(7, 1, 2)).toBe('ap2');
  });

  it('실제 경기보다 뒤 이닝이면 마지막 투수가 계속 던진다', () => {
    expect(at(10, 1)).toBe('ap3');
    expect(at(11, 1, 2)).toBe('ap3');
    expect(at(12, 0)).toBe('hp1');
  });

  it('그 반이닝의 첫 기록보다 아웃이 적어도 첫 투수를 쓴다', () => {
    // 9회말 기록은 0아웃부터다. 그보다 앞설 수 없다
    expect(at(9, 1, 0)).toBe('ap3');
  });

  it('그 편 기록이 아예 없으면 null', () => {
    expect(pitcherAt([], { inning: 3, half: 0, outs: 0 })).toBeNull();
    expect(pitcherAt([{ inning: 5, half: 1, outs: 0, pitcher: 'x' }], { inning: 3, half: 0, outs: 0 })).toBeNull();
  });

  it('그 편 첫 기록보다 앞선 이닝이면 null', () => {
    expect(pitcherAt([{ inning: 5, half: 1, outs: 0, pitcher: 'x' }], { inning: 3, half: 1, outs: 0 })).toBeNull();
  });

  it('시간순이 아닌 기록도 같은 답을 낸다', () => {
    const shuffled = [PLAN[3], PLAN[1], PLAN[0], PLAN[2]];
    expect(pitcherAt(shuffled, { inning: 7, half: 1, outs: 2 })).toBe('ap2');
    expect(pitcherAt(shuffled, { inning: 10, half: 1, outs: 0 })).toBe('ap3');
  });
});
