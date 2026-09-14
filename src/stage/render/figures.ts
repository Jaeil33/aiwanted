import type { PitchCode } from '../../types/domain';
import { BAT, BATTER_X, PITCHER_KEYS, W, poseAt, project } from '../math';
import type { BatterJoint, FieldPoint, Joint, PitcherJoint, Pose, PoseKey, Uniform } from '../math';

/* 투수·타자·야수 그림. 선수 얼굴·구단 로고는 그리지 않는다(ADR-005). */

export const SKIN = '#D6A583';
export const INK = '#08121C';
export const CHALK = '#EEF2E9';

type Point = readonly [number, number];
type ToScreen = (p: Point) => [number, number];

/** 관절 두 개를 잇는 둥근 선 */
function limb(g: CanvasRenderingContext2D, P: ToScreen, s: number) {
  return (p: Point, q: Point, w: number, color: string) => {
    const a = P(p);
    const c = P(q);
    g.strokeStyle = color;
    g.lineWidth = Math.max(1, w * s);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(c[0], c[1]);
    g.stroke();
  };
}

export interface PitcherLook {
  throws: 'L' | 'R';
  uniform: Uniform;
  /** 릴리스 전이라 손에 공을 쥐고 있는지 */
  holding: boolean;
}

/** 마운드 위 투수(정면). 좌투는 좌우를 뒤집는다. 던지는 손의 화면 위치를 돌려준다 */
export function drawPitcher(g: CanvasRenderingContext2D, pose: Pose<PitcherJoint>, look: PitcherLook): { x: number; y: number } {
  const mirror = look.throws === 'L';
  const a = project(0, 60.5, 0.83);
  const s = a.s;
  const P: ToScreen = (p) => [a.x + (mirror ? -p[0] : p[0]) * s, a.y - p[1] * s];
  const L = limb(g, P, s);
  const u = look.uniform;
  g.fillStyle = 'rgba(0, 0, 0, 0.3)';
  g.beginPath();
  g.ellipse(a.x, a.y + 1, 1.4 * s, 0.3 * s, 0, 0, Math.PI * 2);
  g.fill();
  L(pose.hipT, pose.knT, 0.44, u.pants);
  L(pose.knT, pose.ftT, 0.36, u.pants);
  L(pose.hipG, pose.knG, 0.44, u.pants);
  L(pose.knG, pose.ftG, 0.36, u.pants);
  g.fillStyle = INK;
  for (const foot of [pose.ftT, pose.ftG]) {
    const q = P(foot);
    g.beginPath();
    g.ellipse(q[0], q[1], 0.26 * s, 0.13 * s, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  [pose.shT, pose.shG, pose.hipG, pose.hipT].forEach((p, i) => {
    const q = P(p);
    if (i) g.lineTo(q[0], q[1]);
    else g.moveTo(q[0], q[1]);
  });
  g.closePath();
  g.fillStyle = u.jersey;
  g.fill();
  g.strokeStyle = u.trim;
  g.lineWidth = Math.max(1, 0.08 * s);
  g.stroke();
  L(pose.shG, pose.elG, 0.3, u.jersey);
  L(pose.elG, pose.haG, 0.25, SKIN);
  const glove = P(pose.haG);
  g.fillStyle = '#5A3A22';
  g.beginPath();
  g.arc(glove[0], glove[1], 0.34 * s, 0, Math.PI * 2);
  g.fill();
  const head = P(pose.head);
  g.fillStyle = SKIN;
  g.beginPath();
  g.arc(head[0], head[1], 0.36 * s, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = u.cap;
  g.beginPath();
  g.arc(head[0], head[1] - 0.05 * s, 0.38 * s, Math.PI, 0);
  g.fill();
  g.fillRect(head[0] - 0.42 * s, head[1] - 0.08 * s, 0.84 * s, 0.1 * s);
  L(pose.shT, pose.elT, 0.3, u.jersey);
  L(pose.elT, pose.haT, 0.25, SKIN);
  const hand = P(pose.haT);
  if (look.holding) {
    g.fillStyle = CHALK;
    g.beginPath();
    g.arc(hand[0], hand[1], Math.max(1.5, 0.13 * s), 0, Math.PI * 2);
    g.fill();
  }
  return { x: hand[0], y: hand[1] };
}

export interface BatterLook {
  bats: 'L' | 'R';
  uniform: Uniform;
}

/** 타석의 타자(옆모습, 홈플레이트 쪽을 본다). 우타는 3루 쪽, 좌타는 1루 쪽 타석 */
export function drawBatter(g: CanvasRenderingContext2D, pose: Pose<BatterJoint>, look: BatterLook): void {
  const mirror = look.bats === 'L';
  const a = project(mirror ? BATTER_X : -BATTER_X, 0.3, 0);
  const s = a.s;
  const P: ToScreen = (p) => [a.x + (mirror ? -p[0] : p[0]) * s, a.y - p[1] * s];
  const L = limb(g, P, s);
  const u = look.uniform;
  g.fillStyle = 'rgba(0, 0, 0, 0.28)';
  g.beginPath();
  g.ellipse(a.x, a.y, 1.6 * s, 0.35 * s, 0, 0, Math.PI * 2);
  g.fill();
  L(pose.hip, pose.knB, 0.52, u.pants);
  L(pose.knB, pose.ftB, 0.42, u.pants);
  L(pose.hip, pose.knF, 0.52, u.pants);
  L(pose.knF, pose.ftF, 0.42, u.pants);
  L(pose.neck, pose.hip, 1.0, u.jersey);
  L(pose.sh, pose.el, 0.34, u.jersey);
  L(pose.el, pose.ha, 0.27, SKIN);
  const rad = (pose.bat[0] * Math.PI) / 180;
  const dir = [Math.cos(rad), Math.sin(rad)] as const;
  const handle: Point = [pose.ha[0] + dir[0] * 1.1, pose.ha[1] + dir[1] * 1.1];
  const tip: Point = [pose.ha[0] + dir[0] * 2.85, pose.ha[1] + dir[1] * 2.85];
  L(pose.ha, handle, 0.11, '#B48A57');
  L(handle, tip, 0.23, '#C9A26B');
  const head = P(pose.head);
  g.fillStyle = SKIN;
  g.beginPath();
  g.arc(head[0], head[1], 0.4 * s, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = u.cap;
  g.beginPath();
  g.arc(head[0], head[1] - 0.04 * s, 0.44 * s, Math.PI * 0.95, Math.PI * 2.05);
  g.fill();
  const front = mirror ? -1 : 1;
  g.fillRect(Math.min(head[0], head[0] + front * 0.62 * s), head[1] - 0.1 * s, 0.62 * s, 0.1 * s);
  g.beginPath();
  g.arc(head[0] - front * 0.12 * s, head[1] + 0.12 * s, 0.2 * s, 0, Math.PI * 2);
  g.fill();
  L(pose.sh, pose.ha, 0.3, u.jersey);
}

/** 야수들(먼 쪽부터). 화면 밖으로 멀리 벗어난 야수는 건너뛴다 */
export function drawFielders(g: CanvasRenderingContext2D, fielders: readonly FieldPoint[], u: Uniform): void {
  const farFirst = [...fielders].sort((p, q) => q[1] - p[1]);
  for (const [x, y] of farFirst) {
    const foot = project(x, y, 0);
    if (foot.x < -30 || foot.x > W + 30) continue;
    const s = foot.s;
    g.strokeStyle = u.jersey;
    g.lineCap = 'round';
    g.lineWidth = Math.max(1.5, 0.9 * s);
    g.beginPath();
    g.moveTo(foot.x, foot.y - 0.9 * s);
    g.lineTo(foot.x, foot.y - 4.6 * s);
    g.stroke();
    g.fillStyle = u.cap;
    g.beginPath();
    g.arc(foot.x, foot.y - 5.4 * s, Math.max(1, 0.4 * s), 0, Math.PI * 2);
    g.fill();
  }
}

export interface SwingPlan {
  code: PitchCode;
  bats: 'L' | 'R';
  /** 연출 시작부터 릴리스까지(ms) */
  relMs: number;
  /** 연출 시작부터 공이 홈플레이트를 지날 때까지(ms) */
  plateMs: number;
  /** 슬로모션 배율 */
  slow: number;
  /** 홈플레이트를 지나는 공 위치(ft) */
  loc: { x: number; z: number };
}

/** 타자 키프레임(ms): 볼·루킹은 흘려보내고, 헛스윙·파울·타격은 공 쪽으로 배트를 휘두른다 */
export function batterKeys(a: SwingPlan): PoseKey<BatterJoint>[] {
  const swing = a.code === 'S' || a.code === 'F' || a.code === 'X';
  if (!swing) {
    return [
      { t: 0, j: BAT.stance },
      { t: a.relMs, j: BAT.load },
      { t: a.plateMs, j: BAT.take },
      { t: a.plateMs + 700, j: BAT.stance },
    ];
  }
  const swingMs = 330 * a.slow;
  const mirror = a.bats === 'L';
  const handX = mirror ? BATTER_X - 0.75 : -BATTER_X + 0.75;
  const dx = mirror ? handX - a.loc.x : a.loc.x - handX;
  let theta = (Math.atan2(a.loc.z - 3.95, dx) * 180) / Math.PI;
  if (a.code === 'S') theta += 14;
  const contact: Readonly<Record<BatterJoint, Joint>> = { ...BAT.contact, bat: [theta, 0] };
  return [
    { t: 0, j: BAT.stance },
    { t: a.relMs, j: BAT.load },
    { t: Math.max(a.relMs + 1, a.plateMs - swingMs), j: BAT.stride },
    { t: a.plateMs, j: contact },
    { t: a.plateMs + 240, j: BAT.follow },
    { t: a.plateMs + 1100, j: BAT.follow },
    { t: a.plateMs + 1700, j: BAT.stance },
  ];
}

/** 공을 기다리는 투수: 발은 두고 몸이 숨 쉬듯 오르내린다(동작 줄이기면 멈춤) */
export function idlePitcherPose(now: number, reduced: boolean): Pose<PitcherJoint> {
  const pose = poseAt(PITCHER_KEYS, 0);
  if (reduced) return pose;
  const bob = Math.sin(now / 700) * 0.03;
  for (const name of Object.keys(pose) as PitcherJoint[]) {
    if (name !== 'ftT' && name !== 'ftG') pose[name][1] += bob;
  }
  return pose;
}

/** 공을 기다리는 타자: 배트를 까딱인다(동작 줄이기면 멈춤) */
export function idleBatterPose(now: number, reduced: boolean): Pose<BatterJoint> {
  const pose = poseAt<BatterJoint>([{ t: 0, j: BAT.stance }], 0);
  if (!reduced) pose.bat[0] += Math.sin(now / 420) * 5;
  return pose;
}
