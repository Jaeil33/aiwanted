import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderWithGame } from '../../test/gameHarness';
import { TeamsScreen } from './TeamsScreen';

beforeEach(() => {
  window.history.replaceState(null, '', '/#/teams');
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
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

  it('응원팀을 정하는 자리가 없다', () => {
    // 20-browse-ui step 3: 내 팀 개념을 없앴다. 어느 팀도 다른 팀보다 앞에 오지 않는다
    renderWithGame(<TeamsScreen />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/응원/)).toBeNull();
    expect(screen.queryByText('내 팀')).toBeNull();
  });

  it('브라우저 저장소를 건드리지 않는다', () => {
    renderWithGame(<TeamsScreen />);
    expect(window.localStorage.length).toBe(0);
  });
});
