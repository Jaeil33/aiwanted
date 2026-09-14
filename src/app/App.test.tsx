import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixtureAppData } from '../test/fixtures/appData';
import { fakePlatform } from '../test/gameHarness';
import type { AppData, SceneRecord } from '../types/data';
import { App } from './App';
import styles from './App.module.css';
import appCss from './App.module.css?raw';
import type { Platform } from './platform';

const SOURCES = '기록·중계: 네이버 스포츠(KBO) · 날씨: Open-Meteo · 확률: TMI 야구 엔진 계산값';
const SUBTITLE = '쓸모없는 변수, 진짜 쓸모없을까?';
const SCENE = fixtureAppData.scenes[0];

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

/** GameFrame: 머리말·탭바·출처 없이 본문만(제목 h1은 스크린리더용). 화면 안의 제목 묶음(header)은 화면 몫이라 본문 밖만 본다 */
function expectGameFrame() {
  const main = screen.getByRole('main');
  expect(screen.queryAllByRole('banner').filter((banner) => !main.contains(banner))).toEqual([]);
  expect(document.querySelector(`.${styles.topbar}`)).toBeNull();
  expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
  expect(screen.queryByText(SOURCES)).toBeNull();
  expect(main).toHaveClass(styles.gameMain);
  expect(main.closest(`.${styles.column}`)).not.toBeNull();
  expect(screen.getByRole('heading', { level: 1, name: 'TMI 야구' })).toHaveClass(styles.srOnly);
}

describe('App', () => {
  it('데이터가 없으면 MenuFrame 안에 안내를 보여주고 브랜드·출처·탭바는 그대로 둔다', () => {
    render(<App data={null} />);
    expectMenuFrame();
    expect(screen.getByRole('main')).toHaveTextContent('앱 데이터가 없어요. npm run data로 만든 뒤 다시 빌드하세요.');
    expect(tabCurrents()).toEqual(['page', null, null]);
  });

  it('로비(#/)는 MenuFrame: 상단 바에 브랜드와 장면 수, 본문에 첫 화면, 탭바는 명장면이 지금 탭', () => {
    render(<App data={fixtureAppData} />);
    expectMenuFrame();
    expect(within(screen.getByRole('banner')).getByText(`명장면 ${fixtureAppData.scenes.length}`)).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByText(SUBTITLE)).toBeInTheDocument();
    expect(within(tabBar()).getByRole('link', { name: '명장면' })).toHaveAttribute('href', '#/');
    expect(tabCurrents()).toEqual(['page', null, null]);
  });

  it('판정소·만든 이유도 MenuFrame이고, 해시가 바뀌면 화면과 탭바의 지금 탭이 바뀐다', async () => {
    goto('#/about');
    render(<App data={fixtureAppData} />);
    expect(screen.getByRole('heading', { level: 2, name: '만든 이유' })).toBeInTheDocument();
    expectMenuFrame();
    expect(tabCurrents()).toEqual([null, null, 'page']);
    expect(screen.queryByText(`명장면 ${fixtureAppData.scenes.length}`)).toBeNull();

    act(() => {
      window.location.hash = '#/evidence';
    });
    expect(await screen.findByRole('heading', { level: 2, name: '판정소' })).toBeInTheDocument();
    expectMenuFrame();
    expect(tabCurrents()).toEqual([null, 'page', null]);

    act(() => {
      window.location.hash = '#/';
    });
    expect(await screen.findByText(SUBTITLE)).toBeInTheDocument();
    expect(tabCurrents()).toEqual(['page', null, null]);
  });

  it('play 해시로 들어오면 GameFrame(머리말·탭바·출처 없음)에 그 장면을 연다', async () => {
    goto('#/scene/fixture-walkoff');
    render(<App data={fixtureAppData} />);
    const title = await screen.findByRole('heading', { level: 2, name: SCENE.title });
    expectGameFrame();
    expect(screen.getByRole('main')).toContainElement(title);
  });

  it('열린 장면의 결과(#/result)도 GameFrame으로 그린다', async () => {
    goto('#/scene/fixture-walkoff');
    render(<App data={fixtureAppData} />);
    expect(await screen.findByRole('heading', { level: 2, name: SCENE.title })).toBeInTheDocument();
    act(() => {
      window.location.hash = '#/result';
    });
    expect(await screen.findByRole('heading', { level: 2, name: '결과' })).toBeInTheDocument();
    expectGameFrame();
  });

  it('첫 화면에서 장면 카드를 누르면 그 장면 화면으로 간다', async () => {
    render(<App data={fixtureAppData} />);
    const all = screen.getByRole('region', { name: '모든 장면' });
    act(() => {
      within(all).getAllByRole('link')[0].click();
    });
    expect(await screen.findByRole('heading', { level: 2, name: SCENE.title })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/scene/fixture-walkoff');
    expectGameFrame();
  });

  it('모르는 장면이나 열린 장면이 없는 결과 해시는 첫 화면(MenuFrame)으로 보낸다', async () => {
    goto('#/scene/nope');
    const first = render(<App data={fixtureAppData} />);
    await waitFor(() => expect(window.location.hash).toBe('#/'));
    expect(screen.getByText(SUBTITLE)).toBeInTheDocument();
    expectMenuFrame();
    first.unmount();

    goto('#/result');
    render(<App data={fixtureAppData} />);
    await waitFor(() => expect(window.location.hash).toBe('#/'));
    expect(screen.getByText(SUBTITLE)).toBeInTheDocument();
    expectMenuFrame();
    expect(tabCurrents()).toEqual(['page', null, null]);
  });

  it('플랫폼을 알아내는 동안에도 첫 화면을 그리고, 준비되면 그 플랫폼을 쓴다', async () => {
    const second: SceneRecord = { ...SCENE, id: 'fixture-second', title: '두 번째 픽스처 장면', date: '2026-08-20' };
    const data: AppData = { ...fixtureAppData, scenes: [SCENE, second] };
    let resolvePlatform: (platform: Platform) => void = () => undefined;
    const platformPromise = new Promise<Platform>((resolve) => {
      resolvePlatform = resolve;
    });
    render(<App data={data} platformPromise={platformPromise} />);
    expect(screen.getByText(SUBTITLE)).toBeInTheDocument();

    // todaySceneIndex('2026-01-02', 2) = 1
    await act(async () => {
      resolvePlatform(fakePlatform({ today: () => '2026-01-02' }));
      await platformPromise;
    });
    const today = screen.getByRole('region', { name: '오늘의 장면' });
    expect(within(today).getByText('두 번째 픽스처 장면')).toBeInTheDocument();
  });

  it('게임 열 CSS: 가운데 최대 480px·폭 100%·최소 높이 100dvh·가로 넘침 자름, 1024px 이상 그림자와 1px --hair-2, 옛 머리말·내비·푸터 규칙 없음', () => {
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
    expect(css).not.toMatch(/\.(header|nav|navLink|footer) \{/);
  });
});
