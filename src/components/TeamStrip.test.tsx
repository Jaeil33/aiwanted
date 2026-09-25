import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TeamStrip } from './TeamStrip';

describe('TeamStrip', () => {
  it('10개 구단을 모두 한 번에 닿게 한다', () => {
    render(<TeamStrip />);
    const strip = screen.getByRole('navigation', { name: '구단 일정' });
    for (const [name, code] of [
      ['KIA', 'HT'], ['롯데', 'LT'], ['NC', 'NC'], ['한화', 'HH'], ['LG', 'LG'],
      ['두산', 'OB'], ['삼성', 'SS'], ['SSG', 'SK'], ['KT', 'KT'], ['키움', 'WO'],
    ] as const) {
      expect(within(strip).getByRole('link', { name })).toHaveAttribute('href', `#/team/${code}`);
    }
  });

  it('구단 목록 화면으로도 갈 수 있다', () => {
    render(<TeamStrip />);
    const strip = screen.getByRole('navigation', { name: '구단 일정' });
    expect(within(strip).getByRole('link', { name: '구단 전체' })).toHaveAttribute('href', '#/teams');
  });

  it('보고 있는 팀을 지금 자리로 표시한다', () => {
    render(<TeamStrip current="LG" />);
    expect(screen.getByRole('link', { name: 'LG' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'KIA' })).not.toHaveAttribute('aria-current');
  });

  it('어느 팀도 표를 달거나 자리를 옮기지 않는다', () => {
    // 20-browse-ui step 3: 내 팀 개념을 없앴다. 순서는 늘 teams.ts에 적은 차례다
    render(<TeamStrip />);
    const strip = screen.getByRole('navigation', { name: '구단 일정' });
    const names = within(strip).getAllByRole('link').map((link) => link.textContent);
    expect(names).toEqual(['KIA', '롯데', 'NC', '한화', 'LG', '두산', '삼성', 'SSG', 'KT', '키움', '구단 전체']);
    expect(window.localStorage.length).toBe(0);
  });
});
