import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayLogEntry } from '../../game/session';
import { fixtureAppData } from '../../test/fixtures/appData';
import { fakePlatform, renderWithGame } from '../../test/gameHarness';
import type { TmiEntry } from '../../types/domain';
import type { Platform } from '../platform';
import { ResultScreen } from './ResultScreen';
import { situationFromScene } from '../../game';

const SLOW = { timeout: 120_000 };
const WAIT = { timeout: 90_000 };
const SCENE = fixtureAppData.scenes[0]; // 9회말 2사 만루 4:4, 원정 KIA · 홈 롯데, 홈타자6 vs 원정투수

const JJAJANG: TmiEntry = {
  id: 'tmi-1',
  text: '원정투수가 짜장면 곱빼기',
  interpretation: {
    source: 'rules',
    refused: false,
    reason: '',
    comment: '',
    parts: [{ kind: 'knob', knob: 'stamina', subject: 'pitcher', strength: -2, scope: 'game', evidence: 'fun', why: '배가 부르면 몸이 무거워진다는 가정' }],
  },
};

const WALKOFF: PlayLogEntry = {
  index: 0,
  inning: 9,
  half: 1,
  batterName: '홈타자6',
  pitcherName: '원정투수',
  headline: '끝내기 만루 홈런!',
  score: { away: 4, home: 8 },
  wpHomeAfter: 1,
  highlight: false,
};

async function finishedResult(opts: { tmis?: TmiEntry[]; platform?: Platform } = {}) {
  const view = renderWithGame(<ResultScreen />, { platform: opts.platform ?? fakePlatform() });
  const after = { ...SCENE.state, bases: 0, home: 8 };
  await act(async () => {
    const { dispatch } = view.game();
    dispatch({ type: 'openSituation', situation: situationFromScene(SCENE), extra: { title: SCENE.title, actualFinal: { away: SCENE.away.final, home: SCENE.home.final } }, seed: 7, tmis: opts.tmis });
    dispatch({ type: 'paFinished', entry: WALKOFF, state: after });
    dispatch({ type: 'gameFinished', winner: 'home', walkoff: true, state: after });
  });
  return view;
}

async function stoppedResult() {
  const view = renderWithGame(<ResultScreen />, { platform: fakePlatform() });
  const after = { ...SCENE.state, bases: 0, outs: 3, home: 4 };
  await act(async () => {
    const { dispatch } = view.game();
    dispatch({
      type: 'openSituation',
      situation: situationFromScene(SCENE),
      extra: { title: SCENE.title, actualFinal: { away: SCENE.away.final, home: SCENE.home.final } },
      seed: 7,
    });
    dispatch({ type: 'paFinished', entry: { ...WALKOFF, headline: '삼진', score: { away: 4, home: 4 } }, state: after });
    dispatch({ type: 'stopHere' });
  });
  return view;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/#/result');
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('ResultScreen — 여기까지 보기(ADR-033)', () => {
  it('이긴 팀을 적지 않고 멈춘 지점을 적는다', SLOW, async () => {
    const view = await stoppedResult();
    expect(view.game().session.final).toMatchObject({ stopped: true });
    expect(await screen.findByRole('heading', { level: 2, name: '9회말까지' }, WAIT)).toBeInTheDocument();
    expect(screen.getByText('여기까지 · 다시 치른 결과')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: /승리$/ })).toBeNull();
  });
});

