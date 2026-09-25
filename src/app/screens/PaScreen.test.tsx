import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixtureLiveGame } from '../../test/fixtures/live';
import { fakeLiveApi, fakePlatform, renderWithGame } from '../../test/gameHarness';
import { PaScreen } from './PaScreen';

const GAME = fixtureLiveGame();
const GAME_ID = GAME.summary.gameId;
const withGame = () => fakePlatform({ liveApi: fakeLiveApi({ game: GAME }) });

beforeEach(() => {
  window.history.replaceState(null, '', `/#/pa/${GAME_ID}/3`);
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('PaScreen', () => {
  it('그 타석을 열고 플레이 화면을 그린다', async () => {
    const view = renderWithGame(<PaScreen gameId={GAME_ID} no={3} share={null} />, { platform: withGame() });
    await waitFor(() => expect(view.game().session.situation?.id).toBe(`${GAME_ID}-3`));
    const situation = view.game().session.situation!;
    expect(situation.batter).toBe('a3');
    expect(situation.pitcher).toBe('hp1');
    expect(view.game().session.live?.state).toEqual(GAME.plateAppearances[2].before);
  });

  it('중계에서 모은 이름·손·투수 차례·투구 표본을 함께 넘긴다', async () => {
    const view = renderWithGame(<PaScreen gameId={GAME_ID} no={3} share={null} />, { platform: withGame() });
    await waitFor(() => expect(view.game().session.situation).not.toBeNull());
    const { extra } = view.game().session;
    expect(extra.names?.a3).toBe('김타자3');
    expect(extra.hands?.hp1?.throws).toBe('L');
    expect(extra.pitcherPlan?.length).toBeGreaterThan(0);
    expect(Object.keys(extra.gameRows ?? {})).toContain('hp1');
    expect(extra.actualFinal).toEqual({ away: 2, home: 0 });
  });

  it('같은 타석을 다시 그려도 다시 열지 않는다', async () => {
    const view = renderWithGame(<PaScreen gameId={GAME_ID} no={3} share={null} />, { platform: withGame() });
    await waitFor(() => expect(view.game().session.situation).not.toBeNull());
    const before = view.game().session.situation;
    view.rerender(<PaScreen gameId={GAME_ID} no={3} share={null} />);
    expect(view.game().session.situation).toBe(before);
  });

  it('없는 타석 번호면 그렇게 알린다', async () => {
    renderWithGame(<PaScreen gameId={GAME_ID} no={99} share={null} />, { platform: withGame() });
    expect(await screen.findByText(/그 타석이 없/)).toBeInTheDocument();
  });

  it('못 불러오면 다시 받을 수 있다', async () => {
    renderWithGame(<PaScreen gameId={GAME_ID} no={3} share={null} />, {
      platform: fakePlatform({ liveApi: fakeLiveApi({ fail: true }) }),
    });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '다시 받기' })).toBeInTheDocument();
  });

  it('경기 API가 없으면 그렇게 알린다', () => {
    renderWithGame(<PaScreen gameId={GAME_ID} no={3} share={null} />, { platform: fakePlatform() });
    expect(screen.getByText(/경기를 불러올 수 없/)).toBeInTheDocument();
  });
});
