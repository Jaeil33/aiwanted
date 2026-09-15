import { describe, expect, it } from 'vitest';
import { KNOB_IDS } from '../domain/knobs';
import type { KnobId } from '../types/domain';
import { KNOB_WEIGHTS, STEP } from './knobs';

/** reference/tmi-prototype/engine.js KNOBS의 w: [K, BB, HR, 3B, 2B, 1B, OUT] 세기 1당 로그 오즈 방향 */
const PROTOTYPE_W: Record<KnobId, number[]> = {
  contact: [-1, 0, 0, 0, 0.2, 0.5, -0.1],
  power: [0.15, 0, 1, 0.2, 0.4, 0, -0.1],
  eye: [-0.3, 1, 0, 0, 0, 0, 0],
  focus: [-0.5, 0.2, 0.3, 0.3, 0.3, 0.3, -0.15],
  speed: [0, 0, 0, 0.8, 0.1, 0.3, -0.1],
  stuff: [1, 0, -0.5, -0.2, -0.3, -0.3, 0.1],
  control: [0.2, -1, 0.15, 0, 0, 0, 0],
  stamina: [0.3, -0.4, -0.5, -0.3, -0.3, -0.3, 0.1],
  nerve: [0.3, -0.6, -0.4, 0, -0.2, -0.2, 0],
  defense: [0, 0, 0, -0.3, -0.3, -0.4, 0.2],
  carry: [0, 0, 1, 0.1, 0.3, 0, -0.1],
  slick: [-0.3, 0.8, 0.2, 0, 0, 0, 0],
  glare: [0.6, 0, -0.2, 0, -0.2, -0.2, 0],
  mood: [-0.3, 0.2, 0.2, 0.2, 0.2, 0.2, -0.1],
};

describe('STEP', () => {
  it('세기 1당 로그 오즈 0.3 (ADR-026)', () => {
    expect(STEP).toBe(0.3);
  });
});

describe('KNOB_WEIGHTS', () => {
  it('손잡이 14개가 모두 있고 그 밖의 키는 없다', () => {
    expect(Object.keys(KNOB_WEIGHTS).sort()).toEqual([...KNOB_IDS].sort());
  });

  it('가중치는 프로토타입 engine.js KNOBS의 w 그대로다', () => {
    for (const id of KNOB_IDS) {
      expect(KNOB_WEIGHTS[id], id).toHaveLength(7);
      expect([...KNOB_WEIGHTS[id]], id).toEqual(PROTOTYPE_W[id]);
    }
  });
});
