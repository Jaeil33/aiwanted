import type { PitchRow } from '../../types/data';

/** 투구 추적은 매 공 홈플레이트에서 55ft 떨어진 곳에서 시작한다 */
export const TRACK_Y0 = 55;

/** 추적 시스템이 홈플레이트 통과로 보는 y(ft): 플레이트 끝보다 8.5인치 앞 */
const PLATE_Y = 0.7083;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 추적 시작 t초 뒤 공 위치: 행의 초기 위치·속도·가속도로 계산한 등가속도 궤적 */
export function pitchAt(row: PitchRow, t: number): Vec3 {
  return {
    x: row[6] + row[8] * t + 0.5 * row[11] * t * t,
    y: TRACK_Y0 + row[9] * t + 0.5 * row[12] * t * t,
    z: row[7] + row[10] * t + 0.5 * row[13] * t * t,
  };
}

/** 공이 y = yTarget에 처음 닿는 시각(초) */
export function timeToY(row: PitchRow, yTarget: number): number {
  const a = 0.5 * row[12];
  const b = row[9];
  const c = TRACK_Y0 - yTarget;
  if (Math.abs(a) < 1e-9) return -c / b;
  return (-b - Math.sqrt(Math.max(b * b - 4 * a * c, 0))) / (2 * a);
}

/** 공이 홈플레이트(PLATE_Y)를 지나는 시각(초) */
export function plateTime(row: PitchRow): number {
  return timeToY(row, PLATE_Y);
}

/** 투구 표본이 없을 때 쓰는 합성 직구 한 개: 145km/h, 스트라이크 존 한가운데(x≈0, z≈2.5ft)를 지난다 */
export const DEFAULT_PITCH_ROW: PitchRow = [0, 145, 1, 0, 0, 1, -1.5, 5.8, 5.2, -132, -4.4, -8, 28, -15, 3.4, 1.6];
