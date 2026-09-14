import { describe, expect, it } from 'vitest';
import * as math from './index';

const EXPECTED = [
  // camera
  'W', 'H', 'CAMERA', 'PLATE_Y', 'MITT_Y', 'BALL_R', 'project',
  // pitch
  'TRACK_Y0', 'pitchAt', 'timeToY', 'plateTime', 'DEFAULT_PITCH_ROW',
  // batted
  'GRAVITY', 'DRAG', 'battedPreset', 'flight', 'pathAt',
  // pose
  'lerp', 'clamp01', 'smooth', 'poseAt', 'PITCHER_SET', 'RELEASE_AT', 'DELIVERY_MS', 'PITCHER_KEYS', 'BAT', 'BATTER_X',
  // field
  'FIELDERS', 'BASES', 'basePoint', 'nearestFielder',
  // color
  'mix', 'uniform',
  // random
  'mulberry',
];

describe('src/stage/math 공개 API', () => {
  it('계산 모듈의 공개 이름을 빠짐없이, 그 밖의 이름 없이 다시 내보낸다', () => {
    expect(Object.keys(math).sort()).toEqual([...EXPECTED].sort());
  });

  it('다시 내보낸 값이 원래 모듈의 값과 같다', async () => {
    const camera = await import('./camera');
    const pose = await import('./pose');
    expect(math.project).toBe(camera.project);
    expect(math.PITCHER_KEYS).toBe(pose.PITCHER_KEYS);
  });
});
