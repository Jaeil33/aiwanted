import type { PitchRow } from '../types/data';
import type { Bases, PitchCode } from '../types/domain';
import { TRACK_Y0, ballRadiusPx, pitchAt, seamAngle, timeToY } from './math/pitch';
import { mixHex, rgbaOf, skyPalette, type SkyKind, type SkyPalette } from './math/sky';

/*
 * 포수 뒤 시점 투구 트래커(ADR-018, 시안 docs/design/broadcast/tracker.mjs 이식).
 * 캔버스는 경기장·존·궤적·번호 원만 그린다. 콜·결과 글자는 DOM이 맡는다. 시계·프레임·오프스크린 캔버스는 deps로 주입한다.
 * 카메라는 시안(30ft 뒤·4.6ft 망원)과 달리 포수 눈높이다. 시안 카메라는 공이 존보다 존 높이만큼 위, 관중석 쪽에서 떨어져 보였다.
 *
 * 배경 색은 `math/sky.ts`의 네 통(낮·해질녘·밤·돔)에서 오고, 홈팀 색을 관중석·펜스에 옅게 섞는다(21-pitch-stage step 2).
 */

/** 이 반지름(px) 아래에서는 실밥을 안 그린다 */
const SEAM_MIN_R = 4;
const SEAM_COLOR = '#c8342f';
/** 홈팀 색을 관중석에 섞는 비율. 알아채기 전에 느껴지는 정도 */
const HOME_TINT = 0.16;
/** 외야 펜스는 더 진하게 물든다 */
const FENCE_TINT = 0.3;

/** 존 판정 면: 홈플레이트 앞면(ft) */
export const PLATE_FRONT_Y = 1.417;
const HALF_PLATE = 0.708;
/** 포수 눈높이 카메라(ft): 홈플레이트 10ft 뒤, 높이 4ft. 공이 투수 손에서 작게 나와 커지며 날아온다 */
const CAM = { y: -10, z: 4 };
/**
 * 아래 자막이 가리는 높이(px). 존 아래 끝은 이 위에 둔다.
 * 이 값이 곧 화면 크기다 — 120이던 것을 두 줄 자막으로 줄여 64로 낮췄고, 그것만으로
 * 초점거리 f가 516 → 744, 홈플레이트 통과 지점의 1ft가 45px → 65px이 됐다(21-pitch-stage step 1).
 */
export const CAPTION_PX = 64;
/** 가운데 외야 뒤 어두운 백스크린(ft): 낮은 카메라에서 투수 손은 지평선 위라 관중석 대신 이 판 앞에 보여야 한다 */
export const BACKSCREEN = { y: 400, halfWidth: 45, top: 40 };
/** 캔버스 위 여백(높이 비율)과, 그 안에 보여야 하는 가장 높은 릴리스 높이(ft) */
const TOP_MARGIN = 0.1;
const RELEASE_Z_MAX = 6.3;

export interface TrackerFrame {
  /** 초점 거리(px) */
  f: number;
  cx: number;
  /** 지평선 높이(px) */
  cy: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** 그 깊이에서 1ft가 몇 px인지 */
  s: number;
}

/**
 * 캔버스 크기에 맞춘 구도: 홈플레이트 폭은 캔버스 폭의 27%, 지평선은 높이의 14%(시안).
 * 존 아래 끝이 자막 위에 오도록 지평선을 올리되 투수 손(55ft, 6.3ft)은 위 여백 안에 남긴다. 높이가 모자라면 f를 줄여 둘 다 담는다.
 */
export function frameTracker(width: number, height: number, zoneBottom: number): TrackerFrame {
  const plateD = PLATE_FRONT_Y - CAM.y;
  const releaseD = TRACK_Y0 - CAM.y;
  const top = height * TOP_MARGIN;
  const bottom = height - CAPTION_PX;
  // f 1당 투수 손부터 존 아래 끝까지 화면 높이
  const span = (CAM.z - zoneBottom) / plateD - (CAM.z - RELEASE_Z_MAX) / releaseD;
  const f = Math.min((width * 0.27 * plateD) / (2 * HALF_PLATE), Math.max(bottom - top, 1) / span);
  const cy = Math.max(Math.min(height * 0.14, bottom - ((CAM.z - zoneBottom) * f) / plateD), top - ((CAM.z - RELEASE_Z_MAX) * f) / releaseD);
  return { f, cx: width / 2, cy };
}

