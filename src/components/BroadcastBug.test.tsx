import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BroadcastBug, type BroadcastBugProps } from './BroadcastBug';

const PROPS: BroadcastBugProps = {
  away: { name: 'KT', color: '#D6D6D6', score: 3 },
  home: { name: 'NC', color: '#86A8EE', score: 2 },
  inning: 9,
  half: 0,
  outs: 2,
  bases: 7,
  balls: 1,
  strikes: 2,
  backHref: '#/',
};

describe('BroadcastBug', () => {
  it('두 팀 이름·점수와 공격 팀 표시, 이닝·주자·볼카운트·아웃을 읽을 수 있게 그린다', () => {
    render(<BroadcastBug {...PROPS} />);
    const bug = screen.getByRole('group', { name: '스코어버그' });
    const rows = within(bug).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual(['KT3', 'NC2']);
    expect(rows.map((row) => row.getAttribute('data-batting'))).toEqual(['true', 'false']);
    expect(within(bug).getByLabelText('9회초')).toBeInTheDocument();
    expect(within(bug).getByLabelText('만루')).toBeInTheDocument();
    expect(within(bug).getByLabelText('1볼 2스트라이크')).toHaveTextContent('1-2');
    expect(within(bug).getByLabelText('2아웃')).toBeInTheDocument();
    expect(within(bug).getByRole('link', { name: '경기 목록으로' })).toHaveAttribute('href', '#/');
  });

  it('말 공격이면 홈 팀이 공격 팀이고, 주자가 없으면 "주자 없음"', () => {
    render(<BroadcastBug {...PROPS} half={1} bases={0} outs={0} balls={0} strikes={0} />);
    const bug = screen.getByRole('group', { name: '스코어버그' });
    expect(within(bug).getAllByRole('listitem').map((row) => row.getAttribute('data-batting'))).toEqual(['false', 'true']);
    expect(within(bug).getByLabelText('9회말')).toBeInTheDocument();
    expect(within(bug).getByLabelText('주자 없음')).toBeInTheDocument();
    expect(within(bug).getByLabelText('0아웃')).toBeInTheDocument();
  });
});
