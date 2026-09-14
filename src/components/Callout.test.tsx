import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CALLOUT_MS, Callout } from './Callout';
import styles from './Callout.module.css';

const QUERY = '(prefers-reduced-motion: reduce)';

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === QUERY,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const liveRegion = (container: HTMLElement) => container.querySelector('[aria-live="polite"]');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Callout', () => {
  it('콜 길이는 UI_GUIDE 1,150ms', () => {
    expect(CALLOUT_MS).toBe(1150);
  });

  it('live region(aria-live polite)은 늘 두고, 빈 text면 아무것도 보이지 않는다', () => {
    const { container, rerender } = render(<Callout text="" tone="ball" playKey={0} />);
    const region = liveRegion(container);
    expect(region).toHaveClass(styles.callout);
    expect(region).toBeEmptyDOMElement();
    rerender(<Callout text="" tone="ball" playKey={1} />);
    expect(region).toBeEmptyDOMElement();
  });

  it('마운트 때는 재생하지 않고, playKey가 바뀌면 tone과 함께 재생 클래스로 보여준다', () => {
    const { rerender } = render(<Callout text="볼" tone="ball" playKey={0} />);
    expect(screen.queryByText('볼')).toBeNull();
    rerender(<Callout text="볼" tone="ball" playKey={1} />);
    const call = screen.getByText('볼');
    expect(call).toHaveClass(styles.text, styles.play);
    expect(call).not.toHaveClass(styles.still);
    expect(call).toHaveAttribute('data-tone', 'ball');
  });

  it('같은 playKey로 다시 그리면 재생을 다시 시작하지 않고, 1,150ms 뒤 사라진 채로 둔다', () => {
    const { rerender } = render(<Callout text="" tone="strike" playKey={0} />);
    rerender(<Callout text="스트라이크" tone="strike" playKey={1} />);
    const first = screen.getByText('스트라이크');

    act(() => {
      vi.advanceTimersByTime(600);
    });
    rerender(<Callout text="스트라이크" tone="strike" playKey={1} />);
    expect(screen.getByText('스트라이크')).toBe(first);

    act(() => {
      vi.advanceTimersByTime(CALLOUT_MS - 600);
    });
    expect(screen.queryByText('스트라이크')).toBeNull();

    rerender(<Callout text="스트라이크" tone="strike" playKey={1} />);
    expect(screen.queryByText('스트라이크')).toBeNull();
  });

  it('playKey가 바뀔 때만 재생 클래스가 다시 붙는다(재생 중에 바뀌면 새로 시작)', () => {
    const { rerender } = render(<Callout text="" tone="ball" playKey={0} />);
    rerender(<Callout text="볼" tone="ball" playKey={1} />);
    const first = screen.getByText('볼');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    rerender(<Callout text="볼" tone="ball" playKey={2} />);
    const second = screen.getByText('볼');
    expect(second).not.toBe(first);
    expect(second).toHaveClass(styles.play);
    act(() => {
      vi.advanceTimersByTime(CALLOUT_MS - 1);
    });
    expect(screen.getByText('볼')).toBe(second);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('볼')).toBeNull();

    rerender(<Callout text="아웃" tone="out" playKey={3} />);
    expect(screen.getByText('아웃')).toHaveClass(styles.play);
    expect(screen.getByText('아웃')).toHaveAttribute('data-tone', 'out');
  });

  it('tone마다 data-tone을 달고 big은 큰 글자 클래스를 더한다', () => {
    const { rerender } = render(<Callout text="" tone="hit" playKey={0} />);
    rerender(<Callout text="안타" tone="hit" playKey={1} />);
    expect(screen.getByText('안타')).toHaveAttribute('data-tone', 'hit');
    expect(screen.getByText('안타')).not.toHaveClass(styles.big);
    rerender(<Callout text="끝내기!" tone="big" playKey={2} />);
    expect(screen.getByText('끝내기!')).toHaveAttribute('data-tone', 'big');
    expect(screen.getByText('끝내기!')).toHaveClass(styles.big);
  });

  it('동작 줄이기면 애니메이션 없이(still) 1,150ms 동안 보였다가 사라진다', () => {
    stubReducedMotion(true);
    const { rerender } = render(<Callout text="" tone="out" playKey={0} />);
    rerender(<Callout text="삼진" tone="out" playKey={1} />);
    const call = screen.getByText('삼진');
    expect(call).toHaveClass(styles.text, styles.still);
    expect(call).not.toHaveClass(styles.play);
    act(() => {
      vi.advanceTimersByTime(CALLOUT_MS - 1);
    });
    expect(screen.getByText('삼진')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('삼진')).toBeNull();
  });

  it('언마운트하면 타이머를 남기지 않는다', () => {
    const { rerender, unmount } = render(<Callout text="" tone="ball" playKey={0} />);
    rerender(<Callout text="볼" tone="ball" playKey={1} />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
