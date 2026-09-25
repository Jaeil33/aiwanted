import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixtureGameSummaries, fixtureLiveGame } from '../test/fixtures/live';
import { fixtureAppData } from '../test/fixtures/appData';
import { fakeLiveApi, fakePlatform } from '../test/gameHarness';
import type { AppData } from '../types/data';
import { App, todayText } from './App';
import styles from './App.module.css';
import appCss from './App.module.css?raw';
import type { Platform } from './platform';

const SOURCES = '기록·중계: 네이버 스포츠(KBO) · 날씨: Open-Meteo · 확률: TMI 야구 엔진 계산값';
const TAGLINE = '쓸모없는 변수, 진짜 쓸모없을까?';
const LIVE_GAME = fixtureLiveGame();
const SEASON_GAMES = [{ ...fixtureGameSummaries()[2], gameId: '20260814HTLT02026', date: '2026-08-14' }];
/** 시즌 탐색이 도는 플랫폼: 일정 하나, 경기 하나 */
const seasonPlatform = () => fakePlatform({ liveApi: fakeLiveApi({ games: SEASON_GAMES, game: LIVE_GAME }) });

const goto = (hash: string) => window.history.replaceState(null, '', `/${hash}`);
beforeEach(() => goto(''));
afterEach(() => goto(''));

const tabBar = () => screen.getByRole('navigation', { name: '주 메뉴' });
const tabCurrents = () =>
  within(tabBar())
    .getAllByRole('link')
    .map((link) => link.getAttribute('aria-current'));

/** MenuFrame: 상단 바(브랜드 h1) · 본문 · 출처 한 줄 · 하단 탭바가 한 게임 열 안에 있다 */
function expectMenuFrame() {
  const banner = screen.getByRole('banner');
  expect(banner).toHaveClass(styles.topbar);
  const brand = within(banner).getByRole('heading', { level: 1, name: 'TMI 야구' });
  expect(within(brand).getByRole('link', { name: 'TMI 야구' })).toHaveAttribute('href', '#/');
  expect(within(brand).getByText('야구')).toHaveClass(styles.brandAccent);
  const main = screen.getByRole('main');
  expect(main).toHaveClass(styles.menuMain);
  const sources = screen.getByText(SOURCES);
  expect(sources).toHaveClass(styles.sources);
  expect(main).not.toContainElement(sources);
  const column = main.closest(`.${styles.column}`);
  expect(column).not.toBeNull();
  expect(column).toContainElement(banner);
  expect(column).toContainElement(sources);
  expect(column).toContainElement(tabBar());
}

/** GameFrame: 머리말·탭바·출처 없이 본문만(제목 h1은 스크린리더용) */
function expectGameFrame() {
  const main = screen.getByRole('main');
  expect(document.querySelector(`.${styles.topbar}`)).toBeNull();
  expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
  expect(screen.queryByText(SOURCES)).toBeNull();
  expect(main).toHaveClass(styles.gameMain);
  expect(main.closest(`.${styles.column}`)).not.toBeNull();
  expect(screen.getByRole('heading', { level: 1, name: 'TMI 야구' })).toHaveClass(styles.srOnly);
}

describe('todayText', () => {
  it('YYYY-MM-DD를 "9월 15일 (화)"로 쓴다', () => {
    expect(todayText('2026-09-15')).toBe('9월 15일 (화)');
    expect(todayText('2026-08-15')).toBe('8월 15일 (토)');
  });
});

