/* 투수·타자 자세 키프레임과 보간(순수 계산). 관절 좌표는 발 기준 ft. */

export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
export const clamp01 = (u: number): number => Math.max(0, Math.min(1, u));
/** smoothstep: 양 끝에서 속도가 0인 보간 계수 */
export const smooth = (u: number): number => u * u * (3 - 2 * u);

/** 관절 [x, y](ft). 타자의 bat만 [배트 각도(도), 0]이다 */
export type Joint = readonly [number, number];
/** poseAt이 돌려주는 자세. 매번 새 배열이라 고쳐 써도 된다 */
export type Pose<K extends string = string> = Record<K, [number, number]>;

export interface PoseKey<K extends string = string> {
  /** 키 시각: 투수는 투구 동작 비율(0~1.5), 타자는 ms */
  readonly t: number;
  readonly j: Readonly<Record<K, Joint>>;
}

/** 투수 정면 관절: T는 던지는 팔 쪽(−x), G는 글러브 쪽(+x) */
export type PitcherJoint =
  | 'head' | 'neck' | 'shT' | 'shG' | 'elT' | 'elG' | 'haT' | 'haG'
  | 'hipT' | 'hipG' | 'knT' | 'knG' | 'ftT' | 'ftG';
/** 타자 옆모습 관절: B는 뒷다리, F는 앞다리, bat은 배트 각도 */
export type BatterJoint = 'head' | 'neck' | 'sh' | 'el' | 'ha' | 'hip' | 'knB' | 'knF' | 'ftB' | 'ftF' | 'bat';
export type BatPoseName = 'stance' | 'load' | 'stride' | 'contact' | 'follow' | 'take';

function copyPose<K extends string>(j: Readonly<Record<K, Joint>>): Pose<K> {
  const out = {} as Pose<K>;
  for (const name of Object.keys(j) as K[]) out[name] = [j[name][0], j[name][1]];
  return out;
}

/** 키프레임 사이를 smoothstep으로 보간한 자세. 첫 키 앞은 첫 키, 마지막 키 뒤는 마지막 키 */
export function poseAt<K extends string = string>(keys: readonly PoseKey<K>[], t: number): Pose<K> {
  if (t <= keys[0].t) return copyPose(keys[0].j);
  const last = keys[keys.length - 1];
  if (t >= last.t) return copyPose(last.j);
  let i = 0;
  while (t > keys[i + 1].t) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  const e = smooth((t - a.t) / (b.t - a.t));
  const out = {} as Pose<K>;
  for (const name of Object.keys(a.j) as K[]) {
    const p = a.j[name];
    const q = b.j[name];
    out[name] = [p[0] + (q[0] - p[0]) * e, p[1] + (q[1] - p[1]) * e];
  }
  return out;
}