/** 경기장 좌표(ft)를 구도 위 화면 좌표(px)로. 카메라 바로 앞(0.25ft 이내)은 null */
export function projectOnFrame(frame: TrackerFrame, x: number, y: number, z: number): ScreenPoint | null {
  const d = y - CAM.y;
  if (d <= 0.25) return null;
  const s = frame.f / d;
  return { x: frame.cx + x * s, y: frame.cy - (z - CAM.z) * s, s };
}

/** 궤적 시간 1초를 몇 ms로 그리나: 보통 1배, 느린 공 2.4배(UI_GUIDE 움직임) */
const MS_NORMAL = 1000;
const MS_SLOW = 2400;

/** 구종 색(PITCH_TYPES 순서: 직구·투심·커터·슬라이더·스위퍼·커브·체인지업·포크·기타) */
export const PITCH_COLORS: readonly string[] = ['#EF4444', '#F97316', '#C2703A', '#FACC15', '#E0A93B', '#38BDF8', '#34D399', '#2DD4BF', '#94A3B8'];
/** 콜 색: 볼 초록, 스트라이크·파울 주황, 인플레이 파랑 */
export const CALL_COLORS: Record<PitchCode, string> = { B: '#2FD27A', T: '#FFB020', S: '#FFB020', F: '#FFB020', X: '#4DA3FF' };

export interface TrackerDeps {
  now(): number;
  requestFrame(cb: (t: number) => void): number;
  cancelFrame(id: number): void;
  createCanvas(width: number, height: number): HTMLCanvasElement;
  /** 동작 줄이기: 궤적 없이 최종 번호 원만 */
  reducedMotion?: boolean;
}

export interface Tracker {
  resize(cssWidth: number, cssHeight: number, dpr?: number): void;
  setBases(bases: Bases): void;
  setZone(top: number, bottom: number): void;
  /** 하늘과 홈팀 색. 배경을 다시 굽는다 */
  setSky(kind: SkyKind, home: string): void;
  /** 연출 없이 번호 원을 더한다(실제 투구 미리 찍기) */
  mark(row: PitchRow, n: number, code: PitchCode): void;
  /** 궤적을 날리고 끝나면 번호 원을 남긴다. 던지는 중에 부르면 앞 공은 바로 끝낸다 */
  throwPitch(row: PitchRow, n: number, code: PitchCode, opts?: { slow?: boolean }): Promise<void>;
  skip(): void;
  reset(): void;
  destroy(): void;
  inspect(): { busy: boolean; markers: number };
}

/** 홈플레이트 앞면을 지나는 시각(초)과 그때의 x·z(ft) */
export function plateLocation(row: PitchRow): { t: number; x: number; z: number } {
  const t = timeToY(row, PLATE_FRONT_Y);
  const p = pitchAt(row, t);
  return { t, x: p.x, z: p.z };
}

interface Marker {
  x: number;
  z: number;
  n: number;
  color: string;
}

interface Trail {
  row: PitchRow;
  t: number;
  /** 홈플레이트 앞면에 닿는 시각(초). t / tEnd가 비행 진행도다 */
  tEnd: number;
  color: string;
  done: boolean;
}

type Ctx = CanvasRenderingContext2D;
type Pt = { x: number; y: number; s: number };

