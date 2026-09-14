import { describe, expect, it } from 'vitest';
import { BallparkStage } from './BallparkStage';
import * as stage from './index';
import * as math from './math';
import * as render from './render';
import { useReducedMotion } from './useReducedMotion';

describe('src/stage 공개 API', () => {
  it('계산(math)·연출(render) 공개 이름과 BallparkStage·useReducedMotion을 다시 내보낸다', () => {
    expect(Object.keys(stage).sort()).toEqual(
      [...Object.keys(math), ...Object.keys(render), 'BallparkStage', 'useReducedMotion'].sort(),
    );
    expect(stage.createStage).toBe(render.createStage);
    expect(stage.project).toBe(math.project);
    expect(stage.BallparkStage).toBe(BallparkStage);
    expect(stage.useReducedMotion).toBe(useReducedMotion);
  });
});
