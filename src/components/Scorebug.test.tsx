import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Scorebug, type ScorebugProps } from './Scorebug';
import styles from './Scorebug.module.css';

const PROPS: ScorebugProps = {
  awayName: 'KIA',
  homeName: '롯데',
  awayColor: '#F0474B',
  homeColor: '#5C8DF6',
  awayScore: 4,
  homeScore: 4,
  inning: 9,
  half: 1,
  outs: 2,
  balls: 1,
  strikes: 2,
  bases: 7,
};

const litDots = (container: HTMLElement, kind: 'ball' | 'strike' | 'out') => container.querySelectorAll(`[data-dot="${kind}"][data-on="true"]`).length;

describe('Scorebug', () => {
  it('스크린리더용 한 문장으로 상황을 읽어 준다', () => {
    render(<Scorebug {...PROPS} />);
    expect(screen.getByText('9회말 2아웃, 주자 만루, 볼 1 스트라이크 2, KIA 4 대 롯데 4')).toBeInTheDocument();
  });

  it('초 공격·주자 없음·일부 루 문장', () => {
    const { rerender } = render(<Scorebug {...PROPS} inning={3} half={0} outs={0} bases={0} balls={0} strikes={0} awayScore={1} homeScore={0} />);
    expect(screen.getByText('3회초 0아웃, 주자 없음, 볼 0 스트라이크 0, KIA 1 대 롯데 0')).toBeInTheDocument();
    rerender(<Scorebug {...PROPS} bases={0b101} />);
    expect(screen.getByText('9회말 2아웃, 주자 1·3루, 볼 1 스트라이크 2, KIA 4 대 롯데 4')).toBeInTheDocument();
  });

  it('문장은 aria-live로 알리고, 방송 그래픽 판은 스크린리더에서 숨긴다', () => {
    const { container } = render(<Scorebug {...PROPS} />);
    const sentence = screen.getByText('9회말 2아웃, 주자 만루, 볼 1 스트라이크 2, KIA 4 대 롯데 4');
    expect(sentence).toHaveAttribute('aria-live', 'polite');
    const board = container.querySelector(`.${styles.board}`);
    expect(board).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('region', { name: '스코어버그' })).toContainElement(sentence);
  });

  it('원정·홈 두 줄에 팀 이름과 점수, 가운데 이닝을 보여준다', () => {
    const { container } = render(<Scorebug {...PROPS} awayScore={3} homeScore={5} />);
    expect(screen.getByText('KIA')).toBeInTheDocument();
    expect(screen.getByText('롯데')).toBeInTheDocument();
    expect(container.querySelector('[data-score="away"]')).toHaveTextContent('3');
    expect(container.querySelector('[data-score="home"]')).toHaveTextContent('5');
    expect(container.querySelector('[data-inning]')).toHaveTextContent('9');
    expect([...container.querySelectorAll('[data-team]')].map((row) => row.getAttribute('data-team'))).toEqual(['away', 'home']);
  });

  it('팀 줄마다 팀 색 선을 두고, 공격 팀 줄을 표시한다', () => {
    const { container, rerender } = render(<Scorebug {...PROPS} />);
    expect(container.querySelector('[data-team="away"] [data-swatch]')).toHaveStyle({ backgroundColor: '#F0474B' });
    expect(container.querySelector('[data-team="home"] [data-swatch]')).toHaveStyle({ backgroundColor: '#5C8DF6' });
    expect(container.querySelector('[data-team="home"]')).toHaveAttribute('data-batting', 'true');
    expect(container.querySelector('[data-team="home"]')).toHaveClass(styles.row, styles.batting);
    expect(container.querySelector('[data-team="away"]')).toHaveAttribute('data-batting', 'false');
    expect(container.querySelector('[data-team="away"]')).not.toHaveClass(styles.batting);
    rerender(<Scorebug {...PROPS} half={0} />);
    expect(container.querySelector('[data-team="away"]')).toHaveClass(styles.batting);
    expect(container.querySelector('[data-team="home"]')).not.toHaveClass(styles.batting);
  });

  it('초는 ▲, 말은 ▼', () => {
    const { container, rerender } = render(<Scorebug {...PROPS} half={1} />);
    expect(container.querySelector('[data-half]')).toHaveAttribute('data-half', 'bottom');
    expect(container.querySelector('[data-half]')).toHaveTextContent('▼');
    rerender(<Scorebug {...PROPS} half={0} />);
    expect(container.querySelector('[data-half]')).toHaveAttribute('data-half', 'top');
    expect(container.querySelector('[data-half]')).toHaveTextContent('▲');
  });

  it('B·S·O는 CountDots 점으로 켠다', () => {
    const { container, rerender } = render(<Scorebug {...PROPS} balls={3} strikes={1} outs={2} />);
    expect([litDots(container, 'ball'), litDots(container, 'strike'), litDots(container, 'out')]).toEqual([3, 1, 2]);
    rerender(<Scorebug {...PROPS} balls={0} strikes={2} outs={0} />);
    expect([litDots(container, 'ball'), litDots(container, 'strike'), litDots(container, 'out')]).toEqual([0, 2, 0]);
  });

  it('주자 다이아몬드를 함께 그린다', () => {
    const { container } = render(<Scorebug {...PROPS} bases={0b011} />);
    expect(container.querySelectorAll('[data-base][data-on="true"]')).toHaveLength(2);
  });
});
