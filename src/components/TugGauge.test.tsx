import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Chip } from './Chip';
import { Tabs } from './Tabs';
import { TugGauge, type TugGaugeProps } from './TugGauge';
import styles from './TugGauge.module.css';

const PROPS: TugGaugeProps = {
  leftLabel: 'KT 승리',
  rightLabel: 'NC 승리',
  left: 0.54,
  right: 0.327,
  tie: 0.133,
  leftColor: '#D6D6D6',
  rightColor: '#86A8EE',
  ghost: 0.536,
  delta: '+0.4%p',
  deltaTone: 'up',
};

const value = (container: HTMLElement, side: string) => container.querySelector(`[data-side="${side}"] [data-value]`);
const segments = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-seg]')];

describe('TugGauge', () => {
  it('좌우 큰 숫자는 formatPct, 무승부는 가운데 작게 둔다', () => {
    const { container } = render(<TugGauge {...PROPS} />);
    expect(value(container, 'left')).toHaveTextContent('54.0%');
    expect(value(container, 'right')).toHaveTextContent('32.7%');
    expect(value(container, 'tie')).toHaveTextContent('13.3%');
    expect(value(container, 'left')).toHaveClass(styles.big);
    expect(value(container, 'tie')).not.toHaveClass(styles.big);
    expect(screen.getByText('KT 승리')).toBeInTheDocument();
    expect(screen.getByText('NC 승리')).toBeInTheDocument();
    expect(screen.getByText('무승부')).toBeInTheDocument();
  });

  it('role="img"에 요약 aria-label을 단다', () => {
    render(<TugGauge {...PROPS} />);
    expect(screen.getByRole('img', { name: 'KT 승리 54.0%, 무승부 13.3%, NC 승리 32.7%, TMI 반영 +0.4%p' })).toBeInTheDocument();
  });

  it('막대는 왼쪽 팀 색 | 무승부 빗금 | 오른쪽 팀 색 순서의 flex-basis 비율이다', () => {
    const { container } = render(<TugGauge {...PROPS} />);
    const [left, tie, right] = segments(container);
    expect(segments(container).map((seg) => seg.getAttribute('data-seg'))).toEqual(['left', 'tie', 'right']);
    expect(left).toHaveStyle({ flexBasis: '54%', backgroundColor: '#D6D6D6' });
    expect(tie).toHaveStyle({ flexBasis: '13.3%' });
    expect(tie).toHaveClass(styles.tie);
    expect(right).toHaveStyle({ flexBasis: '32.7%', backgroundColor: '#86A8EE' });
    expect(left).toHaveClass(styles.seg);
  });

  it('막대 비율은 0~1로 자르고 숫자가 아니면 0으로 둔다', () => {
    const { container } = render(<TugGauge {...PROPS} left={1.2} right={Number.NaN} tie={-0.1} />);
    const [left, tie, right] = segments(container);
    expect(left).toHaveStyle({ flexBasis: '100%' });
    expect(tie).toHaveStyle({ flexBasis: '0%' });
    expect(right).toHaveStyle({ flexBasis: '0%' });
  });

  it('ghost(TMI 없음의 왼쪽 값) 위치에 표시선을 두고, null이면 없다', () => {
    const { container, rerender } = render(<TugGauge {...PROPS} />);
    const ghost = container.querySelector<HTMLElement>('[data-ghost]');
    expect(ghost).toHaveClass(styles.ghost);
    expect(ghost).toHaveStyle({ left: '53.6%' });
    rerender(<TugGauge {...PROPS} ghost={null} />);
    expect(container.querySelector('[data-ghost]')).toBeNull();
  });

  it('tie가 null이면 무승부 숫자와 빗금을 숨기고 요약에서도 뺀다', () => {
    const { container } = render(
      <TugGauge {...PROPS} leftLabel="최원준 출루" rightLabel="이용준 아웃" left={0.414} right={0.586} tie={null} delta="+0.7%p" />,
    );
    expect(container.querySelector('[data-side="tie"]')).toBeNull();
    expect(screen.queryByText('무승부')).toBeNull();
    expect(segments(container).map((seg) => seg.getAttribute('data-seg'))).toEqual(['left', 'right']);
    expect(screen.getByRole('img', { name: '최원준 출루 41.4%, 이용준 아웃 58.6%, TMI 반영 +0.7%p' })).toBeInTheDocument();
  });

  it('delta는 Chip delta(tone)로 보여주고, null이면 칩과 요약의 TMI 부분이 없다', () => {
    const { rerender } = render(<TugGauge {...PROPS} delta="−0.07%p" deltaTone="down" />);
    const chip = screen.getByText('−0.07%p').closest('[data-kind="delta"]');
    expect(chip).toHaveAttribute('data-tone', 'down');
    expect(chip).toHaveTextContent('TMI');
    rerender(<TugGauge {...PROPS} delta={null} deltaTone="flat" />);
    expect(document.querySelector('[data-kind="delta"]')).toBeNull();
    expect(screen.getByRole('img', { name: 'KT 승리 54.0%, 무승부 13.3%, NC 승리 32.7%' })).toBeInTheDocument();
  });

  it('pending이면 "계산 중…"을 같은 live region으로 알리고 막대는 그대로 둔다', () => {
    const { container, rerender } = render(<TugGauge {...PROPS} />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live).toHaveTextContent('');
    rerender(<TugGauge {...PROPS} pending />);
    expect(container.querySelector('[aria-live="polite"]')).toBe(live);
    expect(live).toHaveTextContent('계산 중…');
    expect(container.firstElementChild).toHaveAttribute('data-pending', 'true');
    expect(segments(container)).toHaveLength(3);
    expect(value(container, 'left')).toHaveTextContent('54.0%');
  });

  it('head(탭) 자리와 children(모드·등급 라벨) 자리를 막대 요약 밖에 둔다', () => {
    render(
      <TugGauge {...PROPS} head={<Tabs label="승률 단계" items={[{ id: 'game', label: '경기' }]} value="game" onChange={vi.fn()} />}>
        <Chip kind="mode">현실 모드</Chip>
        <Chip kind="grade" grade="fun">
          상상 1장
        </Chip>
      </TugGauge>,
    );
    const img = screen.getByRole('img');
    const tablist = screen.getByRole('tablist', { name: '승률 단계' });
    expect(img).not.toContainElement(tablist);
    expect(img).not.toContainElement(screen.getByText('현실 모드'));
    expect(screen.getByText('상상 1장').closest(`.${styles.foot}`)).not.toBeNull();
    expect(within(tablist).getByRole('tab', { name: '경기' })).toBeInTheDocument();
  });
});
