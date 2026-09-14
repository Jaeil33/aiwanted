/*
 * 포수 뒤 중계 카메라(순수 계산). 경기장 좌표는 ft 단위:
 * x는 1루 쪽이 +, y는 홈플레이트에서 투수·외야 쪽이 +, z는 위쪽이 +.
 */

/** 논리 캔버스 크기(px). 실제 픽셀은 렌더러가 배율로 맞춘다. */
export const W = 960;
export const H = 540;

export interface Camera {
  /** 홈플레이트 뒤 카메라 위치(ft) */
  readonly y: number;
  /** 눈높이(ft) */
  readonly z: number;
  /** 초점 거리(px) */
  readonly f: number;
  /** 화면 가운데 x(px) */
  readonly cx: number;
  /** 수평선 높이(px) */
  readonly hy: number;
}

export const CAMERA: Camera = { y: -14, z: 6, f: 1150, cx: W / 2, hy: 150 };

/** 추적 시스템이 홈플레이트 통과로 보는 y: 플레이트 끝보다 8.5인치 앞 */
export const PLATE_Y = 0.7083;
/** 포수 미트 y */
export const MITT_Y = -1.6;
/** 공 반지름(ft) */
export const BALL_R = 0.121;

export interface Projected {
  x: number;
  y: number;
  /** 그 깊이에서 1ft가 몇 px인지 */
  s: number;
}

/** 경기장 좌표(ft)를 논리 캔버스 좌표(px)로 투영한다. */
export function project(x: number, y: number, z: number): Projected {
  const d = y - CAMERA.y;
  return { x: CAMERA.cx + (CAMERA.f * x) / d, y: CAMERA.hy - (CAMERA.f * (z - CAMERA.z)) / d, s: CAMERA.f / d };
}
