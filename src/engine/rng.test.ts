import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

/** 프로토타입 engine.js rng(mulberry32)가 seed마다 처음 낸 5개 값 */
const PROTOTYPE: Record<string, number[]> = {
  1: [0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741, 0.9683778982143849],
  42: [0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693, 0.17481389874592423],
  20260914: [0.38017451809719205, 0.49403161695227027, 0.2637186162173748, 0.32148228655569255, 0.550142687978223],
};

const draw = (r: () => number, n: number) => Array.from({ length: n }, () => r());

describe('createRng', () => {
  it('프로토타입 engine.js rng(mulberry32)와 같은 수열을 낸다', () => {
    for (const [seed, values] of Object.entries(PROTOTYPE)) {
      expect(draw(createRng(Number(seed)), 5), `seed ${seed}`).toEqual(values);
    }
  });

  it('같은 seed는 같은 수열, 다른 seed는 다른 수열을 낸다', () => {
    expect(draw(createRng(7), 1000)).toEqual(draw(createRng(7), 1000));
    expect(draw(createRng(7), 20)).not.toEqual(draw(createRng(8), 20));
  });

  it('생성기마다 상태를 따로 가진다', () => {
    const a = createRng(5);
    const b = createRng(5);
    a();
    a();
    expect(b()).toBe(createRng(5)());
    expect(a()).toBe(draw(createRng(5), 3)[2]);
  });

  it('seed는 32비트 부호 없는 정수로 다룬다', () => {
    expect(draw(createRng(-1), 5)).toEqual(draw(createRng(4294967295), 5));
    expect(draw(createRng(2 ** 32 + 1), 5)).toEqual(draw(createRng(1), 5));
  });

  it('값은 [0, 1) 안에 있고 평균은 0.5와 3σ 이내', () => {
    const r = createRng(20260914);
    const N = 100_000;
    let min = Infinity;
    let max = -Infinity;
    let total = 0;
    for (let n = 0; n < N; n++) {
      const u = r();
      min = Math.min(min, u);
      max = Math.max(max, u);
      total += u;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(1);
    expect(Math.abs(total / N - 0.5)).toBeLessThanOrEqual(3 * Math.sqrt(1 / 12 / N));
  });
});
