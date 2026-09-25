import type { GameState, PitcherPlanEntry } from '../types/domain';

/*
 * 실제로 누가 던지고 있었는지(ADR-033). 되돌려보면 경기가 갈라지므로 실제 타석과 하나씩 맞출 수 없다.
 * 대신 이닝·초말로 찾고, 그 반이닝 안에서는 아웃 수로 가른다: 2사에 올라온 구원은 되돌려본 경기에서도 2사에 올라온다.
 * 실제 경기보다 뒤 이닝이면 그 편의 마지막 투수가 계속 던진다.
 *
 * 순수 모듈이다.
 */

/** 그 상태에서 던지던 투수 id. 그 편 기록이 없거나 첫 기록보다 앞선 이닝이면 null */
export function pitcherAt(
  plan: readonly PitcherPlanEntry[],
  state: Pick<GameState, 'inning' | 'half' | 'outs'>,
): string | null {
  let best: PitcherPlanEntry | null = null;
  let firstOfInning: PitcherPlanEntry | null = null;
  let latestBefore: PitcherPlanEntry | null = null;

  for (const entry of plan) {
    if (entry.half !== state.half) continue;
    if (entry.inning === state.inning) {
      if (firstOfInning === null || entry.outs < firstOfInning.outs) firstOfInning = entry;
      if (entry.outs <= state.outs && (best === null || entry.outs >= best.outs)) best = entry;
      continue;
    }
    if (entry.inning < state.inning) {
      if (latestBefore === null || entry.inning > latestBefore.inning || (entry.inning === latestBefore.inning && entry.outs > latestBefore.outs)) {
        latestBefore = entry;
      }
    }
  }

  if (best !== null) return best.pitcher;
  // 그 반이닝 기록이 우리보다 늦은 아웃에서 시작하면(2사에 올라온 구원) 그 앞 투수가 아직 던지고 있다
  if (latestBefore !== null) return latestBefore.pitcher;
  return firstOfInning === null ? null : firstOfInning.pitcher;
}
