import { describe, expect, it } from 'vitest';
import { pitchAt } from './math/pitch';
import { createTracker, plateLocation, PLATE_FRONT_Y, type TrackerDeps } from './tracker';
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
