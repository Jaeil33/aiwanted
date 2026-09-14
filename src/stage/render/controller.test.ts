import { afterEach, describe, expect, it } from 'vitest';
import type { PitchRow } from '../../types/data';
import { BALL_R, FIELDERS, H, W, pitchAt, project, uniform } from '../math';
import { createStage } from './controller';
import { advanceUntil, createFakeCanvas, createManualDeps, flushMicrotasks } from './testing';
import type { FakeCanvas, FakeContext, ManualStageDeps } from './testing';
import type { PitchPlayback, StageController, StageScene } from './types';

const SCENE: StageScene = {
  bat: { color: '#5C8DF6', home: true, bats: 'L' },
  fld: { color: '#F0474B', home: false, throws: 'R' },
  zone: { top: 3.45, bottom: 1.63 },
};

// 합성 투구(실제 기록 아님): [type, speed, code, balls, strikes, stance, x0, z0, vx0, vy0, vz0, ax, ay, az, topSz, bottomSz]
const ROW: PitchRow = [0, 148, 0, 0, 0, 1, -1.52, 5.81, 5.1, -131.2, -5.3, -8.1, 28.4, -14.8, 3.42, 1.61];

const pitch = (over: Partial<PitchPlayback> = {}): PitchPlayback => ({ row: ROW, code: 'B', number: 1, bats: 'R', ...over });

interface Rig {
  stage: StageController;
  deps: ManualStageDeps;
  screen: FakeCanvas;
}

const live: StageController[] = [];
afterEach(() => {
  for (const stage of live.splice(0)) stage.destroy();
});

function rig(opts: { reducedMotion?: boolean } = {}): Rig {
  const deps = createManualDeps(1000);
  const screen = createFakeCanvas();
  const stage = createStage(screen.canvas, { reducedMotion: opts.reducedMotion, deps });
  live.push(stage);
  return { stage, deps, screen };
}

const idle = (r: Rig) => () => !r.stage.inspect().busy;

/** 기록된 호출을 따라가며 fillStyle이 color일 때 그리고 바로 fill()한 호(arc)의 인자(실밥처럼 stroke한 호는 뺀다) */
function arcsFilledWith(fake: FakeContext, color: string): number[][] {
  let fill: unknown = null;
  const out: number[][] = [];
  fake.calls.forEach((call, i) => {
    if (call.name === 'set:fillStyle') fill = call.args[0];
    if (call.name === 'arc' && fill === color && fake.calls[i + 1]?.name === 'fill') out.push(call.args as number[]);
  });
  return out;
}

describe('createStage', () => {
  it('논리 크기 960×540 캔버스로 시작하고 프레임 루프를 이어 간다', () => {
    const { deps, screen } = rig();
    expect([screen.canvas.width, screen.canvas.height]).toEqual([W, H]);
    expect(deps.pendingFrames).toBe(1);
    deps.advance(160);
    expect(deps.pendingFrames).toBe(1);
  });

  it('배경은 한 번만 그려 캐시하고 매 프레임 drawImage로 붙인다', () => {
    const { deps, screen } = rig();
    deps.advance(16 * 10);
    expect(deps.canvases).toHaveLength(1);
    const background = deps.canvases[0];
    expect([background.canvas.width, background.canvas.height]).toEqual([W, H]);
    expect(background.context.count('fillRect')).toBeGreaterThan(2600);
    const draws = screen.context.argsOf('drawImage');
    expect(draws).toHaveLength(10);
    for (const args of draws) expect(args).toEqual([background.canvas, 0, 0, W, H]);
  });

  it('기다리는 동안에도 투수·타자·야수·스트라이크 존·미니 다이아몬드를 그리고 글로우는 쓰지 않는다', () => {
    const { deps, screen } = rig();
    deps.advance(16);
    expect(screen.context.count('strokeRect')).toBe(2);
    expect(screen.context.count('arc')).toBeGreaterThan(7 + 3);
    expect(screen.context.valuesOf('shadowBlur')).toEqual([]);
    expect(screen.context.valuesOf('filter')).toEqual([]);
  });

  it('setScene의 팀 컬러로 공격·수비 유니폼을 입힌다', () => {
    const { stage, deps, screen } = rig();
    stage.setScene(SCENE);
    deps.advance(16);
    expect(screen.context.valuesOf('fillStyle')).toEqual(
      expect.arrayContaining([uniform(SCENE.bat).cap, uniform(SCENE.fld).jersey]),
    );
    expect(screen.context.valuesOf('strokeStyle')).toContain(uniform(SCENE.fld).trim);
  });
});

