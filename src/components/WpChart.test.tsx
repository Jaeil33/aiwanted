import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WpChart } from './WpChart';

const POINTS = [
  { label: '시작', value: 0.312 },
  { label: '1타석', value: 0.5 },
  { label: '2타석', value: 1 },
];

describe('WpChart', () => {
  it('요약 문장을 aria-label과 <title>에 둔다: "팀 승리확률 처음%에서 마지막%로"', () => {
    render(<WpChart points={POINTS} baseline={0.3} teamName="KIA" color="#F0474B" />);
    const chart = screen.getByRole('img', { name: 'KIA 승리확률 31.2%에서 100%로' });
    expect(chart.querySelector('title')).toHaveTextContent('KIA 승리확률 31.2%에서 100%로');
    expect(chart).toHaveAttribute('viewBox');
  });

  it('점마다 원을 그리고 선으로 잇고, 마지막 점을 강조한다', () => {
    const { container } = render(<WpChart points={POINTS} baseline={null} teamName="KIA" color="#F0474B" />);
    const dots = container.querySelectorAll('[data-point]');
    expect(dots).toHaveLength(3);
    expect(dots[2]).toHaveAttribute('data-last', 'true');
    expect(dots[0]).toHaveAttribute('data-last', 'false');
    expect(container.querySelector('[data-line]')).toHaveAttribute('stroke', '#F0474B');
  });

  it('점이 1개면 점만 그린다', () => {
    const { container } = render(<WpChart points={[POINTS[0]]} baseline={null} teamName="KIA" color="#F0474B" />);
    expect(screen.getByRole('img', { name: 'KIA 승리확률 31.2%' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-point]')).toHaveLength(1);
    expect(container.querySelector('[data-line]')).toBeNull();
  });

  it('점이 없으면 기록 없음 요약', () => {
    const { container } = render(<WpChart points={[]} baseline={null} teamName="롯데" color="#5C8DF6" />);
    expect(screen.getByRole('img', { name: '롯데 승리확률 기록 없음' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-point]')).toHaveLength(0);
  });

  it('0·50·100% 눈금과 50% 선', () => {
    const { container } = render(<WpChart points={POINTS} baseline={null} teamName="KIA" color="#F0474B" />);
    for (const tick of ['0%', '50%', '100%']) expect(screen.getByText(tick)).toBeInTheDocument();
    expect(container.querySelector('[data-mid]')).not.toBeNull();
  });

  it('baseline은 점선 수평선과 "TMI 없음" 라벨, 없으면 그리지 않는다', () => {
    const { container, rerender } = render(<WpChart points={POINTS} baseline={0.3} teamName="KIA" color="#F0474B" />);
    expect(screen.getByText('TMI 없음')).toBeInTheDocument();
    expect(container.querySelector('[data-baseline]')).toHaveAttribute('stroke-dasharray');
    rerender(<WpChart points={POINTS} baseline={null} teamName="KIA" color="#F0474B" />);
    expect(screen.queryByText('TMI 없음')).toBeNull();
    expect(container.querySelector('[data-baseline]')).toBeNull();
  });

  it('0~1 밖의 값은 끝에 붙인다', () => {
    const { container } = render(
      <WpChart points={[{ label: 'a', value: 1 }, { label: 'b', value: 1.4 }, { label: 'c', value: -0.2 }, { label: 'd', value: 0 }]} baseline={null} teamName="KIA" color="#F0474B" />,
    );
    const cy = [...container.querySelectorAll('[data-point]')].map((dot) => dot.getAttribute('cy'));
    expect(cy[1]).toBe(cy[0]);
    expect(cy[2]).toBe(cy[3]);
  });
});
