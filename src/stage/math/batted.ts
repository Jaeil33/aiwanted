import type { Play } from '../../types/domain';
import { CAMERA } from './camera';
import { lerp } from './pose';

/** 중력 가속도(ft/s²) */
export const GRAVITY = 32.17;
/** ft당 항력 계수. 백스핀 양력을 대신하려고 낮게 둔다 */
export const DRAG = 0.0012;

export type BattedKind = 'HR' | 'gap' | 'grounder' | 'liner' | 'fly' | 'foul';

export interface BattedSpec {
  kind: BattedKind;
  /** 타구 속도(ft/s) */
  ev: number;
  /** 발사각(도) */
  la: number;
  /** 방향(도): 가운데 담장 쪽이 0, 음수는 3루·좌익수 쪽 */
  spray: number;
  /** 홈에서 이 거리(ft)에 닿으면 멈춘다(수비수가 잡은 자리) */
  stopAt?: number;
}

export interface FlightPoint {
  t: number;
  x: number;
  y: number;
  z: number;
}

export interface Flight {
  /** 시간순 점: 1/120초 적분을 4스텝마다(멈춘 점은 항상) 기록 */
  points: FlightPoint[];
  landing: { x: number; y: number };
  apex: number;
  distance: number;
  duration: number;
}

/** 인플레이 결과(또는 파울 'F')에 맞는 타구. u1·u2는 호출한 쪽이 주는 [0, 1) 난수 */
export function battedPreset(play: Play | 'F', bats: 'L' | 'R', u1: number, u2: number): BattedSpec {
  const pull = bats === 'L' ? 1 : -1;
  const side = u2 < 0.5 ? -1 : 1;
  switch (play) {
    case 'HR':
      return { kind: 'HR', ev: lerp(155, 170, u1), la: lerp(24, 32, u2), spray: pull * lerp(8, 38, u1) };
    case '3B':
      return { kind: 'gap', ev: lerp(145, 155, u1), la: lerp(14, 20, u2), spray: side * lerp(30, 42, u1) };
    case '2B':
      return { kind: 'gap', ev: lerp(140, 152, u1), la: lerp(12, 20, u2), spray: side * lerp(18, 40, u1) };
    case '1B':
      return u2 < 0.5
        ? { kind: 'grounder', ev: lerp(125, 140, u1), la: lerp(-4, 4, u2 * 2), spray: lerp(-30, 30, u1), stopAt: 175 }
        : { kind: 'liner', ev: lerp(110, 125, u1), la: lerp(10, 16, (u2 - 0.5) * 2), spray: lerp(-35, 35, u1) };
    case 'GB':
    case 'DP':
      return { kind: 'grounder', ev: lerp(105, 125, u1), la: lerp(-10, -2, u2), spray: pull * lerp(-10, 30, u1), stopAt: 118 };
    case 'FB':
    case 'SF':
      return { kind: 'fly', ev: lerp(118, 130, u1), la: lerp(34, 42, u2), spray: lerp(-32, 32, u1) };
    case 'LD':
      return { kind: 'liner', ev: lerp(125, 140, u1), la: lerp(8, 14, u2), spray: pull * lerp(-5, 25, u1), stopAt: 125 };
    case 'F':
      return { kind: 'foul', ev: lerp(80, 110, u1), la: lerp(35, 70, u2), spray: (u1 < 0.5 ? -1 : 1) * lerp(100, 150, u2) };
    default:
      return { kind: 'fly', ev: 120, la: 20, spray: 0 };
  }
}

/** 항력 있는 포물선 타구 비행. 땅볼·갭 타구는 튕기고 구르며, stopAt·파울·홈런 거리에서 멈춘다 */
export function flight(spec: BattedSpec): Flight {
  const dt = 1 / 120;
  const la = (spec.la * Math.PI) / 180;
  const sp = (spec.spray * Math.PI) / 180;
  let x = 0;
  let y = 1.4;
  let z = 2.6;
  let vx = spec.ev * Math.cos(la) * Math.sin(sp);
  let vy = spec.ev * Math.cos(la) * Math.cos(sp);
  let vz = spec.ev * Math.sin(la);
  let t = 0;
  let apex = z;
  let rolling = false;
  const bounces = spec.kind === 'grounder' || spec.kind === 'gap';
  const points: FlightPoint[] = [{ t, x, y, z }];
  for (let i = 1; i <= 120 * 8; i++) {
    const v = Math.hypot(vx, vy, vz);
    if (rolling) {
      const keep = 1 - 1.2 * dt;
      vx *= keep;
      vy *= keep;
    } else {
      vx -= DRAG * v * vx * dt;
      vy -= DRAG * v * vy * dt;
      vz -= (GRAVITY + DRAG * v * vz) * dt;
    }
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    t += dt;
    apex = Math.max(apex, z);
    let stop = false;
    if (z <= 0) {
      z = 0;
      if (!bounces) stop = true;
      else if (Math.abs(vz) > 4) {
        vz = -vz * 0.42;
        vx *= 0.86;
        vy *= 0.86;
      } else {
        vz = 0;
        rolling = true;
      }
    }
    const dist = Math.hypot(x, y);
    if (spec.stopAt && dist >= spec.stopAt) stop = true;
    if (rolling && Math.hypot(vx, vy) < 6) stop = true;
    if (spec.kind === 'foul' && (t > 1.4 || y < CAMERA.y + 3)) stop = true;
    if (spec.kind === 'HR' && dist > 470) stop = true;
    if (stop || i % 4 === 0) points.push({ t, x, y, z });
    if (stop) break;
  }
  const last = points[points.length - 1];
  return { points, landing: { x: last.x, y: last.y }, apex, distance: Math.hypot(last.x, last.y), duration: last.t };
}

/** 비행 경로의 t초 위치. 점 사이는 직선 보간, 시작 전은 첫 점, 끝 뒤는 마지막 점 */
export function pathAt(points: readonly FlightPoint[], t: number): FlightPoint {
  if (t <= 0) return points[0];
  const last = points[points.length - 1];
  if (t >= last.t) return last;
  let i = 1;
  while (points[i].t < t) i += 1;
  const a = points[i - 1];
  const b = points[i];
  const u = (t - a.t) / (b.t - a.t);
  return { t, x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u) };
}
