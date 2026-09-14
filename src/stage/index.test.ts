import { describe, expect, it } from 'vitest';
import * as stage from './index';
import * as math from './math';
import * as render from './render';

describe('src/stage 공개 API', () => {
  it('계산(math)과 연출(render)의 공개 이름을 모두 다시 내보낸다', () => {
    expect(Object.keys(stage).sort()).toEqual([...Object.keys(math), ...Object.keys(render)].sort());
    expect(stage.createStage).toBe(render.createStage);
    expect(stage.project).toBe(math.project);
  });
});
