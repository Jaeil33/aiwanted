import { describe, expect, it } from 'vitest';
import { advanceUntil, createFakeCanvas, createFakeContext, createManualDeps, flushMicrotasks } from './testing';

describe('createFakeContext', () => {
  it('메서드 호출과 인자를 순서대로 기록한다', () => {
    const fake = createFakeContext();
    fake.ctx.beginPath();
    fake.ctx.arc(1, 2, 3, 0, Math.PI);
    fake.ctx.fill();
    expect(fake.calls.map((c) => c.name)).toEqual(['beginPath', 'arc', 'fill']);
    expect(fake.argsOf('arc')).toEqual([[1, 2, 3, 0, Math.PI]]);
    expect(fake.count('fill')).toBe(1);
    expect(fake.count('stroke')).toBe(0);
  });

  it('스타일 속성 값을 기억하고, 설정한 값도 기록한다', () => {
    const fake = createFakeContext();
    expect(fake.ctx.globalAlpha).toBe(1);
    fake.ctx.fillStyle = '#FFB547';
    fake.ctx.globalAlpha = 0.5;
    fake.ctx.fillStyle = '#231503';
    expect(fake.ctx.fillStyle).toBe('#231503');
    expect(fake.ctx.globalAlpha).toBe(0.5);
    expect(fake.valuesOf('fillStyle')).toEqual(['#FFB547', '#231503']);
    expect(fake.valuesOf('shadowBlur')).toEqual([]);
  });

  it('measureText·그라데이션처럼 값을 돌려주는 메서드를 흉내 낸다', () => {
    const fake = createFakeContext();
    expect(fake.ctx.measureText('스트라이크').width).toBeGreaterThan(0);
    const gradient = fake.ctx.createLinearGradient(0, 0, 10, 0);
    gradient.addColorStop(0, '#000000');
    expect(fake.count('addColorStop')).toBe(1);
    expect(fake.ctx.createRadialGradient(0, 0, 0, 0, 0, 5)).toBeDefined();
    expect(fake.count('createLinearGradient')).toBe(1);
    expect(fake.count('createRadialGradient')).toBe(1);
  });

  it('clear로 기록만 비우고 속성 값은 그대로 둔다', () => {
    const fake = createFakeContext();
    fake.ctx.lineWidth = 3;
    fake.ctx.stroke();
    fake.clear();
    expect(fake.calls).toHaveLength(0);
    expect(fake.ctx.lineWidth).toBe(3);
  });
});

describe('createFakeCanvas', () => {
  it('크기를 갖고 getContext("2d")로 기록 컨텍스트를 준다', () => {
    const fake = createFakeCanvas(320, 180);
    expect(fake.canvas.width).toBe(320);
    expect(fake.canvas.height).toBe(180);
    expect(fake.canvas.getContext('2d')).toBe(fake.context.ctx);
    expect(fake.context.ctx.canvas).toBe(fake.canvas);
    fake.canvas.width = 960;
    expect(fake.canvas.width).toBe(960);
  });
});

describe('createManualDeps', () => {
  it('시계는 advance로만 흐르고, 프레임 콜백은 frameMs마다 그 시각으로 불린다', () => {
    const deps = createManualDeps(1000);
    const seen: number[] = [];
    const loop = (t: number) => {
      seen.push(t);
      deps.requestFrame(loop);
    };
    deps.requestFrame(loop);
    expect(deps.now()).toBe(1000);
    deps.advance(48, 16);
    expect(seen).toEqual([1016, 1032, 1048]);
    expect(deps.now()).toBe(1048);
    expect(deps.time).toBe(1048);
    expect(deps.pendingFrames).toBe(1);
  });

  it('step은 시계를 그대로 두고 대기 중인 프레임을 한 번만 부른다', () => {
    const deps = createManualDeps(5);
    const seen: number[] = [];
    const loop = (t: number) => {
      seen.push(t);
      deps.requestFrame(loop);
    };
    deps.requestFrame(loop);
    deps.step();
    expect(seen).toEqual([5]);
  });

  it('cancelFrame으로 취소한 콜백은 불리지 않고 취소한 id가 남는다', () => {
    const deps = createManualDeps();
    let called = false;
    const id = deps.requestFrame(() => {
      called = true;
    });
    deps.cancelFrame(id);
    deps.advance(100);
    expect(called).toBe(false);
    expect(deps.canceled).toEqual([id]);
    expect(deps.pendingFrames).toBe(0);
  });

  it('createCanvas는 가짜 캔버스를 만들어 모아 둔다', () => {
    const deps = createManualDeps();
    const canvas = deps.createCanvas(960, 540);
    expect(canvas.width).toBe(960);
    expect(canvas.height).toBe(540);
    expect(deps.canvases).toHaveLength(1);
    expect(deps.canvases[0].canvas).toBe(canvas);
  });
});

describe('advanceUntil', () => {
  it('조건이 참이 될 때까지 프레임 단위로 시계를 돌리고 걸린 시간을 준다', () => {
    const deps = createManualDeps();
    let frames = 0;
    const loop = () => {
      frames += 1;
      deps.requestFrame(loop);
    };
    deps.requestFrame(loop);
    expect(advanceUntil(deps, () => frames >= 5, 20)).toBe(100);
    expect(advanceUntil(deps, () => true)).toBe(0);
  });

  it('제한 시간 안에 조건이 참이 되지 않으면 오류를 던진다', () => {
    const deps = createManualDeps();
    expect(() => advanceUntil(deps, () => false, 16, 200)).toThrow();
  });
});

describe('flushMicrotasks', () => {
  it('앞서 걸린 then 콜백이 돌 때까지 기다린다', async () => {
    let done = false;
    void Promise.resolve()
      .then(() => undefined)
      .then(() => {
        done = true;
      });
    await flushMicrotasks();
    expect(done).toBe(true);
  });
});
