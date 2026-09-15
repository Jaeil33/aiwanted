import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import styles from './Button.module.css';

describe('Button', () => {
  it('primary: 버튼 역할·글자가 접근 이름이고, 누르면 onClick을 부른다', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button variant="primary" onClick={onClick}>
        경기 입장
      </Button>,
    );
    const button = screen.getByRole('button', { name: '경기 입장' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass(styles.button, styles.primary);
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('secondary·text variant마다 클래스를 단다', () => {
    const { rerender } = render(<Button variant="secondary">결과 카드 공유</Button>);
    expect(screen.getByRole('button', { name: '결과 카드 공유' })).toHaveClass(styles.button, styles.secondary);
    rerender(<Button variant="text">다른 장면</Button>);
    expect(screen.getByRole('button', { name: '다른 장면' })).toHaveClass(styles.button, styles.text);
    expect(screen.getByRole('button', { name: '다른 장면' })).not.toHaveClass(styles.secondary);
  });

  it('disabled면 disabled 속성을 달고 onClick을 부르지 않는다', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button variant="primary" onClick={onClick} disabled>
        같은 TMI로 다시
      </Button>,
    );
    const button = screen.getByRole('button', { name: '같은 TMI로 다시' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('type submit으로 폼을 제출하고, aria-label이 있으면 접근 이름으로 쓴다', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
    render(
      <form onSubmit={(event) => onSubmit(event.nativeEvent as SubmitEvent)}>
        <Button variant="primary" type="submit" aria-label="TMI 한 줄 걸기">
          TMI 걸기
        </Button>
      </form>,
    );
    const button = screen.getByRole('button', { name: 'TMI 한 줄 걸기' });
    expect(button).toHaveAttribute('type', 'submit');
    await user.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('size lg는 큰 버튼 클래스를 달고, className은 덧붙인다', () => {
    render(
      <Button variant="primary" size="lg" className="hero-cta">
        경기 입장
      </Button>,
    );
    const button = screen.getByRole('button', { name: '경기 입장' });
    expect(button).toHaveClass(styles.button, styles.primary, styles.lg, 'hero-cta');
  });
});