describe('ResultScreen', () => {
  it('끝난 경기가 없으면 결과가 없다는 제목만', () => {
    renderWithGame(<ResultScreen />);
    expect(screen.getByRole('heading', { level: 2, name: '결과가 아직 없어요' })).toBeInTheDocument();
  });

  it('최종 점수·승리 팀·결정 장면 한 줄, 평행우주 1,000경기(합 1,000)와 범례, TMI 없는 나비효과', SLOW, async () => {
    await finishedResult();
    expect(screen.getByText('경기 종료 · 다시 치른 결과')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '롯데 승리' })).toBeInTheDocument();
    const score = screen.getByRole('group', { name: '최종 점수 KIA 4, 롯데 8' });
    expect(within(score).getByText('8').closest('[data-win]')).toHaveAttribute('data-win', 'true');
    expect(within(score).getByText('4').closest('[data-win]')).toHaveAttribute('data-win', 'false');
    expect(screen.getByText('9회말 2사 만루에서 끝내기 만루 홈런')).toBeInTheDocument();

    const card = screen.getByRole('region', { name: '평행우주 1,000경기' });
    expect(within(card).getByText('엔진 확률의 기대값')).toBeInTheDocument();
    const dots = await within(card).findByRole('img', { name: /^평행우주 1,000경기: 롯데 승 \d+번, 무승부 \d+번, KIA 승 \d+번$/ }, WAIT);
    const counts = (dots.getAttribute('aria-label') ?? '').match(/\d+(?=번)/g)?.map(Number) ?? [];
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1000);
    // 범례: 롯데 승·무승부·KIA 승 큰 숫자, TMI가 없으면 비교 줄 없음
    const legend = within(card).getByRole('list', { name: '범례' });
    expect(within(legend).getAllByRole('listitem').map((li) => li.querySelector('b')?.textContent)).toEqual(counts.map(String));
    expect(within(card).queryByText(/TMI 없이/)).toBeNull();

    const butterfly = screen.getByRole('region', { name: '나비효과' });
    expect(within(butterfly).getByText('TMI 없이 다시 치렀어요')).toBeInTheDocument();
    expect(await within(butterfly).findByLabelText('롯데 승리확률 변화 ±0.00%p', undefined, WAIT)).toHaveAttribute('data-trend', 'flat');
    expect(screen.getByText('기록·중계: 네이버 스포츠(KBO) · 날씨: Open-Meteo · 확률: TMI 야구 엔진 계산값')).toBeInTheDocument();
  });

  it('TMI가 있으면 범례에 TMI 없음 비교, 근거 등급·모드 칩, 나비효과 줄과 %p', SLOW, async () => {
    await finishedResult({ tmis: [JJAJANG] });
    const card = screen.getByRole('region', { name: '평행우주 1,000경기' });
    await within(card).findByRole('img', { name: /^평행우주 1,000경기: 롯데 승/ }, WAIT);
    expect(await within(card).findAllByText(/^TMI 없이 \d+/, undefined, WAIT)).toHaveLength(3);
    expect(within(card).getByText('상상')).toHaveAttribute('data-grade', 'fun');

    const butterfly = screen.getByRole('region', { name: '나비효과' });
    expect(within(butterfly).getByText('짜장면 곱빼기')).toBeInTheDocument();
    expect(within(butterfly).getByText('투수 체력 ↓')).toBeInTheDocument();
    expect(within(butterfly).getByText('현실')).toBeInTheDocument();
    expect(within(butterfly).getByText('상상')).toHaveAttribute('data-grade', 'fun');
    const num = within(butterfly).getByLabelText(/^롯데 승리확률 변화 [+−±]\d+\.\d+%p$/);
    expect(num).toHaveAttribute('data-trend');
  });

  it('실제 결과는 눌러야 열린다', SLOW, async () => {
    const user = userEvent.setup();
    await finishedResult();
    expect(screen.queryByText(/^실제:/)).toBeNull();
    await user.click(screen.getByRole('button', { name: '실제 결과 열기' }));
    expect(screen.getByText('실제: 홈타자6 우익수 뒤 만루 홈런, 4점')).toBeInTheDocument();
    expect(screen.getByText('최종 KIA 4 : 8 롯데 · 네이버 롯데 승리확률 62.0% → 100.0%')).toBeInTheDocument();
  });

  it('"같은 TMI로 다시"는 재생을 되돌리고 타석 화면으로 간다', SLOW, async () => {
    const user = userEvent.setup();
    const view = await finishedResult({ tmis: [JJAJANG] });
    await user.click(screen.getByRole('button', { name: '같은 TMI로 다시' }));
    const s = view.game().session;
    expect(s.status).toBe('ready');
    expect(s.log).toHaveLength(0);
    expect(s.tmis).toHaveLength(1);
    expect(window.location.hash).toBe('#/scene/fixture-walkoff');
  });

  it('"결과 카드 공유"는 TMI가 담긴 장면 링크를 공유하고 결과를 알려 준다', SLOW, async () => {
    const user = userEvent.setup();
    const shareLink = vi.fn(async () => 'copied' as const);
    await finishedResult({ tmis: [JJAJANG], platform: fakePlatform({ shareLink }) });
    await user.click(screen.getByRole('button', { name: '결과 카드 공유' }));
    expect(shareLink).toHaveBeenCalledTimes(1);
    const [url, title] = shareLink.mock.calls[0] as unknown as [string, string];
    expect(url).toMatch(/#\/scene\/fixture-walkoff\?t=/);
    expect(title).toBe(`TMI 야구 — ${SCENE.title}`);
    expect(await screen.findByText('링크를 복사했어요.')).toBeInTheDocument();
  });
});
