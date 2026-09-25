import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LiveStatus } from './LiveStatus';

describe('LiveStatus', () => {
  it('기다리는 중이면 그렇게 말한다', () => {
    render(<LiveStatus loading error={null} />);
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
  });

  it('오류마다 다른 문구를 보여 주고 다시 받을 수 있다', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<LiveStatus loading={false} error="upstream" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('경기 기록을 가져오지 못했어요.');
    await user.click(screen.getByRole('button', { name: '다시 받기' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('요청 제한과 못 찾음은 따로 말한다', () => {
    const { rerender } = render(<LiveStatus loading={false} error="rate" />);
    expect(screen.getByRole('alert')).toHaveTextContent('잠깐 뒤에 다시');
    rerender(<LiveStatus loading={false} error="notFound" />);
    expect(screen.getByRole('alert')).toHaveTextContent('찾지 못했어요');
  });

  it('다시 받기 함수를 주지 않으면 버튼이 없다', () => {
    render(<LiveStatus loading={false} error="network" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('비었으면 준 문구를, 보여 줄 게 있으면 아무것도 그리지 않는다', () => {
    const { container, rerender } = render(<LiveStatus loading={false} error={null} empty="경기가 없어요." />);
    expect(screen.getByText('경기가 없어요.')).toBeInTheDocument();
    rerender(<LiveStatus loading={false} error={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
