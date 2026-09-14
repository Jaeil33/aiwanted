import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PitchButton } from './PitchButton';
import styles from './PitchButton.module.css';

describe('PitchButton', () => {
  it('pitch: 접근 이름은 라벨 "던지기"이고 공 아이콘을 둔다. 누르면 onClick을 부른다', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<PitchButton mode="pitch" onClick={onClick} />);
    const button = screen.getByRole('button', { name: '던지기' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-mode', 'pitch');
    expect(button).toHaveClass(styles.button);
    expect(button.querySelector('svg')).toHaveAttribute('data-icon', 'ball');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('skip: 라벨 "건너뛰기"와 빨리 감기 아이콘으로 바뀐다', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<PitchButton mode="pitch" onClick={onClick} />);
    rerender(<PitchButton mode="skip" onClick={onClick} />);
    expect(screen.queryByRole('button', { name: '던지기' })).toBeNull();
    const button = screen.getByRole('button', { name: '건너뛰기' });
    expect(button).toHaveAttribute('data-mode', 'skip');
    expect(button.querySelector('svg')).toHaveAttribute('data-icon', 'fast-forward');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled면 누를 수 없다', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<PitchButton mode="pitch" onClick={onClick} disabled />);
    const button = screen.getByRole('button', { name: '던지기' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