// ---------- 투수 (정면, 던지는 팔이 −x) ----------
export const PITCHER_SET: Readonly<Record<PitcherJoint, Joint>> = { head: [0, 5.75], neck: [0, 5.25], shT: [-0.72, 5.0], shG: [0.72, 5.0], elT: [-0.62, 4.25], elG: [0.62, 4.25], haT: [-0.12, 4.35], haG: [0.12, 4.4], hipT: [-0.42, 3.15], hipG: [0.42, 3.15], knT: [-0.5, 1.6], knG: [0.5, 1.6], ftT: [-0.55, 0], ftG: [0.55, 0] };
/** 투구 동작 중 공을 놓는 비율 */
export const RELEASE_AT = 0.76;
/** 슬로모션 투구 동작 길이(ms) */
export const DELIVERY_MS = 1650;
export const PITCHER_KEYS: readonly PoseKey<PitcherJoint>[] = [
  { t: 0, j: PITCHER_SET },
  { t: 0.32, j: { head: [0.05, 5.8], neck: [0.05, 5.3], shT: [-0.55, 5.05], shG: [0.6, 5.05], elT: [-0.45, 4.35], elG: [0.55, 4.4], haT: [0, 4.55], haG: [0.12, 4.6], hipT: [-0.35, 3.2], hipG: [0.35, 3.25], knT: [-0.42, 1.65], knG: [0.55, 3.45], ftT: [-0.5, 0], ftG: [0.3, 2.35] } },
  { t: 0.62, j: { head: [0.15, 5.4], neck: [0.12, 4.95], shT: [-0.75, 4.75], shG: [0.85, 4.85], elT: [-1.25, 5.05], elG: [1.2, 4.7], haT: [-1.45, 6.0], haG: [1.55, 4.5], hipT: [-0.5, 2.75], hipG: [0.45, 2.75], knT: [-0.75, 1.3], knG: [0.95, 1.35], ftT: [-0.75, 0.05], ftG: [1.05, -0.7] } },
  { t: RELEASE_AT, j: { head: [0.02, 4.95], neck: [0, 4.5], shT: [-0.72, 4.35], shG: [0.78, 4.3], elT: [-0.95, 5.1], elG: [0.95, 3.85], haT: [-0.62, 5.75], haG: [0.7, 3.6], hipT: [-0.45, 2.55], hipG: [0.45, 2.55], knT: [-0.75, 1.45], knG: [0.9, 1.1], ftT: [-0.55, 0.55], ftG: [1.05, -0.7] } },
  { t: 0.92, j: { head: [0.35, 4.35], neck: [0.3, 3.95], shT: [-0.4, 3.85], shG: [0.95, 3.75], elT: [0.25, 3.2], elG: [1.2, 3.35], haT: [0.85, 2.35], haG: [1.15, 2.95], hipT: [-0.35, 2.35], hipG: [0.5, 2.35], knT: [-0.9, 1.9], knG: [0.95, 1.0], ftT: [-1.25, 2.5], ftG: [1.05, -0.7] } },
  { t: 1.05, j: { head: [0.3, 4.9], neck: [0.26, 4.45], shT: [-0.5, 4.3], shG: [0.9, 4.25], elT: [0, 3.6], elG: [1.05, 3.7], haT: [0.5, 3.1], haG: [1.0, 3.3], hipT: [-0.4, 2.7], hipG: [0.5, 2.7], knT: [-0.8, 1.3], knG: [0.95, 1.2], ftT: [-0.9, 0.3], ftG: [1.05, -0.5] } },
  { t: 1.5, j: PITCHER_SET },
];

// ---------- 타자 (옆모습, 홈플레이트 쪽이 +x) ----------
export const BAT: Readonly<Record<BatPoseName, Readonly<Record<BatterJoint, Joint>>>> = {
  stance: { head: [-0.05, 5.6], neck: [-0.1, 5.15], sh: [-0.2, 4.9], el: [-0.75, 4.55], ha: [-0.55, 5.0], hip: [-0.1, 3.05], knB: [-0.75, 1.55], knF: [0.55, 1.55], ftB: [-0.95, 0], ftF: [0.85, 0], bat: [115, 0] },
  load: { head: [-0.15, 5.55], neck: [-0.2, 5.1], sh: [-0.3, 4.85], el: [-0.95, 4.5], ha: [-0.85, 5.05], hip: [-0.25, 3.0], knB: [-0.8, 1.5], knF: [0.35, 1.8], ftB: [-0.95, 0], ftF: [0.65, 0.25], bat: [125, 0] },
  stride: { head: [0.05, 5.45], neck: [0, 5.0], sh: [-0.1, 4.75], el: [-0.8, 4.4], ha: [-0.75, 4.9], hip: [0, 2.9], knB: [-0.8, 1.4], knF: [0.9, 1.45], ftB: [-0.95, 0], ftF: [1.35, 0], bat: [135, 0] },
  contact: { head: [0.15, 5.4], neck: [0.12, 4.95], sh: [0.2, 4.6], el: [0.35, 3.95], ha: [0.75, 3.95], hip: [0.15, 2.85], knB: [-0.55, 1.2], knF: [1.0, 1.5], ftB: [-0.75, 0.2], ftF: [1.35, 0], bat: [-25, 0] },
  follow: { head: [0.1, 5.45], neck: [0.05, 5.0], sh: [0.05, 4.75], el: [0.5, 4.9], ha: [0.35, 5.2], hip: [0.1, 2.9], knB: [-0.45, 1.35], knF: [0.95, 1.5], ftB: [-0.55, 0.45], ftF: [1.35, 0], bat: [160, 0] },
  take: { head: [-0.05, 5.55], neck: [-0.1, 5.1], sh: [-0.2, 4.85], el: [-0.85, 4.5], ha: [-0.7, 5.0], hip: [-0.05, 3.0], knB: [-0.8, 1.5], knF: [0.8, 1.5], ftB: [-0.95, 0], ftF: [1.1, 0], bat: [122, 0] },
};
/** 타자가 서는 홈플레이트 중심에서의 거리(ft) */
export const BATTER_X = 2.9;
