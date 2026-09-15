import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildSceneSetup, compileSessionEffects, createLocalEngineClient, pitcherFor } from '../game';
import { battingWin } from '../game/selectors';
import { fixtureAppData } from '../test/fixtures/appData';
import { renderWithGame } from '../test/gameHarness';
import { gameSpecFor } from './useSceneEvaluations';
import { useTmiContributions } from './useTmiContributions';

const SLOW = { timeout: 120_000 };
const SCENE = fixtureAppData.scenes[0]; // 홈 롯데 공격

describe('useTmiContributions', () => {
  it('TMI 하나만 걸었을 때 장면 시작 상태의 공격 팀 승리확률 변화(%p)를 엔진 평가끼리 빼서 준다', SLOW, async () => {
    const box: { values: Record<string, number | null> } = { values: {} };
    function Probe() {
      box.values = useTmiContributions();
      return null;
    }
    const view = renderWithGame(<Probe />);
    await act(async () => {
      await view.game().actions.openScene(SCENE.id, null);
    });
    expect(box.values).toEqual({});
    await act(async () => {
      await view.game().actions.submitTmi('투수가 어젯밤 3시간밖에 못 잤다');
    });
    const entry = view.game().session.tmis[0];
    expect(entry).toBeDefined();
    await waitFor(() => expect(typeof box.values[entry.id]).toBe('number'), { timeout: 90_000 });

    const setup = buildSceneSetup(fixtureAppData, SCENE.id);
    const engine = createLocalEngineClient();
    const pitcher = pitcherFor(setup, SCENE.state);
    const base = await engine.evaluate({ spec: gameSpecFor(setup, [], 'real'), state: SCENE.state, pitcher, first: true });
    const effects = compileSessionEffects([entry], setup, fixtureAppData.evidence);
    const tmi = await engine.evaluate({ spec: gameSpecFor(setup, effects, 'real'), state: SCENE.state, pitcher, first: true });
    expect(box.values[entry.id]).toBeCloseTo((battingWin(tmi, 'home') - battingWin(base, 'home')) * 100, 10);
    // 원정 투수가 지치면 홈 공격 팀에 유리하다
    expect(box.values[entry.id]).toBeGreaterThan(0);
  });
});
