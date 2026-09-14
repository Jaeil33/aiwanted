import { describe, expect, it } from 'vitest';
import { BALL_R, CAMERA, H, MITT_Y, PLATE_Y, W, project } from './camera';

describe('camera', () => {
  it('논리 캔버스·카메라·홈플레이트 상수가 프로토타입 값 그대로다', () => {
    expect(W).toBe(960);
    expect(H).toBe(540);
    expect(CAMERA).toEqual({ y: -14, z: 6, f: 1150, cx: 480, hy: 150 });
    expect(PLATE_Y).toBe(0.7083);
    expect(MITT_Y).toBe(-1.6);
    expect(BALL_R).toBe(0.121);
  });

  it('먼 수평선은 화면 가운데 눈높이(hy)에 온다', () => {
    const far = project(0, 1e7, CAMERA.z);
    expect(Math.abs(far.x - CAMERA.cx)).toBeLessThan(1e-6);
    expect(Math.abs(far.y - CAMERA.hy)).toBeLessThan(1e-3);
  });

  it('1루 쪽(+x)은 화면 오른쪽, 3루 쪽(−x)은 왼쪽이다', () => {
    expect(project(1, 20, 0).x).toBeGreaterThan(CAMERA.cx);
    expect(project(-1, 20, 0).x).toBeLessThan(CAMERA.cx);
  });

  it('눈높이보다 높은 점은 수평선 위(작은 y), 땅은 수평선 아래에 그린다', () => {
    expect(project(0, 30, CAMERA.z + 4).y).toBeLessThan(CAMERA.hy);
    expect(project(0, 30, 0).y).toBeGreaterThan(CAMERA.hy);
  });

  it('깊이가 두 배가 되면 크기(s)는 절반이다', () => {
    const nearScale = project(0, 40 + CAMERA.y, 0).s;
    const farScale = project(0, 80 + CAMERA.y, 0).s;
    expect(nearScale).toBeCloseTo(2 * farScale, 9);
  });
});
