import { describe, expect, it } from 'vitest';
import { pitcherAt } from '../engine';
import { fixtureLiveGame } from '../test/fixtures/live';
import type { LiveGame } from '../types/live';
import { gameRowsOf, pitcherPlanOf } from './pitchers';

/*
 * 경기에서 실제로 던진 투수 차례와 그 경기의 투구 표본(ADR-033·035).
 */

const GAME = fixtureLiveGame();

describe('pitcherPlanOf', () => {
  it('투수가 바뀐 지점만 시간순으로 남긴다', () => {
    // 픽스처는 1회초 hp1, 1회말 ap1뿐이다
    expect(pitcherPlanOf(GAME)).toEqual([
      { inning: 1, half: 0, outs: 0, pitcher: 'hp1' },
      { inning: 1, half: 1, outs: 0, pitcher: 'ap1' },
    ]);
  });

  it('같은 반이닝 안의 교체도 아웃 수와 함께 남긴다', () => {
    const relieved: LiveGame = {
      ...GAME,
      plateAppearances: GAME.plateAppearances.map((pa) =>
        pa.no >= 4 && pa.before.half === 0 ? { ...pa, pitcher: 'hp2' } : pa,
      ),
    };
    expect(pitcherPlanOf(relieved)).toEqual([
      { inning: 1, half: 0, outs: 0, pitcher: 'hp1' },
      { inning: 1, half: 0, outs: 1, pitcher: 'hp2' },
      { inning: 1, half: 1, outs: 0, pitcher: 'ap1' },
    ]);
  });

  it('같은 투수가 이어 던지면 한 줄만 남는다', () => {
    const plan = pitcherPlanOf(GAME);
    expect(plan.filter((e) => e.pitcher === 'hp1')).toHaveLength(1);
  });

  it('차례를 다시 찾으면 그 타석의 실제 투수가 나온다', () => {
    const plan = pitcherPlanOf(GAME);
    for (const pa of GAME.plateAppearances) {
      expect(pitcherAt(plan, pa.before)).toBe(pa.pitcher);
    }
  });

  it('타석이 없으면 빈 차례다', () => {
    expect(pitcherPlanOf({ ...GAME, plateAppearances: [] })).toEqual([]);
  });
});

describe('gameRowsOf', () => {
  it('투수마다 그 경기에서 던진 공을 모은다', () => {
    const rows = gameRowsOf(GAME);
    const hp1 = GAME.plateAppearances.filter((pa) => pa.pitcher === 'hp1').flatMap((pa) => pa.pitches);
    expect(rows.hp1).toEqual(hp1);
    expect(rows.ap1.length).toBeGreaterThan(0);
  });

  it('투구가 없는 투수는 담지 않는다', () => {
    const noPitches: LiveGame = { ...GAME, plateAppearances: GAME.plateAppearances.map((pa) => ({ ...pa, pitches: [] })) };
    expect(gameRowsOf(noPitches)).toEqual({});
  });
});
