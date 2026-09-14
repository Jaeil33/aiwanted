import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ModeToggle } from './ModeToggle';

describe('ModeToggle', () => {
  it('라디오 두 개(현실 모드·만화 모드) 중 지금 모드가 선택돼 있다', () => {
    render(<ModeToggle mode="real" disabled={false} onChange={vi.fn()} />);
    expect(screen.getByRole('radiogroup', { name: '계산 모드' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '현실 모드' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '만화 모드' })).not.toBeChecked();
  });

  it('다른 모드를 고르면 onChange(mode), 선택된 것을 다시 누르면 부르지 않는다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ModeToggle mode="real" disabled={false} onChange={onChange} />);
    await user.click(screen.getByRole('radio', { name: '현실 모드' }));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('radio', { name: '만화 모드' }));
    expect(onChange).toHaveBeenCalledWith('toon');
  });

  it('모드마다 아래 설명을 보여준다', () => {
    const { rerender } = render(<ModeToggle mode="real" disabled={false} onChange={vi.fn()} />);
    expect(screen.getByText('추정·설정 크기 그대로 계산해요')).toBeInTheDocument();
    rerender(<ModeToggle mode="toon" disabled={false} onChange={vi.fn()} />);
    expect(screen.getByText('효과를 6배로 과장해요. 재미용이에요')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '만화 모드' })).toBeChecked();
  });

  it('disabled면 두 라디오를 잠그고 onChange를 부르지 않는다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ModeToggle mode="real" disabled onChange={onChange} />);
    expect(screen.getByRole('radio', { name: '현실 모드' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: '만화 모드' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: '만화 모드' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
