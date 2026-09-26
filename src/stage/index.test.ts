import { describe, expect, it } from 'vitest';
import * as stage from './index';
import * as pitch from './math/pitch';
import * as tracker from './tracker';
import { useReducedMotion } from './useReducedMotion';

/** 21-pitch-stage step 0: 옛 연출(render·인형·타구)을 지운 뒤 남은 공개 이름 */
describe('src/stage 공개 API', () => {
  it('투구 계산·트래커·useReducedMotion만 내보낸다', () => {
    expect(Object.keys(stage).sort()).toEqual(
      ['DEFAULT_PITCH_ROW', 'TRACK_Y0', 'pitchAt', 'plateTime', 'timeToY', 'CALL_COLORS', 'PITCH_COLORS', 'createTracker', 'frameTracker', 'plateLocation', 'projectOnFrame', 'useReducedMotion'].sort(),
    );
    expect(stage.createTracker).toBe(tracker.createTracker);
    expect(stage.pitchAt).toBe(pitch.pitchAt);
    expect(stage.useReducedMotion).toBe(useReducedMotion);
  });
});
