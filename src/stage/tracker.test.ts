import { describe, expect, it } from 'vitest';
import { pitchAt } from './math/pitch';
import { BACKSCREEN, CAPTION_PX, createTracker, frameTracker, plateLocation, PLATE_FRONT_Y, projectOnFrame, type TrackerDeps } from './tracker';
import type { PitchRow } from '../types/data';

const ROW: PitchRow = [0, 147, 1, 0, 0, 1, -1.645, 5.942, 5.386, -133.458, -5.875, -12.96, 30.399, -12.37, 3.29, 1.596];

/** 모든 2D 메서드를 기록만 하는 가짜 컨텍스트(속성 대입은 저장) */
function fakeContext() {
  const calls: string[] = [];
  const store: Record<string | symbol, unknown> = {};
  const ctx = new Proxy(store, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
      return () => {
        calls.push(String(prop));
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx, calls };
}

function fakeCanvas(withContext = true) {
  const { ctx, calls } = fakeContext();
  const canvas = { width: 0, height: 0, getContext: () => (withContext ? ctx : null) } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

/** 가짜 시계·프레임: flush(ms)가 시계를 옮기고 대기 중인 프레임을 한 번씩 부른다 */
function fakeDeps(extra: Partial<TrackerDeps> = {}) {
  let clock = 0;
  let nextId = 1;
  const frames = new Map<number, (t: number) => void>();
  const deps: TrackerDeps = {
    now: () => clock,
    requestFrame: (cb) => {
      const id = nextId++;
      frames.set(id, cb);
      return id;
    },
    cancelFrame: (id) => {
      frames.delete(id);
    },
    createCanvas: () => fakeCanvas().canvas,
    ...extra,
  };
  const flush = (ms: number) => {
    clock += ms;
    const pending = [...frames.entries()];
    frames.clear();
    for (const [, cb] of pending) cb(clock);
  };
  return { deps, flush, pendingFrames: () => frames.size };
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('plateLocation', () => {
  it('홈플레이트 앞면(y = 1.417ft)에서의 x·z를 궤적 식으로 구한다', () => {
    const loc = plateLocation(ROW);
    const at = pitchAt(ROW, loc.t);
    expect(at.y).toBeCloseTo(PLATE_FRONT_Y, 6);
    expect(loc.x).toBeCloseTo(at.x, 10);
    expect(loc.z).toBeCloseTo(at.z, 10);
    expect(loc.t).toBeGreaterThan(0.3);
    expect(loc.t).toBeLessThan(0.6);
  });
});

describe('frameTracker', () => {
  const SIZES: Array<[number, number]> = [[390, 240], [390, 300], [480, 385], [390, 440], [720, 440]];
  const ZONE = { top: 3.3, bottom: 1.6 };

  it('어느 크기에서도 투수 손(55ft, 높이 6.3ft까지)이 캔버스 위 여백 안에서 보이고, 존 아래 끝은 자막 위에 있다', () => {
    for (const [w, h] of SIZES) {
      const frame = frameTracker(w, h, ZONE.bottom);
      const release = projectOnFrame(frame, -1.6, 55, 6.3);
      const zoneBottom = projectOnFrame(frame, 0, PLATE_FRONT_Y, ZONE.bottom);
      expect(release?.y).toBeGreaterThanOrEqual(h * 0.1 - 0.5);
      expect(zoneBottom?.y).toBeLessThanOrEqual(h - CAPTION_PX + 0.5);
    }
  });

  it('자막 예약이 64px이라 휴대폰 높이에서도 1ft가 60px을 넘는다', () => {
    // 21-pitch-stage step 1: 예약이 120px일 때는 45px/ft였다. 그때 공 반지름이 5.4px이었다
    expect(CAPTION_PX).toBe(64);
    const frame = frameTracker(390, 274, ZONE.bottom);
    const plate = projectOnFrame(frame, 0, PLATE_FRONT_Y, ZONE.bottom);
    expect(plate?.s ?? 0).toBeGreaterThan(60);
  });

  it('높이가 넉넉하면 시안처럼 홈플레이트 폭이 캔버스 폭의 27%다', () => {
    const frame = frameTracker(390, 440, ZONE.bottom);
    const left = projectOnFrame(frame, -0.708, PLATE_FRONT_Y, 0);
    const right = projectOnFrame(frame, 0.708, PLATE_FRONT_Y, 0);
    expect(((right?.x ?? 0) - (left?.x ?? 0)) / 390).toBeCloseTo(0.27, 3);
  });

  it('포수 눈높이 시점: 공은 존 윗변에서 존 높이의 0.7배 안쪽 위에서 나와 5배 넘게 커지며 날아온다', () => {
    for (const [w, h] of SIZES) {
      const frame = frameTracker(w, h, ZONE.bottom);
      const start = pitchAt(ROW, 0);
      const release = projectOnFrame(frame, start.x, start.y, start.z);
      const top = projectOnFrame(frame, 0, PLATE_FRONT_Y, ZONE.top);
      const bottom = projectOnFrame(frame, 0, PLATE_FRONT_Y, ZONE.bottom);
      if (!release || !top || !bottom) throw new Error('projection failed');
      expect((top.y - release.y) / (bottom.y - top.y)).toBeLessThan(0.7);
      expect(top.s / release.s).toBeGreaterThan(5);
    }
  });

  it('투수 손은 관중석이 아니라 가운데 외야 백스크린 앞에서 보인다', () => {
    for (const [w, h] of SIZES) {
      const frame = frameTracker(w, h, ZONE.bottom);
      const eyeTopLeft = projectOnFrame(frame, -BACKSCREEN.halfWidth, BACKSCREEN.y, BACKSCREEN.top);
      const eyeBottomRight = projectOnFrame(frame, BACKSCREEN.halfWidth, BACKSCREEN.y, 0);
      for (const [x0, z0] of [[-1.6, 5.9], [-3.2, 5.0], [2.5, 6.3]]) {
        const hand = projectOnFrame(frame, x0, 55, z0);
        if (!hand || !eyeTopLeft || !eyeBottomRight) throw new Error('projection failed');
        expect(hand.x).toBeGreaterThan(eyeTopLeft.x);
        expect(hand.x).toBeLessThan(eyeBottomRight.x);
        expect(hand.y).toBeGreaterThan(eyeTopLeft.y);
        expect(hand.y).toBeLessThan(eyeBottomRight.y);
      }
    }
  });
});

describe('createTracker', () => {
  it('resize는 CSS 크기 × dpr로 캔버스를 맞추고 경기장·존을 그린다', () => {
    const { canvas, calls } = fakeCanvas();
    const { deps } = fakeDeps();
    const tracker = createTracker(canvas, deps);
    tracker.resize(390, 300, 2);
    expect([canvas.width, canvas.height]).toEqual([780, 600]);
    expect(calls).toContain('drawImage');
    expect(calls).toContain('strokeRect');
  });

  it('setSky는 하늘이나 홈팀 색이 바뀔 때만 배경을 다시 굽는다', () => {
    // 21-pitch-stage step 2: 배경 굽기는 비싸다(관중 점 1,400개). 같은 값이면 다시 굽지 않는다
    const { canvas } = fakeCanvas();
    let baked = 0;
    const { deps } = fakeDeps({
      createCanvas: () => {
        baked += 1;
        return fakeCanvas().canvas;
      },
    });
    const tracker = createTracker(canvas, deps);
    tracker.resize(390, 274, 1);
    const afterResize = baked;
    expect(afterResize).toBeGreaterThan(0);

    tracker.setSky('night', '#ffffff');
    expect(baked).toBe(afterResize);

    tracker.setSky('dusk', '#ffffff');
    expect(baked).toBeGreaterThan(afterResize);
    const afterDusk = baked;

    tracker.setSky('dusk', '#E0457B');
    expect(baked).toBeGreaterThan(afterDusk);
  });

  it('크기를 정하기 전에 setSky를 불러도 터지지 않는다', () => {
    const { canvas } = fakeCanvas();
    const { deps } = fakeDeps();
    const tracker = createTracker(canvas, deps);
    expect(() => tracker.setSky('day', '#F0474B')).not.toThrow();
  });

  it('날아오는 동안 공에 실밥을 돌려 그린다', async () => {
    // 21-pitch-stage step 4: 회전이 있어야 "움직이는 점"이 아니라 "날아오는 물체"로 보인다
    const { canvas, calls } = fakeCanvas();
    const { deps, flush } = fakeDeps();
    const tracker = createTracker(canvas, deps);
    tracker.resize(390, 274, 1);
    const thrown = tracker.throwPitch(ROW, 1, 'S');
    flush(16);
    // 멀리 있을 때는 실밥이 진흙이라 안 그린다: 반지름 4px을 넘는 홈플레이트 근처에서만
    expect(calls).not.toContain('rotate');
    flush(380);
    await settle();
    expect(calls).toContain('rotate');
    expect(calls).toContain('clip');
    tracker.skip();
    await thrown;
  });

  it('throwPitch는 궤적 시간(보통 1배)이 지나면 끝나고 번호 원을 하나 남긴다', async () => {
    const { canvas } = fakeCanvas();
    const { deps, flush } = fakeDeps();
    const tracker = createTracker(canvas, deps);
    tracker.resize(390, 300, 1);
    let done = false;
    const thrown = tracker.throwPitch(ROW, 1, 'S').then(() => {
      done = true;
    });
    flush(16);
    await settle();
    expect(tracker.inspect()).toEqual({ busy: true, markers: 0 });
    for (let i = 0; i < 40 && !done; i++) {
      flush(16);
      await settle();
    }
    await thrown;
    expect(done).toBe(true);
    expect(tracker.inspect()).toEqual({ busy: false, markers: 1 });
  });

  it('slow는 2.4배 오래 날아가고, skip은 남은 연출 없이 바로 끝낸다', async () => {
    const { canvas } = fakeCanvas();
    const { deps, flush } = fakeDeps();
    const tracker = createTracker(canvas, deps);
    tracker.resize(390, 300, 1);
    const t = plateLocation(ROW).t;
    let done = false;
    const thrown = tracker.throwPitch(ROW, 1, 'B', { slow: true }).then(() => {
      done = true;
    });
    flush(1);
    flush(t * 1000 + 20);
    await settle();
    expect(done).toBe(false);
    tracker.skip();
    await thrown;
    expect(tracker.inspect().markers).toBe(1);
  });

  it('동작 줄이기면 첫 프레임에 끝난다', async () => {
    const { canvas } = fakeCanvas();
    const { deps, flush } = fakeDeps({ reducedMotion: true });
    const tracker = createTracker(canvas, deps);
    tracker.resize(390, 300, 1);
    const thrown = tracker.throwPitch(ROW, 1, 'X');
    flush(16);
    await thrown;
    expect(tracker.inspect().markers).toBe(1);
  });

  it('mark는 연출 없이 번호 원을 더하고, reset은 모두 지운다', () => {
    const { canvas } = fakeCanvas();
    const { deps } = fakeDeps();
    const tracker = createTracker(canvas, deps);
    tracker.resize(390, 300, 1);
    tracker.mark(ROW, 1, 'B');
    tracker.mark(ROW, 2, 'F');
    expect(tracker.inspect().markers).toBe(2);
    tracker.reset();
    expect(tracker.inspect()).toEqual({ busy: false, markers: 0 });
  });

  it('던지는 중에 새 공을 던지면 앞 공은 바로 끝내고 번호 원을 남긴다', async () => {
    const { canvas } = fakeCanvas();
    const { deps, flush } = fakeDeps({ reducedMotion: false });
    const tracker = createTracker(canvas, deps);
    tracker.resize(390, 300, 1);
    const first = tracker.throwPitch(ROW, 1, 'B');
    flush(16);
    const second = tracker.throwPitch(ROW, 2, 'S');
    await first;
    tracker.skip();
    await second;
    expect(tracker.inspect().markers).toBe(2);
  });

  it('destroy는 대기 중인 프레임을 끊고 던지던 공을 끝낸다', async () => {
    const { canvas } = fakeCanvas();
    const { deps, flush, pendingFrames } = fakeDeps();
    const tracker = createTracker(canvas, deps);
    tracker.resize(390, 300, 1);
    const thrown = tracker.throwPitch(ROW, 1, 'S');
    flush(16);
    tracker.destroy();
    await thrown;
    expect(pendingFrames()).toBe(0);
  });

  it('2D 컨텍스트가 없으면(jsdom) 모든 명령이 조용히 끝난다', async () => {
    const { canvas } = fakeCanvas(false);
    const { deps } = fakeDeps();
    const tracker = createTracker(canvas, deps);
    tracker.resize(390, 300, 2);
    await tracker.throwPitch(ROW, 1, 'S');
    tracker.mark(ROW, 2, 'B');
    tracker.setBases(7);
    tracker.setZone(3.4, 1.6);
    expect(tracker.inspect()).toEqual({ busy: false, markers: 2 });
  });
});
