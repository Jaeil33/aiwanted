import type { PitchRow } from '../../types/data';
import type { Bases, PitchCode, Play } from '../../types/domain';
import {
  DEFAULT_PITCH_ROW,
  DELIVERY_MS,
  FIELDERS,
  H,
  MITT_Y,
  PITCHER_KEYS,
  RELEASE_AT,
  TRACK_Y0,
  W,
  battedPreset,
  clamp01,
  flight,
  lerp,
  mulberry,
  nearestFielder,
  pathAt,
  pitchAt,
  plateTime,
  poseAt,
  project,
  smooth,
  timeToY,
  uniform,
} from '../math';
import type { BatterJoint, Flight, PoseKey, Uniform, Vec3 } from '../math';
import { buildBackground } from './background';
import { batterKeys, drawBatter, drawFielders, drawPitcher, idleBatterPose, idlePitcherPose } from './figures';
import {
  CALL_MS,
  SPARK_MS,
  bannerDone,
  burst,
  callFor,
  drawBall,
  drawBanner,
  drawBoard,
  drawCall,
  drawMap,
  drawMitt,
  drawSparks,
  drawZone,
  runnerAt,
} from './overlay';
import type { CallTag, MapView, Spark, Trail, ZoneMarker } from './overlay';
import type {
  PitchPlayback,
  StageBanner,
  StageController,
  StageDeps,
  StageInspect,
  StageOptions,
  StageScene,
} from './types';

/** 슬로모션 배율 */
const SLOW_MOTION = 2.2;
/** 1배속(fast·동작 줄이기) 투구 동작 길이(ms) */
const FAST_DELIVERY_MS = 700;
/** 캔버스 픽셀 밀도 상한과 최소 픽셀 폭(프로토타입 값) */
const MAX_DPR = 2;
const MIN_PIXEL_WIDTH = 320;
/** 타구 방향·홈런 불꽃에 쓰는 시드 고정 난수 */
const STAGE_SEED = 20260920;

const DEFAULT_SCENE: StageScene = {
  bat: { color: '#F0474B', home: true, bats: 'R' },
  fld: { color: '#5C8DF6', home: false, throws: 'R' },
};
const DEFAULT_ZONE = { top: 3.4, bottom: 1.6 };

interface Run {
  from: number;
  to: number;
  dist: number;
}

interface Batted {
  path: Flight;
  /** 타구 시간을 몇 배 빨리 돌리는지 */
  rate: number;
  startMs: number;
  endMs: number;
  hr: boolean;
  /** 타구를 쫓는 야수(FIELDERS 인덱스), 없으면 −1 */
  chaser: number;
  burst: boolean;
}

/** 공 하나의 연출 계획(ms는 모두 연출 시작 기준) */
interface Anim {
  start: number;
  row: PitchRow;
  code: PitchCode;
  number: number;
  bats: 'L' | 'R';
  slow: number;
  deliveryMs: number;
  relMs: number;
  plateMs: number;
  mittMs: number;
  tPlate: number;
  loc: Vec3;
  batted: Batted | null;
  runs: Run[];
  runStart: number;
  perBase: number;
  basesBefore: Bases;
  basesAfter: Bases | undefined;
  banner: StageBanner | null;
  bannerStart: number;
  bannerHold: number;
  endMs: number;
  onRelease: (() => void) | undefined;
  resolve: () => void;
  keys: PoseKey<BatterJoint>[];
  /** 릴리스 순간 투수 손 위치. null이면 아직 릴리스 전 */
  hand: { x: number; y: number } | null;
  marked: boolean;
  called: boolean;
  bannerShown: boolean;
  trail: Trail;
}

interface ActiveBanner extends StageBanner {
  start: number;
  hold: number;
}

/** 브라우저 기본 deps. requestAnimationFrame·document 접근은 여기에만 둔다 */
function defaultDeps(): StageDeps {
  return {
    now: () => performance.now(),
    requestFrame: (cb) => requestAnimationFrame(cb),
    cancelFrame: (id) => cancelAnimationFrame(id),
    createCanvas: (width, height) => {
      const layer = document.createElement('canvas');
      layer.width = width;
      layer.height = height;
      return layer;
    },
  };
}

/** 연출에 쓸 수 있는 투구 행인지: 값이 모두 유한하고, 공이 0.2~1.5초 안에 홈에 온 뒤 미트에 닿는다 */
function usableRow(row: PitchRow | null): row is PitchRow {
  if (!row || row.length < 16 || !row.every(Number.isFinite)) return false;
  const plate = plateTime(row);
  const mitt = timeToY(row, MITT_Y);
  return plate > 0.2 && plate < 1.5 && Number.isFinite(mitt) && mitt > plate;
}