export function createTracker(canvas: HTMLCanvasElement, deps: TrackerDeps): Tracker {
  const g = canvas.getContext('2d') as Ctx | null;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let view: TrackerFrame = { f: 1, cx: 0, cy: 0 };
  let backdrop: HTMLCanvasElement | null = null;
  let bases: Bases = 0;
  let sky: SkyPalette = skyPalette('night');
  let homeColor = '#ffffff';
  let zone = { top: 3.4, bottom: 1.6 };
  const markers: Marker[] = [];
  let trail: Trail | null = null;
  let frame = 0;
  let pending: { finish(): void } | null = null;

  const project = (x: number, y: number, z: number): Pt | null => projectOnFrame(view, x, y, z);

  const groundPts = (pts: Array<[number, number]>) => pts.map(([x, y]) => project(x, y, 0)).filter((p): p is Pt => p !== null);

  function arc(x0: number, y0: number, r: number, a0 = 0, a1 = Math.PI * 2, n = 72): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push([x0 + r * Math.sin(a), y0 + r * Math.cos(a)]);
    }
    return out;
  }

  function poly(c: Ctx, pts: Array<Pt | null>, fill: string | CanvasGradient | null, stroke: string | null = null, width = 1) {
    const ok = pts.filter((p): p is Pt => p !== null);
    if (ok.length < 2) return;
    c.beginPath();
    c.moveTo(ok[0].x, ok[0].y);
    for (let i = 1; i < ok.length; i++) c.lineTo(ok[i].x, ok[i].y);
    c.closePath();
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
    }
  }

  function paintBackdrop(): HTMLCanvasElement | null {
    const off = deps.createCanvas(canvas.width, canvas.height);
    off.width = canvas.width;
    off.height = canvas.height;
    const c = off.getContext('2d') as Ctx | null;
    if (!c) return null;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    const wallTop = Math.max(14, project(0, 400, 11)?.y ?? 14);
    const wallBottom = Math.max(wallTop + 6, project(0, 400, 0)?.y ?? wallTop + 6);

    // 관중석: 하늘 → 관중석 위 → 관중석 아래(홈팀 색을 옅게). 그 위에 흐린 관중 질감
    const stands = mixHex(sky.standsBottom, homeColor, HOME_TINT);
    let grd = c.createLinearGradient(0, 0, 0, wallTop);
    grd.addColorStop(0, sky.skyTop);
    grd.addColorStop(0.42, sky.standsTop);
    grd.addColorStop(1, stands);
    c.fillStyle = grd;
    c.fillRect(0, 0, W, wallTop);
    const crowd = deps.createCanvas(Math.max(1, Math.round(W)), Math.max(1, Math.round(wallTop)));
    crowd.width = Math.max(1, Math.round(W));
    crowd.height = Math.max(1, Math.round(wallTop));
    const cc = crowd.getContext('2d') as Ctx | null;
    if (cc) {
      let seed = 11;
      const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 1400; i++) {
        const y = rand() * wallTop;
        const depth = y / wallTop;
        const tone = sky.crowd[Math.min(sky.crowd.length - 1, Math.floor(rand() * sky.crowd.length))];
        cc.fillStyle = `rgba(${tone},${(sky.crowdAlpha * (0.25 + depth * 0.75)).toFixed(3)})`;
        cc.fillRect(rand() * W, y, 1.4 + depth * 1.2, 1.4 + depth * 1.2);
      }
      c.filter = 'blur(0.6px)';
      c.drawImage(crowd, 0, 0, W, wallTop);
      c.filter = 'none';
    }
    for (let i = 1; i < 7; i++) {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(0, wallTop - i * 13, W, 1.5);
    }
    const eyeTopLeft = project(-BACKSCREEN.halfWidth, BACKSCREEN.y, BACKSCREEN.top);
    const eyeBottomRight = project(BACKSCREEN.halfWidth, BACKSCREEN.y, 0);
    if (eyeTopLeft && eyeBottomRight) {
      c.fillStyle = mixHex('#030806', sky.fence, 0.55);
      c.fillRect(eyeTopLeft.x, eyeTopLeft.y, eyeBottomRight.x - eyeTopLeft.x, eyeBottomRight.y - eyeTopLeft.y);
    }
    // 조명탑 번짐. 낮에는 glow가 0이라 아예 안 그린다
    if (sky.glow > 0) {
      for (const lx of [W * 0.06, W * 0.94]) {
        const rg = c.createRadialGradient(lx, -10, 0, lx, -10, W * 0.75);
        rg.addColorStop(0, rgbaOf(sky.light, 0.18 * sky.glow));
        rg.addColorStop(1, rgbaOf(sky.light, 0));
        c.fillStyle = rg;
        c.fillRect(0, 0, W, H);
      }
    }

    // 외야 펜스와 홈런 라인. 펜스에도 홈팀 색을 섞는다
    c.fillStyle = mixHex(sky.fence, homeColor, FENCE_TINT);
    c.fillRect(0, wallTop, W, wallBottom - wallTop);
    c.fillStyle = 'rgba(255,210,63,0.6)';
    c.fillRect(0, wallTop, W, 1);

    // 잔디와 깊이 방향 줄무늬
    grd = c.createLinearGradient(0, wallBottom, 0, H);
    grd.addColorStop(0, sky.grassTop);
    grd.addColorStop(0.45, sky.grassMid);
    grd.addColorStop(1, sky.grassBottom);
    c.fillStyle = grd;
    c.fillRect(0, wallBottom, W, H - wallBottom);
    for (let d = 24, k = 0; d < 400; d += 22, k++) {
      if (k % 2) continue;
      const near = project(0, d, 0);
      const far = project(0, d + 22, 0);
      if (!near || !far) continue;
      c.fillStyle = 'rgba(255,255,255,0.028)';
      c.fillRect(0, far.y, W, near.y - far.y);
    }

    // 내야 흙 호·베이스 길
    const dirt = sky.dirt;
    poly(c, groundPts([...arc(0, 60.5, 95, -1.25, 1.25), ...arc(0, 60.5, 79, 1.25, -1.25)]), dirt);
    for (const sx of [-1, 1]) {
      poly(c, groundPts([[sx * 1.5, 2], [sx * 64.5, 62], [sx * 62, 65], [sx * -0.5, 4]]), dirt);
    }
    // 마운드·투수판
    const moundCenter = project(0, 60.5, 0);
    if (moundCenter) {
      const mound = c.createRadialGradient(view.cx, moundCenter.y, 0, view.cx, moundCenter.y, moundCenter.s * 2.7);
      mound.addColorStop(0, sky.moundTop);
      mound.addColorStop(1, sky.dirt);
      poly(c, groundPts(arc(0, 60.5, 9)), mound);
    }
    const chalk = `rgba(245,245,240,${sky.chalk})`;
    poly(c, [project(-1, 60.5, 0.83), project(1, 60.5, 0.83), project(1, 61, 0.83), project(-1, 61, 0.83)], chalk);
    // 홈 흙 원
    poly(c, groundPts(arc(0, 0, 13).filter(([, y]) => y > CAM.y + 0.6)), mixHex(sky.dirt, '#ffffff', 0.04));

    // 파울 라인·베이스
    c.lineCap = 'round';
    for (const sx of [-1, 1]) {
      const a = project(sx * 0.9, 0.9, 0);
      const b = project(sx * 240, 240, 0);
      if (!a || !b) continue;
      c.strokeStyle = `rgba(245,245,240,${(sky.chalk * 0.85).toFixed(2)})`;
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
    for (const [bx, by] of [[63.6, 63.6], [0, 127.3], [-63.6, 63.6]] as const) {
      poly(c, groundPts([[bx, by - 1], [bx + 1, by], [bx, by + 1], [bx - 1, by]]), chalk);
    }

    // 타석 박스·홈플레이트
    for (const sx of [-1, 1]) {
      poly(c, groundPts([[sx * 1.25, -2.4], [sx * 5.25, -2.4], [sx * 5.25, 3.6], [sx * 1.25, 3.6]]), null, `rgba(245,245,240,${(sky.chalk * 0.6).toFixed(2)})`, 1.4);
    }
    poly(c, groundPts([[-HALF_PLATE, PLATE_FRONT_Y], [HALF_PLATE, PLATE_FRONT_Y], [HALF_PLATE, 0.708], [0, 0], [-HALF_PLATE, 0.708]]), '#efeee8');

    // 비네트
    const vg = c.createRadialGradient(W / 2, H * 0.42, H * 0.25, W / 2, H * 0.5, H * 0.9);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${sky.vignette})`);
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);
    return off;
  }

  function drawRunners(c: Ctx) {
    for (const [bx, by, bit] of [[63.6, 63.6, 1], [0, 127.3, 2], [-63.6, 63.6, 4]] as const) {
      if (!(bases & bit)) continue;
      const p = project(bx, by, 0);
      if (!p) continue;
      c.fillStyle = 'rgba(255,210,63,0.22)';
      c.beginPath();
      c.arc(p.x, p.y - 3, 9, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ffd23f';
      c.beginPath();
      c.arc(p.x, p.y - 3, 3.6, 0, Math.PI * 2);
      c.fill();
    }
  }

  function drawZone(c: Ctx) {
    const tl = project(-HALF_PLATE, PLATE_FRONT_Y, zone.top);
    const br = project(HALF_PLATE, PLATE_FRONT_Y, zone.bottom);
    if (!tl || !br) return;
    const w = br.x - tl.x;
    const h = br.y - tl.y;
    c.fillStyle = 'rgba(255,255,255,0.045)';
    c.fillRect(tl.x, tl.y, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.16)';
    c.lineWidth = 1;
    c.beginPath();
    for (const k of [1, 2]) {
      c.moveTo(tl.x + (w * k) / 3, tl.y);
      c.lineTo(tl.x + (w * k) / 3, br.y);
      c.moveTo(tl.x, tl.y + (h * k) / 3);
      c.lineTo(br.x, tl.y + (h * k) / 3);
    }
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 1.5;
    c.strokeRect(tl.x, tl.y, w, h);
  }

  function drawTrail(c: Ctx, tr: Trail) {
    const n = 32;
    let prev: Pt | null = null;
    for (let i = 0; i <= n; i++) {
      const p3 = pitchAt(tr.row, (tr.t * i) / n);
      const p = project(p3.x, p3.y, p3.z);
      if (prev && p) {
        const k = i / n;
        c.strokeStyle = tr.color;
        c.globalAlpha = (tr.done ? 0.38 : 0.85) * (0.15 + 0.85 * k);
        c.lineWidth = Math.max(1, ballRadiusPx(p.s) * 1.3 * k);
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(prev.x, prev.y);
        c.lineTo(p.x, p.y);
        c.stroke();
      }
      prev = p;
    }
    c.globalAlpha = 1;
    if (tr.done) return;
    const b3 = pitchAt(tr.row, tr.t);
    const shadow = project(b3.x, b3.y, 0);
    const ball = project(b3.x, b3.y, b3.z);
    if (!shadow || !ball) return;
    const r = ballRadiusPx(ball.s);
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath();
    c.ellipse(shadow.x, shadow.y, r * 1.1, r * 0.35, 0, 0, Math.PI * 2);
    c.fill();

    // 조명 아래 빛무리. 낮에는 glow가 0이라 안 그린다
    if (sky.glow > 0) {
      const halo = c.createRadialGradient(ball.x, ball.y, r * 0.7, ball.x, ball.y, r * 2.4);
      halo.addColorStop(0, rgbaOf(sky.light, 0.3 * sky.glow));
      halo.addColorStop(1, rgbaOf(sky.light, 0));
      c.fillStyle = halo;
      c.beginPath();
      c.arc(ball.x, ball.y, r * 2.4, 0, Math.PI * 2);
      c.fill();
    }

    const bg = c.createRadialGradient(ball.x - r * 0.35, ball.y - r * 0.35, r * 0.1, ball.x, ball.y, r);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(1, '#d9d6cc');
    c.fillStyle = bg;
    c.beginPath();
    c.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    c.fill();
    drawSeams(c, ball.x, ball.y, r, tr);
  }

  /*
   * 실밥 두 줄. 이게 있어야 공이 "움직이는 점"이 아니라 "날아오는 물체"가 된다.
   * 각도는 구종에서 지어낸 회전이다(seamAngle) — 기록에 회전축이 없다.
   * 너무 작으면 진흙이 되므로 반지름 4px 아래에서는 안 그린다.
   */
  function drawSeams(c: Ctx, x: number, y: number, r: number, tr: Trail) {
    if (r < SEAM_MIN_R) return;
    const angle = seamAngle(tr.row[0], tr.tEnd > 0 ? tr.t / tr.tEnd : 0);
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.clip();
    c.strokeStyle = SEAM_COLOR;
    c.lineWidth = Math.max(1, r * 0.17);
    c.lineCap = 'round';
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.arc(sx * r * 1.15, 0, r * 1.35, sx > 0 ? Math.PI - 0.72 : -0.72, sx > 0 ? Math.PI + 0.72 : 0.72);
      c.stroke();
    }
    c.restore();
  }

  function drawMarkers(c: Ctx) {
    markers.forEach((m, index) => {
      const p = project(m.x, PLATE_FRONT_Y, m.z);
      if (!p) return;
      const last = index === markers.length - 1;
      const r = 10;
      c.fillStyle = m.color;
      c.globalAlpha = last ? 1 : 0.72;
      c.beginPath();
      c.arc(p.x, p.y, r, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
      c.strokeStyle = 'rgba(5,7,10,0.9)';
      c.lineWidth = 2;
      c.stroke();
      c.fillStyle = '#05070a';
      c.font = '800 12px "Barlow Semi Condensed", "Noto Sans KR", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(m.n), p.x, p.y + 0.5);
    });
  }

  function draw() {
    if (!g || !W) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (backdrop) g.drawImage(backdrop, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawRunners(g);
    drawZone(g);
    if (trail) drawTrail(g, trail);
    drawMarkers(g);
  }

  function addMarker(row: PitchRow, n: number, code: PitchCode) {
    const loc = plateLocation(row);
    markers.push({ x: loc.x, z: loc.z, n, color: CALL_COLORS[code] ?? CALL_COLORS.X });
  }

  return {
    setSky(kind, home) {
      if (sky.kind === kind && homeColor === home) return;
      sky = skyPalette(kind);
      homeColor = home;
      backdrop = g && W > 0 ? paintBackdrop() : null;
      draw();
    },
    resize(cssWidth, cssHeight, ratio = 1) {
      dpr = Math.min(Math.max(ratio, 1), 2);
      W = cssWidth;
      H = cssHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      view = frameTracker(W, H, zone.bottom);
      backdrop = g ? paintBackdrop() : null;
      draw();
    },
    setBases(next) {
      bases = next;
      draw();
    },
    setZone(top, bottom) {
      zone = { top, bottom };
      draw();
    },
    mark(row, n, code) {
      addMarker(row, n, code);
      draw();
    },
    throwPitch(row, n, code, opts = {}) {
      pending?.finish();
      return new Promise<void>((resolve) => {
        const tEnd = timeToY(row, PLATE_FRONT_Y);
        const color = PITCH_COLORS[row[0]] ?? PITCH_COLORS[8];
        const duration = !g || deps.reducedMotion ? 0 : tEnd * (opts.slow ? MS_SLOW : MS_NORMAL);
        let start: number | null = null;
        const finish = () => {
          if (frame) deps.cancelFrame(frame);
          frame = 0;
          pending = null;
          addMarker(row, n, code);
          trail = { row, t: tEnd, tEnd, color, done: true };
          draw();
          resolve();
        };
        pending = { finish };
        if (!g) {
          finish();
          return;
        }
        const step = (now: number) => {
          start ??= now;
          const k = duration > 0 ? Math.min((now - start) / duration, 1) : 1;
          trail = { row, t: tEnd * k, tEnd, color, done: false };
          if (k >= 1) {
            finish();
            return;
          }
          draw();
          frame = deps.requestFrame(step);
        };
        frame = deps.requestFrame(step);
      });
    },
    skip() {
      pending?.finish();
    },
    reset() {
      pending?.finish();
      markers.length = 0;
      trail = null;
      draw();
    },
    destroy() {
      pending?.finish();
      if (frame) deps.cancelFrame(frame);
      frame = 0;
    },
    inspect() {
      return { busy: pending !== null, markers: markers.length };
    },
  };
}
