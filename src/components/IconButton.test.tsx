import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import styles from './IconButton.module.css';

describe('IconButton', () => {
  it('label이 접근 이름이고 아이콘만 보인다. 누르면 onClick을 부른다', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton label="처음부터" icon={<Icon name="restart" />} onClick={onClick} />);
    const button = screen.getByRole('button', { name: '처음부터' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('aria-label', '처음부터');
    expect(button).toHaveClass(styles.button);
    expect(button).toHaveTextContent('');
    expect(button.querySelector('svg')).toHaveAttribute('data-icon', 'restart');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('넘겨받은 아이콘은 스크린리더에서 숨긴다', () => {
    render(<IconButton label="공유" icon={<svg data-testid="raw-icon" />} onClick={vi.fn()} />);
    expect(screen.getByTestId('raw-icon').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('disabled면 누를 수 없다', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton label="처음부터" icon={<Icon name="restart" />} onClick={onClick} disabled />);
    const button = screen.getByRole('button', { name: '처음부터' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
