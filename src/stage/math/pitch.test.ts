import { describe, expect, it } from 'vitest';
import type { PitchRow } from '../../types/data';

import { DEFAULT_PITCH_ROW, TRACK_Y0, pitchAt, plateTime, timeToY } from './pitch';

/** 옛 camera.ts가 들고 있던 두 값. 계산을 못 박기 위해 테스트가 직접 든다 */
const PLATE_Y = 0.7083;
const MITT_Y = -1.6;

// 합성 투구(실제 기록 아님): [type, speed, code, balls, strikes, stance, x0, z0, vx0, vy0, vz0, ax, ay, az, topSz, bottomSz]
const SYN: PitchRow = [3, 134, 1, 1, 0, 1, -1.48, 5.77, 4.2, -121.5, -3.9, 2.4, 25.1, -30.2, 3.42, 1.61];

const kinematic = (p0: number, v0: number, a: number, t: number) => p0 + v0 * t + 0.5 * a * t * t;

describe('pitchAt', () => {
  it('추적은 홈에서 55ft 떨어진 행의 x0·z0에서 시작한다', () => {
    expect(TRACK_Y0).toBe(55);
    expect(pitchAt(SYN, 0)).toEqual({ x: -1.48, y: 55, z: 5.77 });
  });

  it('x·y·z가 모두 등가속도 공식을 따른다', () => {
    for (const t of [0.1, 0.25, 0.4]) {
      const at = pitchAt(SYN, t);
      expect(at.x).toBeCloseTo(kinematic(SYN[6], SYN[8], SYN[11], t), 12);
      expect(at.y).toBeCloseTo(kinematic(TRACK_Y0, SYN[9], SYN[12], t), 12);
      expect(at.z).toBeCloseTo(kinematic(SYN[7], SYN[10], SYN[13], t), 12);
    }
  });
});

describe('plateTime · timeToY', () => {
  it('plateTime 시각에 공의 y는 PLATE_Y이고 x·z는 등가속도 공식 값이다', () => {
    const t = plateTime(SYN);
    expect(t).toBeGreaterThan(0.3);
    expect(t).toBeLessThan(0.7);
    const at = pitchAt(SYN, t);
    expect(Math.abs(at.y - PLATE_Y)).toBeLessThan(1e-6);
    expect(at.x).toBeCloseTo(kinematic(SYN[6], SYN[8], SYN[11], t), 9);
    expect(at.z).toBeCloseTo(kinematic(SYN[7], SYN[10], SYN[13], t), 9);
  });

  it('timeToY는 목표 y에 처음 닿는 시각이고, 포수 미트는 홈플레이트보다 늦다', () => {
    for (const y of [40, 20, PLATE_Y, MITT_Y]) {
      expect(Math.abs(pitchAt(SYN, timeToY(SYN, y)).y - y)).toBeLessThan(1e-6);
    }
    expect(timeToY(SYN, 40)).toBeLessThan(timeToY(SYN, 20));
    expect(timeToY(SYN, MITT_Y)).toBeGreaterThan(plateTime(SYN));
  });

  it('y 가속도가 0이면 등속 운동으로 푼다', () => {
    const steady: PitchRow = [0, 140, 0, 0, 0, 1, 0, 6, 0, -110, 0, 0, 0, -32, 3.4, 1.6];
    expect(timeToY(steady, 0)).toBeCloseTo(0.5, 12);
  });
});

describe('DEFAULT_PITCH_ROW', () => {
  it('스트라이크 존 한가운데를 지나는 직구 한 개다', () => {
    expect(DEFAULT_PITCH_ROW).toHaveLength(16);
    expect(DEFAULT_PITCH_ROW[0]).toBe(0);
    const t = plateTime(DEFAULT_PITCH_ROW);
    expect(t).toBeGreaterThan(0.35);
    expect(t).toBeLessThan(0.5);
    const at = pitchAt(DEFAULT_PITCH_ROW, t);
    const top = DEFAULT_PITCH_ROW[14];
    const bottom = DEFAULT_PITCH_ROW[15];
    expect(Math.abs(at.x)).toBeLessThan(0.1);
    expect(Math.abs(at.z - (top + bottom) / 2)).toBeLessThan(0.1);
  });
});
