import { act, render, screen } from '@testing-library/react';
import { StrictMode, createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BallparkStage } from './BallparkStage';
import { createStage } from './render/controller';
import { createFakeContext } from './render/testing';
import type { StageController, StageScene } from './render/types';

// 실제 createStage를 그대로 쓰되 호출을 기록한다.
vi.mock('./render/controller', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./render/controller')>();
  return { ...actual, createStage: vi.fn(actual.createStage) };
});

const SCENE: StageScene = {
  bat: { color: '#5C8DF6', home: true, bats: 'L' },
  fld: { color: '#F0474B', home: false, throws: 'R' },
};
const DEFAULT_LABEL = '경기장: 투수와 타자가 공을 주고받는 화면';

beforeEach(() => {
  vi.mocked(createStage).mockClear();
  // jsdom에는 캔버스 2D가 없으므로 호출을 기록하는 가짜 컨텍스트를 돌려준다.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => createFakeContext().ctx);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('BallparkStage', () => {
  it('컨테이너 div 안에 role="img" 캔버스 하나를 기본 aria-label로 그린다', () => {
    const { container } = render(<BallparkStage scene={null} />);
    const canvas = screen.getByRole('img', { name: DEFAULT_LABEL });
    expect(canvas.tagName).toBe('CANVAS');
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    expect(canvas.parentElement?.tagName).toBe('DIV');
  });

  it('label과 className을 받는다', () => {
    render(<BallparkStage scene={null} label="9회말 2사 만루, 픽스처 구장" className="wide" />);
    const canvas = screen.getByRole('img', { name: '9회말 2사 만루, 픽스처 구장' });
    expect(canvas.parentElement).toHaveClass('wide');
  });

  it('마운트할 때 컨트롤러를 한 번 만들고, ref로 그 컨트롤러(inspect·setBoard)를 그대로 쓴다', () => {
    const ref = createRef<StageController>();
    const { rerender } = render(<BallparkStage ref={ref} scene={SCENE} />);
    rerender(<BallparkStage ref={ref} scene={SCENE} bases={1} />);
    const create = vi.mocked(createStage);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(screen.getByRole('img'), { reducedMotion: false });
    expect(ref.current).toBe(create.mock.results[0].value);
    ref.current?.setBoard(['4 : 4', 'B1 S0 O2']);
    expect(ref.current?.inspect()).toMatchObject({ board: ['4 : 4', 'B1 S0 O2'], scene: SCENE, bases: 1, busy: false });
  });

  it('prop scene·bases·board가 바뀌면 컨트롤러에 넘긴다', () => {
    const ref = createRef<StageController>();
    const { rerender } = render(<BallparkStage ref={ref} scene={null} bases={0} />);
    expect(ref.current?.inspect()).toMatchObject({ scene: null, bases: 0, board: ['', ''] });
    rerender(<BallparkStage ref={ref} scene={SCENE} bases={5} board={['1 : 0', 'B0 S0 O1']} />);
    expect(ref.current?.inspect()).toMatchObject({ scene: SCENE, bases: 5, board: ['1 : 0', 'B0 S0 O1'] });
    rerender(<BallparkStage ref={ref} scene={SCENE} bases={7} board={['1 : 0', 'B0 S0 O1']} />);
    expect(ref.current?.inspect().bases).toBe(7);
  });

  it('동작 줄이기 설정이면 reducedMotion으로 만든다', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<BallparkStage scene={null} />);
    expect(vi.mocked(createStage)).toHaveBeenCalledWith(screen.getByRole('img'), { reducedMotion: true });
  });

  it('컨테이너 폭이 바뀌면(ResizeObserver) resize(폭, devicePixelRatio)를 부른다', () => {
    let notify: ResizeObserverCallback = () => {};
    const observed: Element[] = [];
    const disconnect = vi.fn();
    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        notify = callback;
      }
      observe(target: Element) {
        observed.push(target);
      }
      unobserve() {}
      disconnect() {
        disconnect();
      }
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.stubGlobal('devicePixelRatio', 3);
    const ref = createRef<StageController>();
    const { unmount } = render(<BallparkStage ref={ref} scene={null} />);
    const canvas = screen.getByRole('img') as HTMLCanvasElement;
    expect(observed).toEqual([canvas.parentElement]);
    const stage = ref.current as StageController;
    const resize = vi.spyOn(stage, 'resize');
    act(() => notify([{ contentRect: { width: 390 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(resize).toHaveBeenCalledWith(390, 3);
    expect(canvas.width / canvas.height).toBeCloseTo(16 / 9, 2);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it('ResizeObserver가 없으면 window resize 이벤트로 폭을 다시 잰다', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    vi.stubGlobal('devicePixelRatio', 2);
    const ref = createRef<StageController>();
    const { unmount } = render(<BallparkStage ref={ref} scene={null} />);
    const canvas = screen.getByRole('img') as HTMLCanvasElement;
    vi.spyOn(canvas.parentElement as HTMLElement, 'getBoundingClientRect').mockReturnValue({ width: 480, height: 270 } as DOMRect);
    const stage = ref.current as StageController;
    const resize = vi.spyOn(stage, 'resize');
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(resize).toHaveBeenCalledWith(480, 2);
    expect([canvas.width, canvas.height]).toEqual([960, 540]);
    unmount();
    resize.mockClear();
    window.dispatchEvent(new Event('resize'));
    expect(resize).not.toHaveBeenCalled();
  });

  it('언마운트하면 컨트롤러를 destroy해 기다리던 재생을 끝내고 ref를 비운다', async () => {
    const ref = createRef<StageController>();
    const { unmount } = render(<BallparkStage ref={ref} scene={SCENE} />);
    const stage = ref.current as StageController;
    const destroy = vi.spyOn(stage, 'destroy');
    const pending = stage.playPitch({ row: null, code: 'B', number: 1, bats: 'R' });
    expect(stage.inspect().busy).toBe(true);
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
    await pending;
    expect(stage.inspect().busy).toBe(false);
    expect(ref.current).toBeNull();
  });

  it('StrictMode에서 다시 마운트돼도 ref는 살아 있는 컨트롤러를 가리키고 prop이 반영된다', () => {
    const ref = createRef<StageController>();
    render(
      <StrictMode>
        <BallparkStage ref={ref} scene={SCENE} bases={2} />
      </StrictMode>,
    );
    const created = vi.mocked(createStage).mock.results.map((result) => result.value as StageController);
    expect(ref.current).toBe(created[created.length - 1]);
    expect(ref.current?.inspect()).toMatchObject({ scene: SCENE, bases: 2 });
  });

  it('2D 캔버스를 쓸 수 없는 환경에서도 렌더되고 ref가 상태를 반영한다', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const ref = createRef<StageController>();
    render(<BallparkStage ref={ref} scene={SCENE} bases={3} />);
    expect(ref.current?.inspect()).toMatchObject({ bases: 3, scene: SCENE });
    await ref.current?.playPitch({ row: null, code: 'B', number: 4, bats: 'R', basesAfter: 7 });
    expect(ref.current?.inspect().bases).toBe(7);
  });
});
