import type { PitchRow } from '../../types/data';
import type { PitchCode } from '../../types/domain';

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

/** 공 반지름(ft) */
export const BALL_R_FT = 0.121;
/**
 * 공을 원근 계산값보다 크게 그리는 배수(21-pitch-stage step 4).
 * 실제 중계 그래픽도 공을 원근보다 크게 그린다 — 안 그러면 홈플레이트에서도 지름 16px짜리 점이다.
 */
export const BALL_SCALE = 1.5;
/** 아무리 멀어도 이보다 작게는 안 그린다(px) */
const MIN_BALL_PX = 2;

/** 그 깊이에서 1ft가 scale px일 때 화면에 그릴 공 반지름(px) */
export function ballRadiusPx(scale: number): number {
  return Math.max(MIN_BALL_PX, scale * BALL_R_FT * BALL_SCALE);
}

export interface Spin {
  /** 비행 동안 화면에서 도는 바퀴 수. 양수·음수가 회전 방향이다 */
  turns: number;
  /** 실밥 면의 기울기(라디안) */
  tilt: number;
}

/*
 * 구종별 회전. **기록에 회전축이 없다** — 구종에서 지어낸 값이다(/grill-me Q6 a).
 * 순서는 PITCH_TYPES 그대로: 직구·투심·커터·슬라이더·스위퍼·커브·체인지업·포크·기타.
 */
const SPINS: readonly Spin[] = [
  { turns: 2.6, tilt: 0 },      // 직구: 백스핀
  { turns: 2.4, tilt: 0.35 },   // 투심
  { turns: 2.2, tilt: -0.5 },   // 커터
  { turns: -2.4, tilt: -0.9 },  // 슬라이더: 옆회전
  { turns: -2.8, tilt: -1.2 },  // 스위퍼
  { turns: -2.6, tilt: 0.15 },  // 커브: 탑스핀
  { turns: 1.8, tilt: 0.2 },    // 체인지업
  { turns: 0.4, tilt: 0.1 },    // 포크: 거의 안 돈다
  { turns: 2, tilt: 0 },        // 기타
];

const OTHER = SPINS.length - 1;

export function spinOf(pitchType: number): Spin {
  return SPINS[Number.isInteger(pitchType) && pitchType >= 0 && pitchType < OTHER ? pitchType : OTHER];
}

/** 비행 진행도(0~1)에서 실밥이 돌아간 각도(라디안) */
export function seamAngle(pitchType: number, progress: number): number {
  const { turns, tilt } = spinOf(pitchType);
  return tilt + turns * Math.PI * 2 * progress;
}

export interface ZoneCell {
  /** 왼쪽부터 0·1·2 */
  col: number;
  /** 위부터 0·1·2 */
  row: number;
}

/** 존 3×3에서 그 지점이 든 칸. 존 밖이면 null (경계선 위는 안으로 본다) */
export function zoneCellAt(x: number, z: number, zone: { top: number; bottom: number }, halfWidth: number): ZoneCell | null {
  const height = zone.top - zone.bottom;
  if (height <= 0 || halfWidth <= 0) return null;
  if (x < -halfWidth || x > halfWidth || z < zone.bottom || z > zone.top) return null;
  const clamp = (n: number) => (n < 0 ? 0 : n > 2 ? 2 : n);
  return {
    col: clamp(Math.floor(((x + halfWidth) / (halfWidth * 2)) * 3)),
    row: clamp(Math.floor(((zone.top - z) / height) * 3)),
  };
}

export type ZoneReaction = 'strike' | 'ball' | 'none';

/**
 * 그 공에 존이 어떻게 반응하나(21-pitch-stage step 5).
 * 인플레이(X)는 반응하지 않는다 — 맞은 공에 판정을 붙일 수 없다(/grill-me Q24 a).
 */
export function zoneReactionOf(code: PitchCode): ZoneReaction {
  if (code === 'B') return 'ball';
  return code === 'X' ? 'none' : 'strike';
}
