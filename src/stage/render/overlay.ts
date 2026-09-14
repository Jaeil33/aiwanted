import { PITCH_CODE_LABEL } from '../../domain/events';
import type { Bases, PitchCode } from '../../types/domain';
import { BALL_R, BASES, CAMERA, MITT_Y, PLATE_Y, W, basePoint, clamp01, lerp, project, smooth } from '../math';
import type { FieldPoint, Projected, Vec3 } from '../math';
import { CHALK, INK } from './figures';
import type { StageBanner } from './types';

/* 경기장 위에 겹치는 그림: 스트라이크 존·공·미트·미니 다이아몬드·판정 태그·배너·불꽃·전광판 글자. */

/** 판정 태그가 떠 있는 시간(ms) */
export const CALL_MS = 1300;
/** 배너가 들어오는 시간(ms) */
export const BANNER_IN_MS = 240;
/** 배너가 사라지는 시간(ms) */
export const BANNER_OUT_MS = 360;
/** 불꽃이 남는 시간(ms) */
export const SPARK_MS = 1300;
/** 미트에 공이 꽂힐 때 고리가 퍼지는 시간(ms) */
export const POP_MS = 260;

/** 판정 색: 볼 초록, 스트라이크·헛스윙 노랑, 파울 회색, 타격 분필색 */
export const CALL_COLOR: Readonly<Record<PitchCode, string>> = {
  B: '#4FD37F',
  T: '#FFD34E',
  S: '#FFD34E',
  F: '#C9D2D8',
  X: '#EEF2E9',
};

/** 이번 타석 투구 위치 표시 */
export interface ZoneMarker {
  x: number;
  z: number;
  /** 몇 번째 공 */
  n: number;
  code: PitchCode;
}

export interface ZoneRect {
  tl: Projected;
  br: Projected;
}

