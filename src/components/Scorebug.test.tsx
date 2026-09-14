import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Scorebug, type ScorebugProps } from './Scorebug';

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

  it('팀 이름·점수·이닝·볼·스트라이크를 전광판 숫자로 보여준다', () => {
    const { container } = render(<Scorebug {...PROPS} awayScore={3} homeScore={5} balls={3} strikes={1} />);
    expect(screen.getByText('KIA')).toBeInTheDocument();
    expect(screen.getByText('롯데')).toBeInTheDocument();
    expect(container.querySelector('[data-score="away"]')).toHaveTextContent('3');
    expect(container.querySelector('[data-score="home"]')).toHaveTextContent('5');
    expect(container.querySelector('[data-inning]')).toHaveTextContent('9');
    expect(container.querySelector('[data-count="balls"]')).toHaveTextContent('3');
    expect(container.querySelector('[data-count="strikes"]')).toHaveTextContent('1');
  });

  it('팀 이름 옆에 팀 컬러 막대를 두고 공격 팀을 표시한다', () => {
    const { container } = render(<Scorebug {...PROPS} />);
    expect(container.querySelector('[data-team="away"] [data-swatch]')).toHaveStyle({ backgroundColor: '#F0474B' });
    expect(container.querySelector('[data-team="home"] [data-swatch]')).toHaveStyle({ backgroundColor: '#5C8DF6' });
    expect(container.querySelector('[data-team="home"]')).toHaveAttribute('data-batting', 'true');
    expect(container.querySelector('[data-team="away"]')).toHaveAttribute('data-batting', 'false');
  });

  it('초는 위 삼각형, 말은 아래 삼각형', () => {
    const { container, rerender } = render(<Scorebug {...PROPS} half={1} />);
    expect(container.querySelector('[data-half]')).toHaveAttribute('data-half', 'bottom');
    rerender(<Scorebug {...PROPS} half={0} />);
    expect(container.querySelector('[data-half]')).toHaveAttribute('data-half', 'top');
  });

  it('아웃 점 3개 중 아웃 수만큼 켠다 (3아웃이면 모두)', () => {
    const { container, rerender } = render(<Scorebug {...PROPS} outs={2} />);
    const lit = () => [...container.querySelectorAll('[data-out-dot]')].map((dot) => dot.getAttribute('data-on'));
    expect(lit()).toEqual(['true', 'true', 'false']);
    rerender(<Scorebug {...PROPS} outs={3} />);
    expect(lit()).toEqual(['true', 'true', 'true']);
    rerender(<Scorebug {...PROPS} outs={0} />);
    expect(lit()).toEqual(['false', 'false', 'false']);
  });

  it('주자 다이아몬드를 함께 그린다', () => {
    const { container } = render(<Scorebug {...PROPS} bases={0b011} />);
    expect(container.querySelectorAll('[data-base][data-on="true"]')).toHaveLength(2);
  });
});
