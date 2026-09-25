import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureGameSummaries, fixtureLiveGame } from '../../test/fixtures/live';
import { fakeLiveApi, fakePlatform, renderWithGame } from '../../test/gameHarness';
import type { GameSummary } from '../../types/live';
import { HomeScreen } from './HomeScreen';

const GAME = fixtureLiveGame();
const BASE = fixtureGameSummaries()[2];

const games: GameSummary[] = [
  { ...BASE, gameId: '20260918LGOB02026', date: '2026-09-18', away: { code: 'LG', name: 'LG', score: 5 }, home: { code: 'OB', name: '두산', score: 2 } },
  { ...BASE, gameId: '20260919HTSK02026', date: '2026-09-19', away: { code: 'HT', name: 'KIA', score: 1 }, home: { code: 'SK', name: 'SSG', score: 4 } },
  { ...BASE, gameId: '20260920LGSS02026', date: '2026-09-20', away: { code: 'LG', name: 'LG', score: 6 }, home: { code: 'SS', name: '삼성', score: 6 } },
];

const platformWith = (over: Partial<Parameters<typeof fakeLiveApi>[0]> = {}) =>
  fakePlatform({ liveApi: fakeLiveApi({ games, game: GAME, ...over }), today: () => '2026-09-20' });

beforeEach(() => {
  window.history.replaceState(null, '', '/#/');
});
afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('HomeScreen', () => {
  it('어느 팀 일정으로든 홈에서 한 번에 간다', async () => {
    // 20-browse-ui step 2: 응원팀이 있든 없든 10구단이 늘 눈에 있다
    renderWithGame(<HomeScreen />, { platform: platformWith() });
    const strip = screen.getByRole('navigation', { name: '구단 일정' });
    expect(within(strip).getByRole('link', { name: 'LG' })).toHaveAttribute('href', '#/team/LG');
    expect(within(strip).getByRole('link', { name: '키움' })).toHaveAttribute('href', '#/team/WO');
    expect(within(strip).getByRole('link', { name: '구단 전체' })).toHaveAttribute('href', '#/teams');
    await waitFor(() => expect(screen.getAllByRole('link').length).toBeGreaterThan(1));
  });

  it('리그 전체 경기를 보여준다', async () => {
    // 20-browse-ui step 3: 응원팀 개념을 없앴다. 거르는 값도, 저장하는 값도 없다
    renderWithGame(<HomeScreen />, { platform: platformWith() });
    const feed = await screen.findByRole('list', { name: '추천 승부처' });
    await waitFor(() => expect(within(feed).getAllByRole('link').length).toBeGreaterThan(0));
    expect(within(feed).getByText(/SSG/)).toBeInTheDocument();
    expect(within(feed).getAllByText(/LG/).length).toBeGreaterThan(0);
    expect(screen.queryByText('내 팀')).toBeNull();
    expect(screen.queryByRole('group', { name: '보기' })).toBeNull();
  });

  it('브라우저 저장소를 건드리지 않는다', async () => {
    // ARCHITECTURE "상태 관리": 저장소는 쓰지 않는다. 공유할 값은 URL 해시에 둔다
    renderWithGame(<HomeScreen />, { platform: platformWith() });
    await screen.findByRole('list', { name: '추천 승부처' });
    expect(window.localStorage.length).toBe(0);
  });

  it('추천 승부처는 그 타석 화면으로 바로 간다', async () => {
    renderWithGame(<HomeScreen />, { platform: platformWith() });
    const feed = await screen.findByRole('list', { name: '추천 승부처' });
    await waitFor(() =>
      expect(within(feed).getAllByRole('link').some((link) => link.getAttribute('href')?.startsWith('#/pa/'))).toBe(true),
    );
    const hrefs = within(feed).getAllByRole('link').map((link) => link.getAttribute('href') ?? '');
    // 승부처는 타석 화면으로, 나머지 한 줄은 그 경기 타석 목록으로 간다
    expect(hrefs.filter((href) => /^#\/pa\/\d{8}[A-Z]{4}\d{5}\/\d+$/.test(href)).length).toBeGreaterThan(0);
    expect(hrefs.every((href) => /^#\/(pa|game)\//.test(href))).toBe(true);
  });

  it('타석 결과를 미리 보여 주지 않는다', async () => {
    renderWithGame(<HomeScreen />, { platform: platformWith() });
    const feed = await screen.findByRole('list', { name: '추천 승부처' });
    await waitFor(() => expect(within(feed).getAllByRole('link').length).toBeGreaterThan(0));
    expect(within(feed).queryByText(/홈런|삼진|볼넷/)).toBeNull();
  });

  it('일정을 못 받으면 다시 받을 수 있다', async () => {
    renderWithGame(<HomeScreen />, { platform: platformWith({ fail: true }) });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '다시 받기' })).toBeInTheDocument();
  });

  it('경기 API가 없으면 그렇게 알린다', () => {
    renderWithGame(<HomeScreen />, { platform: fakePlatform() });
    expect(screen.getByText(/경기를 불러올 수 없/)).toBeInTheDocument();
  });
});
