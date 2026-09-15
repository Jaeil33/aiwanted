import { act, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { fixtureAppData } from '../test/fixtures/appData';
import { renderWithGame } from '../test/gameHarness';
import { usePaOdds, type PaOdds } from './usePaOdds';

const SLOW = { timeout: 90_000 };
const SCENE = fixtureAppData.scenes[0];

function Probe({ outRef }: { outRef: { current: PaOdds | null } }) {
  const odds = usePaOdds();
  useEffect(() => {
    outRef.current = odds;
  });
  return null;
}

const distance = (a: ArrayLike<number>, b: ArrayLike<number>) => Array.from(a).reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0);

describe('usePaOdds', () => {
  it('장면이 없으면 계산하지 않는다', () => {
    const out: { current: PaOdds | null } = { current: null };
    renderWithGame(<Probe outRef={out} />);
    expect(out.current).toEqual({ base: null, tmi: null, toon: null, pending: false });
  });

  it('장면을 열면 장면 시작 상태의 TMI 없음 평가를 구하고, TMI가 없으면 tmi·toon도 같은 값', SLOW, async () => {
    const out: { current: PaOdds | null } = { current: null };
    const view = renderWithGame(<Probe outRef={out} />);
    await act(async () => {
      await view.game().actions.openScene(SCENE.id, null);
    });
    await waitFor(() => expect(out.current?.base).not.toBeNull(), { timeout: 60_000 });
    const odds = out.current as PaOdds;
    expect(odds.pending).toBe(false);
    expect(odds.base?.pa).toHaveLength(7);
    expect(odds.tmi).toBe(odds.base);
    expect(odds.toon).toBe(odds.base);
  });

  it('TMI를 걸면 tmi는 base와 다르고 만화 모드(toon)는 더 멀리 간다', SLOW, async () => {
    const out: { current: PaOdds | null } = { current: null };
    const view = renderWithGame(<Probe outRef={out} />);
    await act(async () => {
      await view.game().actions.openScene(SCENE.id, null);
    });
    await act(async () => {
      await view.game().actions.submitTmi('투수가 어젯밤 3시간밖에 못 잤다');
    });
    expect(view.game().session.tmis).toHaveLength(1);
    await waitFor(
      () => {
        const odds = out.current;
        expect(odds?.base && odds.tmi && odds.toon && odds.tmi !== odds.base && !odds.pending).toBe(true);
      },
      { timeout: 60_000 },
    );
    const odds = out.current as PaOdds;
    if (!odds.base || !odds.tmi || !odds.toon) throw new Error('평가가 비었어요');
    const near = distance(odds.tmi.pa, odds.base.pa);
    expect(near).toBeGreaterThan(0);
    expect(distance(odds.toon.pa, odds.base.pa)).toBeGreaterThan(near);
  });
});
