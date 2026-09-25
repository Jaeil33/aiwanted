import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setFavouriteTeam } from '../app/useFavouriteTeam';
import { TeamStrip } from './TeamStrip';

beforeEach(() => {
  window.localStorage.clear();
  setFavouriteTeam(null);
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

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

  it('응원팀에는 표를 단다', () => {
    setFavouriteTeam('HH');
    render(<TeamStrip />);
    expect(screen.getByRole('link', { name: '한화 내 팀' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'LG' })).toBeInTheDocument();
  });
});
