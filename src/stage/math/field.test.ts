import { describe, expect, it } from 'vitest';
import { BASES, FIELDERS, basePoint, nearestFielder } from './field';

describe('field', () => {
  it('수비수 7명과 베이스(홈→1루→2루→3루→홈) 좌표가 프로토타입 값 그대로다', () => {
    expect(FIELDERS).toEqual([[-80, 92], [78, 88], [32, 132], [-32, 128], [-155, 262], [0, 318], [155, 262]]);
    expect(BASES).toEqual([[0, 0], [63.6, 63.6], [0, 127.3], [-63.6, 63.6], [0, 0]]);
  });

  it('basePoint(q)는 루 번호(0 홈·1 1루·2 2루·3 3루·4 홈) 사이를 직선으로 잇는다', () => {
    expect(basePoint(0)).toEqual([0, 0]);
    expect(basePoint(1)).toEqual([63.6, 63.6]);
    expect(basePoint(2)).toEqual([0, 127.3]);
    expect(basePoint(3)).toEqual([-63.6, 63.6]);
    expect(basePoint(4)).toEqual([0, 0]);
    const [hx, hy] = basePoint(0.5);
    expect(hx).toBeCloseTo(31.8, 9);
    expect(hy).toBeCloseTo(31.8, 9);
    const [sx, sy] = basePoint(1.25);
    expect(sx).toBeCloseTo(47.7, 9);
    expect(sy).toBeCloseTo(79.525, 9);
    const [tx, ty] = basePoint(3.5);
    expect(tx).toBeCloseTo(-31.8, 9);
    expect(ty).toBeCloseTo(31.8, 9);
  });

  it('nearestFielder는 낙하 지점에서 가장 가까운 수비수 번호를 준다', () => {
    expect(nearestFielder({ x: 0, y: 330 })).toBe(5);
    expect(nearestFielder({ x: 150, y: 250 })).toBe(6);
    expect(nearestFielder({ x: -150, y: 250 })).toBe(4);
    expect(nearestFielder({ x: -70, y: 90 })).toBe(0);
    expect(nearestFielder({ x: 70, y: 90 })).toBe(1);
    FIELDERS.forEach(([x, y], i) => expect(nearestFielder({ x, y })).toBe(i));
  });
});