describe('playPitch', () => {
  it('재생하는 동안 busy이고, 시계를 돌리면 끝나서 resolve된다', async () => {
    const r = rig();
    let done = false;
    const played = r.stage.playPitch(pitch()).then(() => {
      done = true;
    });
    expect(r.stage.inspect().busy).toBe(true);
    r.deps.advance(1000);
    await flushMicrotasks();
    expect(done).toBe(false);
    expect(r.stage.inspect().busy).toBe(true);
    advanceUntil(r.deps, idle(r));
    await played;
    expect(done).toBe(true);
  });

  it('투구 동작 1650ms의 0.76 시점(릴리스)에 onRelease를 한 번 부른다', () => {
    const r = rig();
    const start = r.deps.time;
    const releases: number[] = [];
    void r.stage.playPitch(pitch({ onRelease: () => releases.push(r.deps.time - start) }));
    advanceUntil(r.deps, idle(r));
    expect(releases).toHaveLength(1);
    expect(releases[0]).toBeGreaterThanOrEqual(1650 * 0.76);
    expect(releases[0]).toBeLessThan(1650 * 0.76 + 16);
  });

  it('릴리스 뒤 공은 실제 추적 궤적(pitchAt)을 따라 날아간다', () => {
    const r = rig();
    void r.stage.playPitch(pitch({ fast: true }));
    r.screen.context.clear();
    // fast: 릴리스 700×0.76 = 532ms, 추적 0.4초 뒤(손에서 이어 붙이는 보정은 0.35×홈 도달 시간 안에 끝난다)
    r.deps.advance(532 + 400, 532 + 400);
    const world = pitchAt(ROW, 0.4);
    const p = project(world.x, world.y, world.z);
    expect(arcsFilledWith(r.screen.context, '#F7F7F2')).toEqual([[p.x, p.y, Math.max(1.4, BALL_R * p.s), 0, Math.PI * 2]]);
  });

  it('fast와 reducedMotion은 같은 투구를 슬로모션 없이 더 빨리 끝낸다', () => {
    const slow = rig();
    void slow.stage.playPitch(pitch());
    const slowMs = advanceUntil(slow.deps, idle(slow));
    const fast = rig();
    void fast.stage.playPitch(pitch({ fast: true }));
    const fastMs = advanceUntil(fast.deps, idle(fast));
    const calm = rig({ reducedMotion: true });
    void calm.stage.playPitch(pitch());
    const calmMs = advanceUntil(calm.deps, idle(calm));
    expect(fastMs).toBeLessThan(slowMs * 0.6);
    expect(calmMs).toBe(fastMs);
  });

  it('연달아 부르면 앞 재생이 끝난 뒤 순서대로 재생한다', async () => {
    const r = rig();
    const log: string[] = [];
    const first = r.stage
      .playPitch(pitch({ number: 1, onRelease: () => log.push('release 1') }))
      .then(() => log.push('done 1'));
    const second = r.stage
      .playPitch(pitch({ number: 2, code: 'T', onRelease: () => log.push('release 2') }))
      .then(() => log.push('done 2'));
    while (r.stage.inspect().busy) {
      r.deps.advance(16);
      await Promise.resolve();
    }
    await Promise.all([first, second]);
    expect(log).toEqual(['release 1', 'done 1', 'release 2', 'done 2']);
    expect(r.stage.inspect().markers).toBe(2);
  });

  it('공이 홈에 오면 번호 표시와 판정 태그를 남긴다', () => {
    const r = rig();
    void r.stage.playPitch(pitch({ code: 'S', number: 3 }));
    advanceUntil(r.deps, idle(r));
    const texts = r.screen.context.argsOf('fillText').map(([text]) => text);
    expect(texts).toContain('헛스윙');
    expect(texts).toContain('3');
    expect(r.stage.inspect().markers).toBe(1);
  });

  it('인플레이는 타구가 날고 가장 가까운 야수가 쫓아가며, 주자가 움직인 뒤 결과 배너를 띄운다', async () => {
    const r = rig();
    r.stage.setBases(1);
    const fielderDots = () =>
      r.screen.context.argsOf('arc').filter(([, , radius]) => radius === 3).map(([x, y]) => `${x},${y}`);
    r.deps.advance(16);
    const home = new Set(fielderDots());
    expect(home.size).toBe(FIELDERS.length);
    r.screen.context.clear();
    const banners = new Set<string | null>();
    const played = r.stage.playPitch(
      pitch({ code: 'X', play: 'FB', number: 2, moves: [[1, 2]], basesAfter: 2, banner: { text: '희생플라이', sub: '1사 2루' } }),
    );
    let chased = false;
    let dashed = false;
    let runners = false;
    while (r.stage.inspect().busy) {
      r.screen.context.clear();
      r.deps.advance(16);
      banners.add(r.stage.inspect().banner);
      if (fielderDots().some((dot) => !home.has(dot))) chased = true;
      if (r.screen.context.count('setLineDash') > 0) dashed = true;
      if (r.screen.context.argsOf('arc').some(([, , radius]) => radius === 4)) runners = true;
    }
    await played;
    expect(chased).toBe(true);
    expect(dashed).toBe(true);
    expect(runners).toBe(true);
    expect(banners).toContain('희생플라이');
    expect(r.stage.inspect().bases).toBe(2);
    expect(r.stage.inspect().banner).toBeNull();
  });

  it('홈런은 담장을 넘을 때 불꽃을 터뜨리고, 동작 줄이기면 불꽃을 끈다', () => {
    const sparksIn = (reducedMotion: boolean) => {
      const r = rig({ reducedMotion });
      void r.stage.playPitch(pitch({ code: 'X', play: 'HR', moves: [[0, 4]], basesAfter: 0 }));
      let sparks = 0;
      while (r.stage.inspect().busy) {
        r.screen.context.clear();
        r.deps.advance(16);
        sparks += r.screen.context.argsOf('fillRect').filter(([, , w, h]) => w === 3 && h === 3).length;
      }
      return sparks;
    };
    expect(sparksIn(false)).toBeGreaterThan(0);
    expect(sparksIn(true)).toBe(0);
  });

  it.each([
    ['볼넷', pitch({ code: 'B', number: 4, moves: [[0, 1], [1, 2]], basesAfter: 3, banner: { text: '볼넷' } })],
    ['루킹 삼진', pitch({ code: 'T', number: 5, banner: { text: '삼진' } })],
    ['헛스윙', pitch({ code: 'S' })],
    ['파울', pitch({ code: 'F' })],
    ['병살', pitch({ code: 'X', play: 'DP', moves: [[0, -1], [1, -1]], basesAfter: 0 })],
    ['2루타', pitch({ code: 'X', play: '2B', bats: 'L', moves: [[0, 2], [2, 4]], basesAfter: 2 })],
    ['표본 없음', pitch({ row: null, code: 'X', play: '1B' })],
  ])('%s: 끝까지 그리는 동안 반지름이 음수인 호·타원이 없다', async (_name, playback) => {
    const r = rig();
    const played = r.stage.playPitch(playback);
    advanceUntil(r.deps, idle(r));
    await played;
    for (const [, , radius] of r.screen.context.argsOf('arc') as number[][]) expect(radius).toBeGreaterThanOrEqual(0);
    for (const [, , rx, ry] of r.screen.context.argsOf('ellipse') as number[][]) {
      expect(rx).toBeGreaterThanOrEqual(0);
      expect(ry).toBeGreaterThanOrEqual(0);
    }
    expect(r.screen.context.valuesOf('shadowBlur')).toEqual([]);
  });

  it('쓸 수 없는 투구 행(NaN·홈에 오지 않음)은 기본 직구로 대신해 멈추지 않는다', async () => {
    const durationOf = (row: PitchRow | null) => {
      const r = rig();
      void r.stage.playPitch(pitch({ row }));
      return advanceUntil(r.deps, idle(r), 16, 20_000);
    };
    const fallback = durationOf(null);
    const nan: PitchRow = [0, 145, 0, 0, 0, 1, -1.5, 5.8, 5.2, Number.NaN, -4.4, -8, 28, -15, 3.4, 1.6];
    const away: PitchRow = [0, 145, 0, 0, 0, 1, -1.5, 5.8, 5.2, 132, -4.4, -8, 28, -15, 3.4, 1.6];
    expect(durationOf(nan)).toBe(fallback);
    expect(durationOf(away)).toBe(fallback);
  });
});

