import { lerp } from './pose';

/** 경기장 바닥 좌표 [x, y](ft) */
export type FieldPoint = readonly [x: number, y: number];

/** 수비 위치: 3루수, 1루수, 2루수, 유격수, 좌익수, 중견수, 우익수 */
export const FIELDERS: readonly FieldPoint[] = [[-80, 92], [78, 88], [32, 132], [-32, 128], [-155, 262], [0, 318], [155, 262]];
/** 홈 → 1루 → 2루 → 3루 → 홈 */
export const BASES: readonly FieldPoint[] = [[0, 0], [63.6, 63.6], [0, 127.3], [-63.6, 63.6], [0, 0]];

/** 루 번호 q(0 홈, 1 1루, 2 2루, 3 3루, 4 홈) 사이 주로 위의 점. 소수는 두 루 사이 */
export function basePoint(q: number): [number, number] {
  const i = Math.max(0, Math.min(3, Math.floor(q)));
  const u = q - i;
  return [lerp(BASES[i][0], BASES[i + 1][0], u), lerp(BASES[i][1], BASES[i + 1][1], u)];
}

/** 타구 낙하 지점에서 가장 가까운 수비수 번호(FIELDERS 인덱스) */
export function nearestFielder(landing: { x: number; y: number }): number {
  let best = -1;
  let bestD = Infinity;
  FIELDERS.forEach(([x, y], i) => {
    const d = Math.hypot(landing.x - x, landing.y - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
