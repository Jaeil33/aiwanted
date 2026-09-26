import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeShare } from '../../game';
import { fixtureGameSummaries, fixtureLiveGame } from '../../test/fixtures/live';
import { fakeLiveApi, fakePlatform, renderWithGame } from '../../test/gameHarness';
import type { LiveApi } from '../../live/providers/http';
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

/*
 * 22-home-hero: 배포 직전 첫 화면.
 * 지금 홈은 이 앱이 무엇인지 한 번도 말하지 않는다 — 정체성인 TMI가 홈에 한 글자도 없었다.
 */
describe('HomeScreen 히어로', () => {
  it('첫 화면이 이 앱이 무엇인지 말한다', () => {
    renderWithGame(<HomeScreen />, { platform: platformWith() });
    expect(screen.getByRole('heading', { name: /방금 그 타석, 만약 그랬다면\?/ })).toBeInTheDocument();
    expect(screen.getByText(/TMI 한 줄/)).toBeInTheDocument();
  });

  it('무엇을 쓰면 되는지 예시로 보여준다', () => {
    renderWithGame(<HomeScreen />, { platform: platformWith() });
    const examples = screen.getByRole('list', { name: 'TMI 예시' });
    expect(within(examples).getAllByRole('listitem').length).toBeGreaterThanOrEqual(3);
    expect(within(examples).getByText(/짜장면/)).toBeInTheDocument();
  });

  it('노란 버튼 하나가 최근 승부처로 바로 데려간다', async () => {
    renderWithGame(<HomeScreen />, { platform: platformWith() });
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /아무 타석에나 TMI 걸기/ }).getAttribute('href')).toMatch(/^#\/pa\//),
    );
  });

  it('승부처를 아직 못 받았으면 버튼이 구단 목록으로 간다', () => {
    // 경기 API가 아예 없는 아티팩트 미리보기(ADR-036)에서도 버튼이 죽지 않는다
    renderWithGame(<HomeScreen />, { platform: fakePlatform() });
    expect(screen.getByRole('link', { name: /아무 타석에나 TMI 걸기/ })).toHaveAttribute('href', '#/teams');
  });

  it('승부처를 기다리는 동안 빈 상자가 아니라 뼈대를 보여준다', async () => {
    const liveApi: LiveApi = { games: async () => games, game: () => new Promise<never>(() => {}) };
    renderWithGame(<HomeScreen />, { platform: fakePlatform({ liveApi, today: () => '2026-09-20' }) });
    await waitFor(() => expect(document.querySelectorAll('[data-skeleton]').length).toBeGreaterThan(0));
    expect(screen.queryByText('승부처를 고르는 중…')).toBeNull();
  });

  it('경기 카드마다 TMI 걸기가 타석 전체 바로 위에 있다', async () => {
    // 승부처 줄은 "그 상황 보기", 노란 줄은 "여기서 바로 걸기", 테두리 줄은 "더 보기"
    renderWithGame(<HomeScreen />, { platform: platformWith() });
    const feed = await screen.findByRole('list', { name: '추천 승부처' });
    await waitFor(() => expect(within(feed).getAllByRole('link', { name: /이 타석에 TMI 걸기/ }).length).toBeGreaterThan(0));

    const card = within(feed).getAllByRole('article')[0];
    const cta = within(card).getByRole('link', { name: /이 타석에 TMI 걸기/ });
    const more = within(card).getByRole('link', { name: /이 경기 타석 전체/ });

    // 그 경기의 첫 승부처로 간다
    const firstPick = within(card).getAllByRole('link').find((a) => a.getAttribute('href')?.startsWith('#/pa/'));
    expect(cta).toHaveAttribute('href', firstPick?.getAttribute('href') ?? '');
    // "이 경기 타석 전체" 바로 위다
    expect(cta.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('승부처를 못 받은 경기에는 TMI 걸기를 달지 않는다', async () => {
    const liveApi: LiveApi = { games: async () => games, game: () => new Promise<never>(() => {}) };
    renderWithGame(<HomeScreen />, { platform: fakePlatform({ liveApi, today: () => '2026-09-20' }) });
    const feed = await screen.findByRole('list', { name: '추천 승부처' });
    await waitFor(() => expect(within(feed).getAllByRole('article').length).toBeGreaterThan(0));
    expect(within(feed).queryByRole('link', { name: /이 타석에 TMI 걸기/ })).toBeNull();
    // 갈 곳 없는 버튼을 흐리게 두느니 아예 안 단다. 타석 전체는 그대로 있다
    expect(within(feed).getAllByRole('link', { name: /이 경기 타석 전체/ }).length).toBeGreaterThan(0);
  });

  it('예시를 누르면 그 문장이 걸린 채로 타석이 열린다', async () => {
    // 공유 값(?t=)이 이미 TMI 문장을 싣고 다닌다(src/game/share.ts) — 한 탭 데모에 그대로 쓴다
    renderWithGame(<HomeScreen />, { platform: platformWith() });
    const examples = screen.getByRole('list', { name: 'TMI 예시' });
    await waitFor(() => expect(within(examples).getAllByRole('link').length).toBeGreaterThan(0));

    const href = within(examples).getAllByRole('link')[0].getAttribute('href') ?? '';
    const [path, query] = href.slice(1).split('?');
    expect(path).toMatch(/^\/pa\/\d{8}[A-Z]{4}\d{5}\/\d+$/);

    const share = decodeShare(new URLSearchParams(query).get('t') ?? '');
    expect(share).not.toBeNull();
    expect(share?.sceneId).toBe(path.slice('/pa/'.length).replace('/', '-'));
    expect(share?.texts).toHaveLength(1);
    expect(share?.mode).toBe('real');
  });
});