/** 스트라이크 존(3×3 칸)과 번호 붙은 투구 위치. 존의 화면 사각형을 돌려준다 */
export function drawZone(
  g: CanvasRenderingContext2D,
  zone: { top: number; bottom: number },
  markers: readonly ZoneMarker[],
  ui: number,
): ZoneRect {
  const tl = project(-0.83, PLATE_Y, zone.top);
  const br = project(0.83, PLATE_Y, zone.bottom);
  g.fillStyle = 'rgba(238, 242, 233, 0.05)';
  g.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  g.strokeStyle = 'rgba(238, 242, 233, 0.16)';
  g.lineWidth = 1;
  for (let k = 1; k < 3; k++) {
    const x = lerp(tl.x, br.x, k / 3);
    const y = lerp(tl.y, br.y, k / 3);
    g.beginPath();
    g.moveTo(x, tl.y);
    g.lineTo(x, br.y);
    g.moveTo(tl.x, y);
    g.lineTo(br.x, y);
    g.stroke();
  }
  g.strokeStyle = 'rgba(238, 242, 233, 0.6)';
  g.lineWidth = 1.5;
  g.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  for (const m of markers) {
    const p = project(m.x, PLATE_Y, m.z);
    const r = 9 * Math.min(ui, 1.5);
    g.fillStyle = CALL_COLOR[m.code];
    g.globalAlpha = 0.9;
    g.beginPath();
    g.arc(p.x, p.y, r, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = INK;
    g.font = `600 ${Math.round(r * 1.1)}px "IBM Plex Sans KR", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(m.n), p.x, p.y + 0.5);
  }
  return { tl, br };
}

/** 공 잔상: 화면 [x, y, 반지름] 최근 9개 */
export type Trail = Array<[x: number, y: number, r: number]>;

/** 공(그림자·잔상·가까우면 실밥). 카메라에 너무 가깝거나 뒤에 있으면 그리지 않는다 */
export function drawBall(g: CanvasRenderingContext2D, w: Vec3, trail: Trail | null, reduced: boolean): void {
  if (w.y - CAMERA.y < 2) return;
  const p = project(w.x, w.y, w.z);
  const r = Math.max(1.4, BALL_R * p.s);
  if (w.z > 0.2 && w.z < 14) {
    const shadow = project(w.x, w.y, 0);
    g.fillStyle = 'rgba(0, 0, 0, 0.25)';
    g.beginPath();
    g.ellipse(shadow.x, shadow.y, r * 1.2, r * 0.4, 0, 0, Math.PI * 2);
    g.fill();
  }
  if (trail && !reduced) {
    trail.push([p.x, p.y, r]);
    if (trail.length > 9) trail.shift();
    trail.forEach(([x, y, tr], i) => {
      g.fillStyle = `rgba(238, 242, 233, ${(0.05 * (i + 1)).toFixed(2)})`;
      g.beginPath();
      g.arc(x, y, tr * (0.5 + i / 18), 0, Math.PI * 2);
      g.fill();
    });
  }
  g.fillStyle = '#F7F7F2';
  g.beginPath();
  g.arc(p.x, p.y, r, 0, Math.PI * 2);
  g.fill();
  if (r > 5) {
    g.strokeStyle = '#D0453F';
    g.lineWidth = Math.max(1, r * 0.12);
    g.beginPath();
    g.arc(p.x - r * 0.55, p.y, r * 0.7, -0.9, 0.9);
    g.stroke();
  }
}

/**
 * 포수 미트. 공이 꽂히면(withBall) 공을 그리고, 꽂힌 뒤 POP_MS 동안 고리가 퍼진다.
 * 프로토타입은 popAge < 0(꽂히기 전)에도 고리를 그려 반지름이 음수가 될 수 있었다 — arc가 예외를 던져 프레임 루프가 멈춘다.
 */
export function drawMitt(
  g: CanvasRenderingContext2D,
  loc: { x: number; z: number },
  withBall: boolean,
  popAge: number,
  reduced: boolean,
): void {
  const p = project(loc.x, MITT_Y, loc.z);
  const r = 0.55 * p.s;
  g.fillStyle = '#4E3320';
  g.beginPath();
  g.ellipse(p.x, p.y, r, r * 0.9, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#6E4A2E';
  g.beginPath();
  g.ellipse(p.x, p.y, r * 0.55, r * 0.5, 0, 0, Math.PI * 2);
  g.fill();
  if (withBall) {
    g.fillStyle = '#F7F7F2';
    g.beginPath();
    g.arc(p.x, p.y, r * 0.28, 0, Math.PI * 2);
    g.fill();
  }
  if (popAge >= 0 && popAge < POP_MS && !reduced) {
    g.strokeStyle = `rgba(255, 244, 214, ${(1 - popAge / POP_MS).toFixed(2)})`;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(p.x, p.y, r * (1 + popAge / 140), 0, Math.PI * 2);
    g.stroke();
  }
}

/** 주자 이동 진행률 u(0~1)의 위치(루 번호 실수 q)와 투명도. 아웃(to = −1)은 반 루만 가다 사라진다 */
export function runnerAt(move: { from: number; to: number }, u: number): { q: number; alpha: number } {
  if (move.to === -1) return { q: move.from + 0.5 * u, alpha: 1 - clamp01((u - 0.6) / 0.4) };
  return { q: move.from + (move.to - move.from) * u, alpha: 1 };
}

export interface MapRunner {
  /** 떠난 루(0 타자) */
  from: number;
  /** basePoint 루 번호 */
  q: number;
  alpha: number;
}

export interface MapView {
  fielders: readonly FieldPoint[];
  fielderColor: string;
  runnerColor: string;
  /** 루에 서 있는 주자(비트마스크). 움직이는 주자가 떠난 루는 비워 그린다 */
  occupied: Bases;
  runners: readonly MapRunner[];
  /** 날아가는 타구의 바닥 위치(ft) */
  ball: { x: number; y: number } | null;
}

/** 오른쪽 위 미니 다이아몬드: 수비 위치·주자·타구 */
export function drawMap(g: CanvasRenderingContext2D, view: MapView, ui: number): void {
  const ms = Math.min(1.6, ui);
  const w = 176 * ms;
  const h = 150 * ms;
  const x0 = W - 12 - w;
  const y0 = 12;
  const hx = x0 + w / 2;
  const hy = y0 + h - 12 * ms;
  const k = 0.3 * ms;
  const M = (x: number, y: number): [number, number] => [hx + x * k, hy - y * k];
  const shape = (pts: ReadonlyArray<readonly [number, number]>, fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    pts.forEach(([x, y], i) => {
      if (i) g.lineTo(...M(x, y));
      else g.moveTo(...M(x, y));
    });
    g.closePath();
    g.fill();
  };
  g.fillStyle = 'rgba(5, 11, 18, 0.86)';
  g.fillRect(x0, y0, w, h);
  g.strokeStyle = '#253B50';
  g.lineWidth = 1;
  g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
  const fan: Array<readonly [number, number]> = [[0, 0]];
  for (let deg = -45; deg <= 45; deg += 5) {
    fan.push([360 * Math.sin((deg * Math.PI) / 180), 360 * Math.cos((deg * Math.PI) / 180)]);
  }
  shape(fan, '#143B27');
  shape([[0, -6], [70, 63.6], [0, 134], [-70, 63.6]], '#5E4430');
  shape([[0, 14], [54, 63.6], [0, 113], [-54, 63.6]], '#24673F');
  g.fillStyle = view.fielderColor;
  for (const [fx, fy] of view.fielders) {
    g.beginPath();
    g.arc(...M(fx, fy), 3 * ms, 0, Math.PI * 2);
    g.fill();
  }
  for (let b = 1; b <= 3; b++) {
    const [bx, by] = M(BASES[b][0], BASES[b][1]);
    const on = ((view.occupied >> (b - 1)) & 1) === 1 && !view.runners.some((r) => r.from === b);
    g.save();
    g.translate(bx, by);
    g.rotate(Math.PI / 4);
    g.fillStyle = on ? view.runnerColor : CHALK;
    g.fillRect(-3.5 * ms, -3.5 * ms, 7 * ms, 7 * ms);
    g.restore();
  }
  if (view.ball) {
    g.setLineDash([3 * ms, 3 * ms]);
    g.strokeStyle = 'rgba(238, 242, 233, 0.6)';
    g.beginPath();
    g.moveTo(...M(0, 0));
    g.lineTo(...M(view.ball.x, view.ball.y));
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = CHALK;
    g.beginPath();
    g.arc(...M(view.ball.x, view.ball.y), 2.6 * ms, 0, Math.PI * 2);
    g.fill();
  }
  for (const r of view.runners) {
    const [rx, ry] = M(...basePoint(r.q));
    g.globalAlpha = r.alpha;
    g.fillStyle = view.runnerColor;
    g.strokeStyle = CHALK;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(rx, ry, 4 * ms, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.globalAlpha = 1;
  }
}

/** 판정 태그(볼·스트라이크·헛스윙·파울·타격) */
export interface CallTag {
  text: string;
  color: string;
  start: number;
}

export function callFor(code: PitchCode, start: number): CallTag {
  return { text: PITCH_CODE_LABEL[code], color: CALL_COLOR[code], start };
}

/** 스트라이크 존 오른쪽 위 판정 태그. age(ms)가 950을 넘으면 흐려지고 CALL_MS 뒤에는 그리지 않는다 */
export function drawCall(g: CanvasRenderingContext2D, call: CallTag, age: number, zone: ZoneRect, ui: number): void {
  if (age > CALL_MS) return;
  g.globalAlpha = age > 950 ? 1 - (age - 950) / 350 : 1;
  const size = Math.round(16 * Math.min(ui, 1.8));
  g.font = `700 ${size}px "IBM Plex Sans KR", sans-serif`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const tw = g.measureText(call.text).width;
  const x = zone.br.x + 14;
  const y = zone.tl.y + 12;
  g.fillStyle = call.color;
  g.fillRect(x, y - size * 0.8, tw + size, size * 1.6);
  g.fillStyle = INK;
  g.fillText(call.text, x + size / 2, y + 1);
  g.globalAlpha = 1;
}

/** 배너가 다 사라졌는지: hold 뒤 BANNER_OUT_MS가 지났다 */
export function bannerDone(age: number, hold: number): boolean {
  return age >= hold + BANNER_OUT_MS;
}

/** 경기장 가운데 결과 배너. 왼쪽에서 밀려 들어오고(BANNER_IN_MS) hold 뒤 사라진다(BANNER_OUT_MS) */
export function drawBanner(g: CanvasRenderingContext2D, banner: StageBanner, age: number, hold: number, ui: number): void {
  if (age < 0) return;
  const inU = clamp01(age / BANNER_IN_MS);
  const outU = clamp01((age - hold) / BANNER_OUT_MS);
  const alpha = Math.min(inU, 1 - outU);
  if (alpha <= 0) return;
  const big = banner.tone === 'big';
  const y = 262;
  const bandH = 104 * Math.min(ui, 1.7);
  g.save();
  g.globalAlpha = alpha;
  const band = g.createLinearGradient(0, 0, W, 0);
  const tone = big ? 'rgba(255, 181, 71, ' : 'rgba(6, 13, 21, ';
  band.addColorStop(0, `${tone}0)`);
  band.addColorStop(0.5, `${tone}0.88)`);
  band.addColorStop(1, `${tone}0)`);
  g.fillStyle = band;
  g.fillRect(0, y - bandH / 2, W, bandH);
  const dx = (1 - smooth(inU)) * -40;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const main = Math.round(56 * Math.min(ui, 1.7));
  g.font = `${main}px "Black Han Sans", "IBM Plex Sans KR", sans-serif`;
  g.lineJoin = 'round';
  g.lineWidth = main * 0.14;
  g.strokeStyle = big ? '#231503' : INK;
  const textY = y - (banner.sub ? main * 0.22 : 0);
  g.strokeText(banner.text, W / 2 + dx, textY);
  g.fillStyle = big ? '#FFF7E6' : CHALK;
  g.fillText(banner.text, W / 2 + dx, textY);
  if (banner.sub) {
    const sub = Math.round(19 * Math.min(ui, 1.7));
    g.font = `600 ${sub}px "IBM Plex Sans KR", sans-serif`;
    g.fillStyle = big ? '#231503' : '#AEBDB7';
    g.fillText(banner.sub, W / 2 + dx, y + main * 0.52);
  }
  g.restore();
}

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  start: number;
}

const SPARK_COLORS = ['#FFB547', '#FFF4D6', '#FF5C50', '#4FD37F'];

/** 홈런 불꽃 48개. 난수는 인자로 받는다 */
export function burst(x: number, y: number, now: number, random: () => number): Spark[] {
  const sparks: Spark[] = [];
  for (let i = 0; i < 48; i++) {
    const angle = random() * Math.PI * 2;
    const speed = 60 + random() * 170;
    sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 60,
      color: SPARK_COLORS[i % SPARK_COLORS.length],
      start: now,
    });
  }
  return sparks;
}

/** 불꽃: 중력을 받아 떨어지며 흐려진다 */
export function drawSparks(g: CanvasRenderingContext2D, sparks: readonly Spark[], now: number): void {
  for (const p of sparks) {
    const u = (now - p.start) / 1000;
    g.fillStyle = p.color;
    g.globalAlpha = 1 - u / 1.3;
    g.fillRect(p.x + p.vx * u, p.y + p.vy * u + 90 * u * u, 3, 3);
  }
  g.globalAlpha = 1;
}

/** 전광판 두 줄(LED 색) */
export function drawBoard(g: CanvasRenderingContext2D, lines: readonly [string, string]): void {
  g.fillStyle = '#FFB547';
  g.font = '22px "VT323", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(lines[0], 480, 81);
  g.fillText(lines[1], 480, 103);
}
