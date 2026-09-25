import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderWithGame } from '../../test/gameHarness';
import { FAVOURITE_TEAM_KEY, setFavouriteTeam } from '../useFavouriteTeam';
import { TeamsScreen } from './TeamsScreen';

beforeEach(() => {
  window.localStorage.clear();
  setFavouriteTeam(null);
  window.localStorage.clear();
  window.history.replaceState(null, '', '/#/teams');
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
});

describe('TeamsScreen', () => {
  it('10개 구단을 모두 보여준다', () => {
    renderWithGame(<TeamsScreen />);
    const buttons = screen.getAllByRole('button', { pressed: false });
    expect(buttons.length).toBeGreaterThanOrEqual(10);
    for (const name of ['KIA', '롯데', 'NC', '한화', 'LG', '두산', '삼성', 'SSG', 'KT', '키움']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('팀을 고르면 저장하고 그 팀 일정으로 간다', async () => {
    const user = userEvent.setup();
    renderWithGame(<TeamsScreen />);
    await user.click(screen.getByRole('button', { name: '한화' }));
    expect(window.localStorage.getItem(FAVOURITE_TEAM_KEY)).toBe('HH');
    expect(window.location.hash).toBe('#/team/HH');
  });

  it('고른 팀을 눌린 상태로 표시하고 지울 수 있다', async () => {
    const user = userEvent.setup();
    setFavouriteTeam('LT');
    renderWithGame(<TeamsScreen />);
    expect(screen.getByRole('button', { name: '롯데' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '응원팀 지우기' }));
    expect(screen.getByRole('button', { name: '롯데' })).toHaveAttribute('aria-pressed', 'false');
    expect(window.localStorage.getItem(FAVOURITE_TEAM_KEY)).toBeNull();
  });

  it('팀이 없으면 지우기 버튼도 없다', () => {
    renderWithGame(<TeamsScreen />);
    expect(screen.queryByRole('button', { name: '응원팀 지우기' })).toBeNull();
  });

  it('이 기기에만 남는다고 알린다', () => {
    // ADR-034: 브라우저 저장소 예외 하나. 사용자에게 숨기지 않는다
    renderWithGame(<TeamsScreen />);
    expect(screen.getByText(/이 기기에만/)).toBeInTheDocument();
  });
});
