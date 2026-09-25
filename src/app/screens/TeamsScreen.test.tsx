import { screen, within } from '@testing-library/react';
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
    const list = screen.getByRole('list', { name: '구단' });
    expect(within(list).getAllByRole('link')).toHaveLength(10);
    for (const name of ['KIA', '롯데', 'NC', '한화', 'LG', '두산', '삼성', 'SSG', 'KT', '키움']) {
      expect(within(list).getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('팀을 누르면 그 팀 일정으로 간다', () => {
    renderWithGame(<TeamsScreen />);
    expect(screen.getByRole('link', { name: '한화' })).toHaveAttribute('href', '#/team/HH');
  });

  it('팀을 눌러도 응원팀이 바뀌지 않는다', async () => {
    // 20-browse-ui step 1: 보는 것과 응원하는 것은 다르다
    const user = userEvent.setup();
    renderWithGame(<TeamsScreen />);
    await user.click(screen.getByRole('link', { name: '한화' }));
    expect(window.localStorage.getItem(FAVOURITE_TEAM_KEY)).toBeNull();
  });

  it('응원팀에는 표를 달고 지울 수 있다', async () => {
    const user = userEvent.setup();
    setFavouriteTeam('LT');
    renderWithGame(<TeamsScreen />);
    expect(screen.getByRole('link', { name: '롯데 내 팀' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '응원팀 지우기' }));
    expect(screen.getByRole('link', { name: '롯데' })).toBeInTheDocument();
    expect(window.localStorage.getItem(FAVOURITE_TEAM_KEY)).toBeNull();
  });

  it('팀이 없으면 지우기 버튼도 없다', () => {
    renderWithGame(<TeamsScreen />);
    expect(screen.queryByRole('button', { name: '응원팀 지우기' })).toBeNull();
  });

  it('응원팀은 이 기기에만 남고 목록을 가리지 않는다고 알린다', () => {
    // ADR-034: 브라우저 저장소 예외 하나. 사용자에게 숨기지 않는다
    renderWithGame(<TeamsScreen />);
    expect(screen.getByText(/이 기기에만/)).toBeInTheDocument();
  });
});