describe('inspect', () => {
  it('처음에는 비어 있고, setScene·setBases·setBoard·clearMarkers가 바로 반영된다', () => {
    const { stage, deps, screen } = rig();
    expect(stage.inspect()).toEqual({ busy: false, bases: 0, board: ['', ''], banner: null, markers: 0, scene: null });
    stage.setScene(SCENE);
    stage.setBases(5);
    stage.setBoard(['4 : 4', 'B0 S0 O2']);
    expect(stage.inspect()).toMatchObject({ bases: 5, board: ['4 : 4', 'B0 S0 O2'], scene: SCENE });
    deps.advance(16);
    expect(screen.context.argsOf('fillText')).toEqual(expect.arrayContaining([['4 : 4', 480, 81], ['B0 S0 O2', 480, 103]]));
    void stage.playPitch(pitch());
    advanceUntil(deps, () => !stage.inspect().busy);
    expect(stage.inspect().markers).toBe(1);
    stage.clearMarkers();
    expect(stage.inspect().markers).toBe(0);
  });

  it('basesAfter를 준 재생이 끝나야 루 상태가 바뀐다', async () => {
    const r = rig();
    r.stage.setBases(1);
    const played = r.stage.playPitch(pitch({ code: 'B', number: 4, moves: [[0, 1], [1, 2]], basesAfter: 3 }));
    r.deps.advance(2000);
    expect(r.stage.inspect().bases).toBe(1);
    advanceUntil(r.deps, idle(r));
    await played;
    expect(r.stage.inspect().bases).toBe(3);
  });

  it('showBanner는 배너를 바로 띄우고, 머무른 뒤 사라지면 resolve된다', async () => {
    const { stage, deps } = rig();
    let done = false;
    const shown = stage.showBanner({ text: '경기 끝!', sub: 'KIA 4 : 8 롯데', tone: 'big' }).then(() => {
      done = true;
    });
    expect(stage.inspect().banner).toBe('경기 끝!');
    deps.advance(1400);
    await flushMicrotasks();
    expect(done).toBe(false);
    expect(stage.inspect().banner).toBe('경기 끝!');
    deps.advance(1400);
    await shown;
    expect(done).toBe(true);
    expect(stage.inspect().banner).toBeNull();
  });
});

