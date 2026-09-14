import { EV } from '../domain/events';
import type { EventVector } from '../types/domain';

/** 타석 사건 분포(오즈비 매칭): bRel × pRel × lg × 효과 배수를 합이 1이 되게 정규화한다 */
export function matchup(bRel: EventVector, pRel: EventVector, lg: EventVector, mult?: ArrayLike<number>): Float64Array {
  const w = new Float64Array(7);
  let total = 0;
  for (let i = 0; i < 7; i++) {
    w[i] = bRel[i] * pRel[i] * lg[i] * (mult?.[i] ?? 1);
    total += w[i];
  }
  for (let i = 0; i < 7; i++) w[i] /= total;
  return w;
}

/** 타자 출루 확률: 삼진과 인플레이 아웃을 뺀 나머지 */
export function batterWin(dist: ArrayLike<number>): number {
  return 1 - dist[EV.K] - dist[EV.OUT];
}