describe('App', () => {
  it('데이터가 없으면 MenuFrame 안에 안내를 보여주고 브랜드·출처·탭바는 그대로 둔다', () => {
    render(<App data={null} />);
    expectMenuFrame();
    expect(screen.getByRole('main')).toHaveTextContent('앱 데이터가 없어요. npm run data로 만든 뒤 다시 빌드하세요.');
    expect(tabCurrents()).toEqual(['page', null, null]);
  });

  it('홈(#/)은 MenuFrame: 상단 바에 브랜드와 오늘 날짜, 본문에 추천 승부처, 탭바는 경기가 지금 탭', () => {
    render(<App data={fixtureAppData} />);
    expectMenuFrame();
    expect(within(screen.getByRole('banner')).getByText(/^\d+월 \d+일/)).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByText(TAGLINE)).toBeInTheDocument();
    expect(within(tabBar()).getByRole('link', { name: '경기' })).toHaveAttribute('href', '#/');
    expect(tabCurrents()).toEqual(['page', null, null]);
  });

  it('시즌 경로: 팀 고르기 → 그 팀 달력 → 경기 타석 목록 → 타석', async () => {
    goto('#/teams');
    render(<App data={fixtureAppData} platformPromise={Promise.resolve(seasonPlatform())} />);
    expect(await screen.findByRole('heading', { level: 2, name: '구단 일정' })).toBeInTheDocument();
    expectMenuFrame();

    act(() => {
      window.location.hash = '#/team/HT?m=2026-08';
    });
    expect(await screen.findByRole('heading', { level: 2, name: 'KIA · 2026년 8월' })).toBeInTheDocument();

    act(() => {
      window.location.hash = '#/game/20260814HTLT02026';
    });
    expect(await screen.findByRole('list', { name: '전체 타석' })).toBeInTheDocument();

    act(() => {
      window.location.hash = '#/pa/20260814HTLT02026/3';
    });
    expect(await screen.findByRole('group', { name: '스코어버그' }, { timeout: 90_000 })).toBeInTheDocument();
    expectGameFrame();
  }, 120_000);

  it('만든 이유와 판정소도 MenuFrame이고, 해시가 바뀌면 화면과 탭바의 지금 탭이 바뀐다', async () => {
    goto('#/about');
    render(<App data={fixtureAppData} />);
    expect(screen.getByRole('heading', { level: 2, name: '만든 이유' })).toBeInTheDocument();
    expectMenuFrame();
    expect(tabCurrents()).toEqual([null, null, 'page']);

    act(() => {
      window.location.hash = '#/evidence';
    });
    expect(await screen.findByRole('heading', { level: 2, name: '판정소' })).toBeInTheDocument();
    expectMenuFrame();
    expect(tabCurrents()).toEqual([null, 'page', null]);

    act(() => {
      window.location.hash = '#/';
    });
    expect(await screen.findByText(TAGLINE)).toBeInTheDocument();
    expect(tabCurrents()).toEqual(['page', null, null]);
  });

  it('타석 해시로 들어오면 GameFrame(머리말·탭바·출처 없음)에 그 타석을 연다', async () => {
    goto(`#/pa/${LIVE_GAME.summary.gameId}/3`);
    render(<App data={fixtureAppData} platformPromise={Promise.resolve(seasonPlatform())} />);
    expect(await screen.findByRole('group', { name: '스코어버그' }, { timeout: 90_000 })).toBeInTheDocument();
    expectGameFrame();
  }, 120_000);

  it('결과 해시(#/result)는 열린 타석으로 돌려보내고, 열린 타석이 없으면 첫 화면으로 보낸다', async () => {
    goto(`#/pa/${LIVE_GAME.summary.gameId}/3`);
    const first = render(<App data={fixtureAppData} platformPromise={Promise.resolve(seasonPlatform())} />);
    await screen.findByRole('group', { name: '스코어버그' }, { timeout: 90_000 });
    act(() => {
      window.location.hash = '#/result';
    });
    await waitFor(() => expect(window.location.hash).toBe(`#/pa/${LIVE_GAME.summary.gameId}/3`));
    first.unmount();

    goto('#/result');
    render(<App data={fixtureAppData} />);
    await waitFor(() => expect(window.location.hash).toBe('#/'));
    expect(screen.getByText(TAGLINE)).toBeInTheDocument();
    expectMenuFrame();
  }, 120_000);

  it('홈에서 구단 일정으로 간다', async () => {
    render(<App data={fixtureAppData} />);
    act(() => {
      within(screen.getByRole('main')).getByRole('link', { name: '구단 일정' }).click();
    });
    expect(await screen.findByRole('heading', { level: 2, name: '구단 일정' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/teams');
    expectMenuFrame();
  });

  it('"경기 끝까지"로 판이 끝나면 결과 화면(GameFrame)으로 가고, 끝난 판이 있으면 결과 해시를 그대로 둔다', { timeout: 180_000 }, async () => {
    goto(`#/pa/${LIVE_GAME.summary.gameId}/3`);
    render(<App data={fixtureAppData} platformPromise={Promise.resolve(seasonPlatform())} />);
    await screen.findByRole('group', { name: '스코어버그' }, { timeout: 90_000 });
    const dock = screen.getByRole('navigation', { name: '다시 치르기' });
    await waitFor(() => expect(within(dock).getByRole('button', { name: '경기 끝까지' })).toBeEnabled(), { timeout: 60_000 });
    act(() => {
      within(dock).getByRole('button', { name: '경기 끝까지' }).click();
    });
    await waitFor(() => expect(window.location.hash).toBe('#/result'), { timeout: 150_000 });
    expect(await screen.findByText('경기 종료 · 다시 치른 결과')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /^(LG 승리|두산 승리|무승부)$/ })).toBeInTheDocument();
    // 결과 화면은 GameFrame이고, 출처 한 줄은 결과 카드 아래에 스스로 싣는다
    expect(document.querySelector(`.${styles.topbar}`)).toBeNull();
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    expect(screen.getByRole('main')).toHaveClass(styles.gameMain);
    expect(within(screen.getByRole('main')).getByText(SOURCES)).toBeInTheDocument();
  });

  it('모르는 해시는 첫 화면(MenuFrame)으로 보낸다', () => {
    goto('#/nope/nope');
    render(<App data={fixtureAppData} />);
    expect(screen.getByText(TAGLINE)).toBeInTheDocument();
    expectMenuFrame();
  });

  it('플랫폼을 알아내는 동안에도 첫 화면을 그리고, 준비되면 그 플랫폼을 쓴다', async () => {
    const data: AppData = fixtureAppData;
    let resolvePlatform: (platform: Platform) => void = () => undefined;
    const platformPromise = new Promise<Platform>((resolve) => {
      resolvePlatform = resolve;
    });
    render(<App data={data} platformPromise={platformPromise} />);
    expect(screen.getByText(TAGLINE)).toBeInTheDocument();
    // 플랫폼 전에는 경기 API가 없다고 알린다
    expect(screen.getByText(/경기를 불러올 수 없/)).toBeInTheDocument();

    await act(async () => {
      resolvePlatform(fakePlatform({ today: () => '2026-01-02', liveApi: fakeLiveApi({ games: SEASON_GAMES, game: LIVE_GAME }) }));
      await platformPromise;
    });
    expect(within(screen.getByRole('banner')).getByText('1월 2일 (금)')).toBeInTheDocument();
  });

  it('게임 열 CSS: 가운데 최대 480px·폭 100%·최소 높이 100dvh·가로 넘침 자름, 1024px 이상 그림자와 1px --hair-2', () => {
    const css = appCss.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
    const column = /\.column \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(column).toContain('width: 100%');
    expect(column).toContain('max-width: 480px');
    expect(column).toContain('min-height: 100dvh');
    expect(column).toContain('margin: 0 auto');
    expect(column).toContain('overflow-x: clip');
    const desktop = css.slice(Math.max(0, css.indexOf('@media (min-width: 1024px)')));
    expect(desktop).toMatch(/^@media \(min-width: 1024px\) \{ \.column \{[^}]*box-shadow: var\(--shadow-lift\);/);
    expect(desktop).toMatch(/^@media \(min-width: 1024px\) \{ \.column \{[^}]*1px solid var\(--hair-2\)/);
    expect(css).toMatch(/\.menuMain \{[^}]*padding: 0 18px;/);
    expect(css).toMatch(/\.gameMain \{[^}]*padding: 0;/);
  });
});