const homeFielders = (): Array<[number, number]> => FIELDERS.map(([x, y]) => [x, y]);

/**
 * 포수 뒤 중계 시점 연출 컨트롤러. 논리 크기 960×540에 그리고 resize로 픽셀 크기를 맞춘다.
 * 공 하나: 투구 동작 → 실제 추적 궤적의 공 → 스윙/테이크 → 판정 태그 → (인플레이) 타구 비행·야수 추격
 * → 주자 이동 → 결과 배너. 연달아 부른 playPitch는 차례로 재생한다.
 */
export function createStage(canvas: HTMLCanvasElement, opts: StageOptions = {}): StageController {
  const base = defaultDeps();
  const given = opts.deps ?? {};
  const deps: StageDeps = {
    now: given.now ?? base.now,
    requestFrame: given.requestFrame ?? base.requestFrame,
    cancelFrame: given.cancelFrame ?? base.cancelFrame,
    createCanvas: given.createCanvas ?? base.createCanvas,
  };
  const reduced = Boolean(opts.reducedMotion);
  const g = canvas.getContext('2d');
  const random = mulberry(STAGE_SEED);

  let scene: StageScene | null = null;
  let look: StageScene = DEFAULT_SCENE;
  let zone = DEFAULT_ZONE;
  let uBat: Uniform = uniform(look.bat);
  let uFld: Uniform = uniform(look.fld);
  let bases: Bases = 0;
  let board: [string, string] = ['', ''];
  let markers: ZoneMarker[] = [];
  let scale = 1;
  let ui = 1;
  let background: HTMLCanvasElement | null = null;
  let anim: Anim | null = null;
  const queue: Array<{ p: PitchPlayback; resolve: () => void }> = [];
  let call: CallTag | null = null;
  let banner: ActiveBanner | null = null;
  const bannerWaits: Array<{ at: number; resolve: () => void }> = [];
  let sparks: Spark[] = [];
  let fielders = homeFielders();
  let frameId: number | null = null;
  let destroyed = false;

  function resize(cssWidth: number, dpr = 1): void {
    const width = cssWidth > 0 ? cssWidth : W;
    const density = Math.min(dpr > 0 ? dpr : 1, MAX_DPR);
    const pixelWidth = Math.max(MIN_PIXEL_WIDTH, Math.round(width * density));
    const pixelHeight = Math.round((pixelWidth * H) / W);
    // 같은 값이라도 width를 다시 쓰면 캔버스가 지워지므로 바뀔 때만 쓴다.
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const nextScale = pixelWidth / W;
    if (nextScale !== scale) {
      scale = nextScale;
      background = null;
    }
    ui = Math.min(2.2, Math.max(1, 560 / Math.max(width, 1)));
  }

  function makeBackground(): HTMLCanvasElement {
    const layer = deps.createCanvas(Math.round(W * scale), Math.round(H * scale));
    const b = layer.getContext('2d');
    if (b) {
      b.setTransform(scale, 0, 0, scale, 0, 0);
      buildBackground(b);
    }
    return layer;
  }

  function plan(p: PitchPlayback, start: number, resolve: () => void): Anim {
    const fast = Boolean(p.fast) || reduced;
    const slow = fast ? 1 : SLOW_MOTION;
    const deliveryMs = fast ? FAST_DELIVERY_MS : DELIVERY_MS;
    const relMs = deliveryMs * RELEASE_AT;
    const row = usableRow(p.row) ? p.row : DEFAULT_PITCH_ROW;
    const tPlate = plateTime(row);
    const plateMs = relMs + tPlate * 1000 * slow;
    const mittMs = relMs + timeToY(row, MITT_Y) * 1000 * slow;
    const loc = pitchAt(row, tPlate);
    let batted: Batted | null = null;
    if (p.code === 'X' || p.code === 'F') {
      // play가 없으면 프리셋 기본값(가운데로 뜨는 공)을 쓴다. 'K'는 타구 프리셋이 없는 결과라 기본값으로 간다.
      const kind: Play | 'F' = p.code === 'F' ? 'F' : (p.play ?? 'K');
      const path = flight(battedPreset(kind, p.bats, random(), random()));
      const rate = Math.max(1, path.duration / (fast ? 1.5 : 2.6));
      batted = {
        path,
        rate,
        startMs: plateMs,
        endMs: plateMs + (path.duration / rate) * 1000,
        hr: p.play === 'HR',
        chaser: p.code === 'X' && p.play !== 'HR' ? nearestFielder(path.landing) : -1,
        burst: false,
      };
    }
    const runs: Run[] = (p.moves ?? [])
      .filter(([from, to]) => from !== to)
      .map(([from, to]) => ({ from, to, dist: to === -1 ? 0.5 : to - from }));
    const runStart = batted ? plateMs + 150 : mittMs + 180;
    const perBase = fast ? 360 : 640;
    const runEnd = runs.length ? runStart + perBase * Math.max(...runs.map((r) => Math.max(r.dist, 0.5))) : 0;
    const phaseEnd = Math.max(batted ? batted.endMs : mittMs + 420, runEnd);
    const bannerHold = fast ? 850 : 1500;
    const bannerStart = phaseEnd + 60;
    const endMs = p.banner ? bannerStart + bannerHold + 400 : phaseEnd + (fast ? 120 : 280);
    return {
      start,
      row,
      code: p.code,
      number: p.number,
      bats: p.bats,
      slow,
      deliveryMs,
      relMs,
      plateMs,
      mittMs,
      tPlate,
      loc,
      batted,
      runs,
      runStart,
      perBase,
      basesBefore: bases,
      basesAfter: p.basesAfter,
      banner: p.banner ?? null,
      bannerStart,
      bannerHold,
      endMs,
      onRelease: p.onRelease,
      resolve,
      keys: batterKeys({ code: p.code, bats: p.bats, relMs, plateMs, slow, loc }),
      hand: null,
      marked: false,
      called: false,
      bannerShown: false,
      trail: [],
    };
  }

  function startNext(now: number): void {
    const next = queue.shift();
    if (next) anim = plan(next.p, now, next.resolve);
  }

  function finish(done: Anim, now: number): void {
    anim = null;
    fielders = homeFielders();
    if (done.basesAfter !== undefined) bases = done.basesAfter;
    done.resolve();
    startNext(now);
  }

  /** 타구를 쫓는 야수: 타구 시간 기준 초속 24ft로 낙하 지점에 달려간다 */
  function chase(b: Batted, t: number): void {
    const [sx, sy] = FIELDERS[b.chaser];
    const land = b.path.landing;
    const dist = Math.hypot(land.x - sx, land.y - sy) || 1;
    const u = clamp01((((t - b.startMs) / 1000) * b.rate * 24) / dist);
    fielders[b.chaser] = [lerp(sx, land.x, u), lerp(sy, land.y, u)];
  }

  function mapView(a: Anim | null, t: number): MapView {
    const runners =
      a && t >= a.runStart
        ? a.runs.map((run) => ({
            from: run.from,
            ...runnerAt(run, clamp01((t - a.runStart) / (a.perBase * Math.max(run.dist, 0.5)))),
          }))
        : [];
    const ball =
      a?.batted && t >= a.batted.startMs
        ? pathAt(a.batted.path.points, ((t - a.batted.startMs) / 1000) * a.batted.rate)
        : null;
    return {
      fielders,
      fielderColor: uFld.cap,
      runnerColor: look.bat.color,
      occupied: a ? a.basesBefore : bases,
      runners,
      ball,
    };
  }

  function settleBannerWaits(now: number): void {
    for (let i = bannerWaits.length - 1; i >= 0; i--) {
      if (now >= bannerWaits[i].at) bannerWaits.splice(i, 1)[0].resolve();
    }
  }

  function frame(now: number): void {
    if (destroyed || !g) return;
    frameId = deps.requestFrame(frame);
    if (!background) background = makeBackground();
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.drawImage(background, 0, 0, W, H);
    drawBoard(g, board);

    const a = anim;
    const t = a ? now - a.start : 0;
    if (a?.batted && a.batted.chaser >= 0 && t > a.batted.startMs) chase(a.batted, t);
    drawFielders(g, fielders, uFld);
    const pitcherPose = a ? poseAt(PITCHER_KEYS, t / a.deliveryMs) : idlePitcherPose(now, reduced);
    const hand = drawPitcher(g, pitcherPose, { throws: look.fld.throws, uniform: uFld, holding: !a || t < a.relMs });
    const zoneRect = drawZone(g, zone, markers, ui);

    let ball: Vec3 | null = null;
    let trail: Trail | null = null;
    if (a && t >= a.relMs) {
      if (!a.hand) {
        a.hand = hand;
        a.onRelease?.();
      }
      const tb = (t - a.relMs) / (1000 * a.slow);
      const pitchEnd = a.batted ? a.plateMs : a.mittMs;
      if (t < pitchEnd) {
        // 추적 시작점(55ft)이 아니라 투수 손에서 나오도록, 비행 앞부분 35% 동안 손 위치 차이를 서서히 없앤다.
        const w = pitchAt(a.row, tb);
        const start = project(a.row[6], TRACK_Y0, a.row[7]);
        const fade = 1 - smooth(clamp01(tb / (0.35 * a.tPlate)));
        const p = project(w.x, w.y, w.z);
        ball = {
          x: w.x + ((a.hand.x - start.x) * fade) / p.s,
          y: w.y,
          z: w.z + (-(a.hand.y - start.y) * fade) / p.s,
        };
        trail = a.trail;
      } else if (a.batted && t < a.batted.endMs + 500) {
        ball = pathAt(a.batted.path.points, ((t - a.batted.startMs) / 1000) * a.batted.rate);
        trail = a.trail;
        if (a.batted.hr && !a.batted.burst && Math.hypot(ball.x, ball.y) > 340) {
          a.batted.burst = true;
          if (!reduced) {
            const p = project(ball.x, ball.y, ball.z);
            sparks = sparks.concat(burst(Math.max(80, Math.min(W - 80, p.x)), Math.max(40, Math.min(170, p.y)), now, random));
          }
        }
      }
      if (!a.marked && t >= a.plateMs) {
        a.marked = true;
        markers.push({ x: a.loc.x, z: a.loc.z, n: a.number, code: a.code });
        if (a.code === 'F' || a.code === 'X') call = callFor(a.code, now);
      }
      if (!a.called && !a.batted && t >= a.mittMs) {
        a.called = true;
        call = callFor(a.code, now);
      }
    }

    // 투수 쪽(y > 2.5) 공은 타자 뒤에, 포수 쪽 공은 타자 앞에 그린다.
    if (ball && ball.y > 2.5) drawBall(g, ball, trail, reduced);
    drawBatter(g, a ? poseAt(a.keys, t) : idleBatterPose(now, reduced), { bats: a ? a.bats : look.bat.bats, uniform: uBat });
    if (ball && ball.y <= 2.5) drawBall(g, ball, trail, reduced);
    if (a && !a.batted && t >= a.plateMs - 140) drawMitt(g, a.loc, t >= a.mittMs, t - a.mittMs, reduced);

    sparks = sparks.filter((s) => now - s.start < SPARK_MS);
    drawSparks(g, sparks, now);
    if (call && now - call.start > CALL_MS) call = null;
    if (call) drawCall(g, call, now - call.start, zoneRect, ui);
    if (a?.banner && !a.bannerShown && t >= a.bannerStart) {
      a.bannerShown = true;
      banner = { ...a.banner, start: now, hold: a.bannerHold };
    }
    if (banner && bannerDone(now - banner.start, banner.hold)) banner = null;
    if (banner) drawBanner(g, banner, now - banner.start, banner.hold, ui);
    drawMap(g, mapView(a, t), ui);

    settleBannerWaits(now);
    if (a && t >= a.endMs) finish(a, now);
  }

  const controller: StageController = {
    setScene(next) {
      scene = next;
      look = next;
      zone = next.zone ?? DEFAULT_ZONE;
      uBat = uniform(next.bat);
      uFld = uniform(next.fld);
    },
    setBases(next) {
      bases = next;
    },
    setBoard(lines) {
      board = [lines[0], lines[1]];
    },
    playPitch(p) {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
        } else if (!g) {
          // 2D 컨텍스트가 없으면(캔버스를 못 쓰는 환경) 그리지 않고 결과만 반영한다.
          const row = usableRow(p.row) ? p.row : DEFAULT_PITCH_ROW;
          const loc = pitchAt(row, plateTime(row));
          p.onRelease?.();
          markers.push({ x: loc.x, z: loc.z, n: p.number, code: p.code });
          if (p.basesAfter !== undefined) bases = p.basesAfter;
          resolve();
        } else {
          queue.push({ p, resolve });
          if (!anim) startNext(deps.now());
        }
      });
    },
    showBanner(b) {
      return new Promise<void>((resolve) => {
        if (destroyed || !g) {
          resolve();
          return;
        }
        const hold = reduced ? 700 : 1400;
        const start = deps.now();
        banner = { text: b.text, sub: b.sub, tone: b.tone, start, hold };
        bannerWaits.push({ at: start + hold + 420, resolve });
      });
    },
    clearMarkers() {
      markers = [];
    },
    resize,
    inspect(): StageInspect {
      return {
        busy: anim !== null || queue.length > 0,
        bases,
        board: [board[0], board[1]],
        banner: banner ? banner.text : null,
        markers: markers.length,
        scene,
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frameId !== null) deps.cancelFrame(frameId);
      frameId = null;
      const pending = [
        ...(anim ? [anim.resolve] : []),
        ...queue.map((q) => q.resolve),
        ...bannerWaits.map((w) => w.resolve),
      ];
      anim = null;
      queue.length = 0;
      bannerWaits.length = 0;
      banner = null;
      for (const resolve of pending) resolve();
    },
  };

  resize(W, 1);
  if (g) frameId = deps.requestFrame(frame);
  return controller;
}
