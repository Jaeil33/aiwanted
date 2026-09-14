/*
 * 테스트 도우미: 호출을 기록하는 가짜 2D 컨텍스트·캔버스와 손으로 돌리는 시계·프레임.
 * 제품 코드에서 import하지 않는다.
 */
import type { StageDeps } from './types';

/** 가짜 컨텍스트가 기록한 호출. 속성 설정은 name이 `set:<속성>`이다 */
export interface RecordedCall {
  name: string;
  args: unknown[];
}

const METHODS = [
  'arc', 'beginPath', 'bezierCurveTo', 'clearRect', 'closePath', 'drawImage', 'ellipse', 'fill', 'fillRect',
  'fillText', 'lineTo', 'moveTo', 'quadraticCurveTo', 'rect', 'resetTransform', 'restore', 'rotate', 'save',
  'scale', 'setLineDash', 'setTransform', 'stroke', 'strokeRect', 'strokeText', 'translate',
] as const;

const PROPERTIES: Readonly<Record<string, unknown>> = {
  fillStyle: '#000000',
  strokeStyle: '#000000',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  font: '10px sans-serif',
  textAlign: 'start',
  textBaseline: 'alphabetic',
  globalAlpha: 1,
  shadowBlur: 0,
  shadowColor: 'rgba(0, 0, 0, 0)',
  filter: 'none',
};

export interface FakeContext {
  /** 그리기 함수·createStage에 넘기는 가짜 2D 컨텍스트 */
  readonly ctx: CanvasRenderingContext2D;
  readonly calls: RecordedCall[];
  count(name: string): number;
  /** name 메서드 호출마다의 인자 */
  argsOf(name: string): unknown[][];
  /** property에 설정된 값들(설정 순서) */
  valuesOf(property: string): unknown[];
  /** 기록만 비운다(속성 값은 그대로) */
  clear(): void;
}

export function createFakeContext(canvas: HTMLCanvasElement | null = null): FakeContext {
  const calls: RecordedCall[] = [];
  const target: Record<string, unknown> = {};
  const record =
    (name: string, result?: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      calls.push({ name, args });
      return result?.(...args);
    };
  for (const name of METHODS) target[name] = record(name);
  target.measureText = record('measureText', (text) => ({ width: String(text).length * 8 }));
  const gradient = () => ({ addColorStop: record('addColorStop') });
  target.createLinearGradient = record('createLinearGradient', gradient);
  target.createRadialGradient = record('createRadialGradient', gradient);
  const values: Record<string, unknown> = { ...PROPERTIES };
  for (const key of Object.keys(PROPERTIES)) {
    Object.defineProperty(target, key, {
      enumerable: true,
      get: () => values[key],
      set: (value: unknown) => {
        values[key] = value;
        calls.push({ name: `set:${key}`, args: [value] });
      },
    });
  }
  Object.defineProperty(target, 'canvas', { enumerable: true, get: () => canvas });
  const named = (name: string) => calls.filter((c) => c.name === name);
  return {
    ctx: target as unknown as CanvasRenderingContext2D,
    calls,
    count: (name) => named(name).length,
    argsOf: (name) => named(name).map((c) => c.args),
    valuesOf: (property) => named(`set:${property}`).map((c) => c.args[0]),
    clear: () => {
      calls.length = 0;
    },
  };
}

export interface FakeCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly context: FakeContext;
}

/** width·height와 getContext('2d')만 있는 가짜 캔버스 */
export function createFakeCanvas(width = 300, height = 150): FakeCanvas {
  const element = {
    width,
    height,
    getContext: (kind: string) => (kind === '2d' ? context.ctx : null),
  };
  const canvas = element as unknown as HTMLCanvasElement;
  const context = createFakeContext(canvas);
  return { canvas, context };
}

export interface ManualStageDeps extends StageDeps {
  /** 지금 시각(ms) */
  readonly time: number;
  /** 등록돼 기다리는 프레임 콜백 수 */
  readonly pendingFrames: number;
  /** cancelFrame으로 취소된 id */
  readonly canceled: readonly number[];
  /** createCanvas로 만든 가짜 캔버스 */
  readonly canvases: readonly FakeCanvas[];
  /** 시계를 ms만큼 돌리며 frameMs마다 기다리는 프레임 콜백을 그 시각으로 부른다 */
  advance(ms: number, frameMs?: number): void;
  /** 시계는 그대로 두고 기다리는 프레임 콜백을 한 번 부른다 */
  step(): void;
}

export function createManualDeps(start = 0): ManualStageDeps {
  let time = start;
  let nextId = 1;
  const frames = new Map<number, (t: number) => void>();
  const canceled: number[] = [];
  const canvases: FakeCanvas[] = [];
  const step = () => {
    const due = [...frames.values()];
    frames.clear();
    for (const cb of due) cb(time);
  };
  return {
    now: () => time,
    requestFrame: (cb) => {
      const id = nextId++;
      frames.set(id, cb);
      return id;
    },
    cancelFrame: (id) => {
      canceled.push(id);
      frames.delete(id);
    },
    createCanvas: (width, height) => {
      const fake = createFakeCanvas(width, height);
      canvases.push(fake);
      return fake.canvas;
    },
    get time() {
      return time;
    },
    get pendingFrames() {
      return frames.size;
    },
    canceled,
    canvases,
    advance: (ms, frameMs = 16) => {
      let left = ms;
      while (left > 0) {
        const dt = Math.min(frameMs, left);
        time += dt;
        left -= dt;
        step();
      }
    },
    step,
  };
}

/** done()이 참이 될 때까지 frameMs씩 시계를 돌리고 걸린 시간(ms)을 돌려준다. maxMs를 넘기면 오류 */
export function advanceUntil(deps: ManualStageDeps, done: () => boolean, frameMs = 16, maxMs = 60_000): number {
  let elapsed = 0;
  while (!done()) {
    if (elapsed >= maxMs) throw new Error(`advanceUntil: ${maxMs}ms 안에 조건이 참이 되지 않았어요`);
    deps.advance(frameMs, frameMs);
    elapsed += frameMs;
  }
  return elapsed;
}

/** 이미 걸린 Promise 콜백이 모두 돌 때까지 기다린다 */
export function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
