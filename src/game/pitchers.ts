import type { PitchRow } from '../types/data';
import type { PitcherPlanEntry } from '../types/domain';
import type { LiveGame } from '../types/live';

/*
 * 경기 중계에서 실제 투수 차례와 그 경기의 투구 표본을 뽑는다(ADR-033·035).
 * 되돌려보다가 갈라진 경기에서 누가 던지는지는 `engine`의 `pitcherAt`이 이 차례로 찾는다.
 *
 * 순수 모듈이다.
 */

/** 투수가 바뀐 지점만 시간순으로. 같은 반이닝 안의 교체도 아웃 수와 함께 남는다 */
export function pitcherPlanOf(game: LiveGame): PitcherPlanEntry[] {
  const plan: PitcherPlanEntry[] = [];
  /** 반이닝마다 마지막으로 적은 투수 (초·말이 번갈아 나오므로 편마다 따로 센다) */
  const last: Record<0 | 1, string | null> = { 0: null, 1: null };
  for (const pa of game.plateAppearances) {
    const { inning, half, outs } = pa.before;
    if (last[half] === pa.pitcher) continue;
    last[half] = pa.pitcher;
    plan.push({ inning, half, outs, pitcher: pa.pitcher });
  }
  return plan;
}

/** 투수 id → 그 경기에서 던진 투구 행. 투구가 없는 투수는 담지 않는다 */
export function gameRowsOf(game: LiveGame): Record<string, PitchRow[]> {
  const rows: Record<string, PitchRow[]> = {};
  for (const pa of game.plateAppearances) {
    if (pa.pitches.length === 0) continue;
    const list = Object.hasOwn(rows, pa.pitcher) ? rows[pa.pitcher] : (rows[pa.pitcher] = []);
    list.push(...pa.pitches);
  }
  return rows;
}
