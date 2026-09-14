import { describe, expect, it } from 'vitest';
import {
  BAT,
  BATTER_X,
  DELIVERY_MS,
  PITCHER_KEYS,
  PITCHER_SET,
  RELEASE_AT,
  clamp01,
  lerp,
  poseAt,
  smooth,
} from './pose';
import type { PitcherJoint, PoseKey } from './pose';

describe('보간 도우미', () => {
  it('lerp는 직선 보간이다', () => {
    expect(lerp(2, 6, 0)).toBe(2);
    expect(lerp(2, 6, 1)).toBe(6);
    expect(lerp(2, 6, 0.25)).toBe(3);
  });

  it('clamp01은 0~1로 자른다', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.3)).toBe(0.3);
    expect(clamp01(1.7)).toBe(1);
  });

  it('smooth는 smoothstep(u²(3−2u))이다', () => {
    expect(smooth(0)).toBe(0);
    expect(smooth(0.5)).toBe(0.5);
    expect(smooth(1)).toBe(1);
    expect(smooth(0.25)).toBeCloseTo(0.15625, 12);
  });
});

describe('poseAt', () => {
  const keys: PoseKey<'hand'>[] = [
    { t: 0, j: { hand: [0, 0] } },
    { t: 1, j: { hand: [2, 4] } },
  ];

  it('키 앞뒤는 첫·마지막 키, 가운데는 중간값이다', () => {
    expect(poseAt(keys, 0).hand).toEqual([0, 0]);
    expect(poseAt(keys, 1).hand).toEqual([2, 4]);
    expect(poseAt(keys, 0.5).hand).toEqual([1, 2]);
    expect(poseAt(keys, -3).hand).toEqual([0, 0]);
    expect(poseAt(keys, 7).hand).toEqual([2, 4]);
  });

  it('구간 안에서는 smoothstep으로 보간한다', () => {
    const pose = poseAt(keys, 0.25);
    expect(pose.hand[0]).toBeCloseTo(2 * smooth(0.25), 12);
    expect(pose.hand[1]).toBeCloseTo(4 * smooth(0.25), 12);
  });

  it('투구 동작 키프레임 시각에서는 키 값과 같다', () => {
    for (const key of PITCHER_KEYS) {
      const pose = poseAt(PITCHER_KEYS, key.t);
      for (const name of Object.keys(key.j) as PitcherJoint[]) {
        expect(pose[name][0]).toBeCloseTo(key.j[name][0], 12);
        expect(pose[name][1]).toBeCloseTo(key.j[name][1], 12);
      }
    }
  });

  it('키프레임 사이에서 끊기지 않는다', () => {
    const eps = 1e-6;
    for (const key of PITCHER_KEYS.slice(1, -1)) {
      const before = poseAt(PITCHER_KEYS, key.t - eps);
      const after = poseAt(PITCHER_KEYS, key.t + eps);
      for (const name of Object.keys(before) as PitcherJoint[]) {
        expect(Math.abs(before[name][0] - after[name][0])).toBeLessThan(1e-4);
        expect(Math.abs(before[name][1] - after[name][1])).toBeLessThan(1e-4);
      }
    }
    for (let t = 0; t < 1.5; t += 0.01) {
      const a = poseAt(PITCHER_KEYS, t);
      const b = poseAt(PITCHER_KEYS, t + 0.001);
      expect(Math.abs(a.haT[0] - b.haT[0]) + Math.abs(a.haT[1] - b.haT[1])).toBeLessThan(0.05);
    }
  });

  it('돌려준 자세를 고쳐도 키프레임 상수는 바뀌지 않는다', () => {
    const pose = poseAt(PITCHER_KEYS, 0);
    pose.head[1] += 1;
    expect(PITCHER_SET.head).toEqual([0, 5.75]);
    expect(poseAt(PITCHER_KEYS, 0).head).toEqual([0, 5.75]);
  });
});

describe('자세 상수', () => {
  it('투구 동작은 1650ms, 릴리스는 0.76 시점이고 키 시각이 프로토타입 그대로다', () => {
    expect(DELIVERY_MS).toBe(1650);
    expect(RELEASE_AT).toBe(0.76);
    expect(PITCHER_KEYS.map((k) => k.t)).toEqual([0, 0.32, 0.62, 0.76, 0.92, 1.05, 1.5]);
    expect(PITCHER_KEYS[0].j).toBe(PITCHER_SET);
    expect(PITCHER_KEYS[PITCHER_KEYS.length - 1].j).toBe(PITCHER_SET);
    expect(PITCHER_SET.head).toEqual([0, 5.75]);
    expect(PITCHER_KEYS[3].j.haT).toEqual([-0.62, 5.75]);
    expect(PITCHER_KEYS[4].j.ftT).toEqual([-1.25, 2.5]);
    const names = Object.keys(PITCHER_SET);
    expect(names).toHaveLength(14);
    for (const key of PITCHER_KEYS) expect(Object.keys(key.j)).toEqual(names);
  });

  it('타자 자세는 6개이고 관절 이름이 같으며, bat 첫 칸이 배트 각도다', () => {
    expect(Object.keys(BAT)).toEqual(['stance', 'load', 'stride', 'contact', 'follow', 'take']);
    const names = Object.keys(BAT.stance);
    expect(names).toHaveLength(11);
    for (const pose of Object.values(BAT)) expect(Object.keys(pose)).toEqual(names);
    expect(BAT.stance.bat).toEqual([115, 0]);
    expect(BAT.contact.bat).toEqual([-25, 0]);
    expect(BAT.follow.bat).toEqual([160, 0]);
    expect(BAT.take.ftF).toEqual([1.1, 0]);
    expect(BATTER_X).toBe(2.9);
  });
});
