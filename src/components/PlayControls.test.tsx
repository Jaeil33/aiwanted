import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlayControls, type PlayControlsProps } from './PlayControls';

const props = (over: Partial<PlayControlsProps> = {}): PlayControlsProps => ({
  canPitch: true,
  canFinish: true,
  busy: false,
  finished: false,
  onPitch: vi.fn(),
  onFinishPa: vi.fn(),
  onFinishGame: vi.fn(),
  onReset: vi.fn(),
  ...over,
});

const button = (name: string) => screen.getByRole('button', { name });
const NAMES = ['한 구 던지기', '이 타석 끝까지', '경기 끝까지', '처음부터'];

describe('PlayControls', () => {
  it('네 버튼을 누르면 각 핸들러를 부른다', async () => {
    const user = userEvent.setup();
    const p = props();
    render(<PlayControls {...p} />);
    await user.click(button('한 구 던지기'));
    await user.click(button('이 타석 끝까지'));
    await user.click(button('경기 끝까지'));
    await user.click(button('처음부터'));
    expect([p.onPitch, p.onFinishPa, p.onFinishGame, p.onReset].map((fn) => (fn as ReturnType<typeof vi.fn>).mock.calls.length)).toEqual([1, 1, 1, 1]);
  });

  it('canPitch가 false면 한 구·타석 버튼을, canFinish가 false면 경기 끝까지를 잠근다', () => {
    const { rerender } = render(<PlayControls {...props({ canPitch: false })} />);
    expect(NAMES.map((name) => button(name).hasAttribute('disabled'))).toEqual([true, true, false, false]);
    rerender(<PlayControls {...props({ canFinish: false })} />);
    expect(NAMES.map((name) => button(name).hasAttribute('disabled'))).toEqual([false, false, true, false]);
  });

  it('busy면 모든 버튼을 잠그고 aria-busy를 켠다', () => {
    const { container } = render(<PlayControls {...props({ busy: true })} />);
    expect(NAMES.map((name) => button(name).hasAttribute('disabled'))).toEqual([true, true, true, true]);
    expect(container.querySelector('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
  });

  it('경기가 끝나면 "처음부터"만 누를 수 있다', () => {
    render(<PlayControls {...props({ finished: true })} />);
    expect(NAMES.map((name) => button(name).hasAttribute('disabled'))).toEqual([true, true, true, false]);
  });
});
