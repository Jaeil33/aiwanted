import { describe, expect, it } from 'vitest';
import { createStage } from './controller';
import * as render from './index';

describe('src/stage/render 공개 API', () => {
  it('연출 컨트롤러 createStage만 값으로 내보낸다(그리기 함수·테스트 도우미는 내부용)', () => {
    expect(Object.keys(render).sort()).toEqual(['createStage']);
    expect(render.createStage).toBe(createStage);
  });
});