describe('resize', () => {
  it('resize(480, 2)는 픽셀 960×540, 배율 1로 그린다', () => {
    const { stage, deps, screen } = rig();
    stage.resize(480, 2);
    expect([screen.canvas.width, screen.canvas.height]).toEqual([960, 540]);
    deps.advance(16);
    expect(screen.context.argsOf('setTransform').at(-1)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(deps.canvases).toHaveLength(1);
  });

  it('resize(390, 3)은 16:9 비율을 지키고 새 배율로 배경을 다시 만든다', () => {
    const { stage, deps, screen } = rig();
    deps.advance(16);
    stage.resize(390, 3);
    const { width, height } = screen.canvas;
    expect(width).toBeGreaterThan(390);
    expect(Math.abs(height - (width * 9) / 16)).toBeLessThanOrEqual(0.5);
    const scale = width / W;
    deps.advance(16);
    expect(screen.context.argsOf('setTransform').at(-1)).toEqual([scale, 0, 0, scale, 0, 0]);
    expect(deps.canvases).toHaveLength(2);
    expect(deps.canvases[1].canvas.width).toBe(Math.round(W * scale));
  });
});

describe('destroy', () => {
  it('프레임 루프를 멈추고 기다리던 재생·배너를 모두 resolve한다', async () => {
    const { stage, deps } = rig();
    const first = stage.playPitch(pitch());
    const queued = stage.playPitch(pitch({ number: 2 }));
    const banner = stage.showBanner({ text: '경기 끝!' });
    deps.advance(100);
    stage.destroy();
    expect(deps.canceled).toHaveLength(1);
    expect(deps.pendingFrames).toBe(0);
    await Promise.all([first, queued, banner]);
    expect(stage.inspect().busy).toBe(false);
    await stage.playPitch(pitch());
    deps.advance(1000);
    expect(deps.pendingFrames).toBe(0);
  });
});

describe('2D 컨텍스트를 만들 수 없을 때', () => {
  it('그리지 않고 상태만 갱신하며, 재생은 바로 resolve한다', async () => {
    const deps = createManualDeps();
    const canvas = { width: 300, height: 150, getContext: () => null } as unknown as HTMLCanvasElement;
    const stage = createStage(canvas, { deps });
    let released = 0;
    await stage.playPitch(pitch({ basesAfter: 2, onRelease: () => (released += 1) }));
    expect(stage.inspect()).toMatchObject({ busy: false, bases: 2, markers: 1 });
    expect(released).toBe(1);
    expect(deps.pendingFrames).toBe(0);
    await stage.showBanner({ text: '경기 끝!' });
    stage.destroy();
  });
});
