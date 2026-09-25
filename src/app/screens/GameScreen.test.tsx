import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixtureLiveGame } from '../../test/fixtures/live';
import { fakeLiveApi, fakePlatform, renderWithGame } from '../../test/gameHarness';
import { GameScreen } from './GameScreen';

const GAME = fixtureLiveGame();
const GAME_ID = GAME.summary.gameId;

const withGame = () => fakePlatform({ liveApi: fakeLiveApi({ game: GAME }) });

beforeEach(() => {
  window.history.replaceState(null, '', `/#/game/${GAME_ID}`);
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('GameScreen', () => {
  it('경기 머리말에 날짜·구장·최종 점수를 싣는다', async () => {
    // ADR-032 스포일러 정책: 경기 결과·스코어는 공개하고 그 타석 결과만 숨긴다
    renderWithGame(<GameScreen gameId={GAME_ID} />, { platform: withGame() });
    const head = await screen.findByRole('group', { name: '경기 결과' });
    expect(within(head).getByText('LG')).toBeInTheDocument();
    expect(within(head).getByText('두산')).toBeInTheDocument();
    expect(within(head).getByText(/9월 15일 .* · 잠실/)).toBeInTheDocument();
  });

  it('경기 머리말의 팀 이름에서 그 팀 달력으로 간다', async () => {
    // 20-browse-ui step 2: 경기 안에서도 다른 일정으로 나갈 길을 둔다
    renderWithGame(<GameScreen gameId={GAME_ID} />, { platform: withGame() });
    const head = await screen.findByRole('group', { name: '경기 결과' });
    expect(within(head).getByRole('link', { name: 'LG 일정' })).toHaveAttribute('href', '#/team/LG');
    expect(within(head).getByRole('link', { name: '두산 일정' })).toHaveAttribute('href', '#/team/OB');
  });

  it('타석마다 한 줄, 반이닝마다 묶어 보여준다', async () => {
    renderWithGame(<GameScreen gameId={GAME_ID} />, { platform: withGame() });
    const list = await screen.findByRole('list', { name: '전체 타석' });
    expect(within(list).getAllByRole('link')).toHaveLength(GAME.plateAppearances.length);
    expect(within(list).getByText('1회초')).toBeInTheDocument();
    expect(within(list).getByText('1회말')).toBeInTheDocument();
  });

  it('타석 줄은 그 타석 화면으로 간다', async () => {
    renderWithGame(<GameScreen gameId={GAME_ID} />, { platform: withGame() });
    const list = await screen.findByRole('list', { name: '전체 타석' });
    const first = within(list).getAllByRole('link')[0];
    expect(first).toHaveAttribute('href', `#/pa/${GAME_ID}/1`);
    // 이름은 번들 core가 먼저다(플레이 화면과 같은 이름을 쓴다). 픽스처 core의 a1은 '원정타자1'
    expect(first).toHaveTextContent('원정타자1');
    // 투수는 중계에 이름이 없고 픽스처 core에도 hp1이 없다: 중계에서 모은 이름으로 채운다
    expect(first).toHaveTextContent('최투수');
  });

  it('타석 결과는 목록에 싣지 않는다', async () => {
    renderWithGame(<GameScreen gameId={GAME_ID} />, { platform: withGame() });
    await screen.findByRole('list', { name: '전체 타석' });
    expect(screen.queryByText(/홈런/)).toBeNull();
    expect(screen.queryByText(/삼진/)).toBeNull();
  });

  it('승부처를 따로 위에 둔다', async () => {
    renderWithGame(<GameScreen gameId={GAME_ID} />, { platform: withGame() });
    const picks = await screen.findByRole('list', { name: '승부처' });
    const links = within(picks).getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    expect(links.length).toBeLessThanOrEqual(5);
    // 승부처 지수 숫자는 보여 주지 않는다(ADR-014)
    expect(within(picks).queryByText(/지수/)).toBeNull();
  });

  it('비교할 실제 결과가 없는 타석은 그렇게 적는다', async () => {
    renderWithGame(<GameScreen gameId={GAME_ID} />, { platform: withGame() });
    await screen.findByRole('list', { name: '전체 타석' });
    // 픽스처의 마지막 타석은 도루 실패로 끊겼다
    expect(screen.getAllByText('기록 없음').length).toBeGreaterThan(0);
  });

  it('못 불러오면 다시 받을 수 있다', async () => {
    renderWithGame(<GameScreen gameId={GAME_ID} />, { platform: fakePlatform({ liveApi: fakeLiveApi({ fail: true }) }) });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '다시 받기' })).toBeInTheDocument();
  });

  it('경기 API가 없으면 그렇게 알린다', () => {
    renderWithGame(<GameScreen gameId={GAME_ID} />, { platform: fakePlatform() });
    expect(screen.getByText(/경기를 불러올 수 없/)).toBeInTheDocument();
  });
});
