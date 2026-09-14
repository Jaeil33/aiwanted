import type { Bases, EventIndex, Transition } from '../types/domain';
import { transitions } from './transitions';

/** 한 반이닝 득점 상한: 이보다 많은 득점은 RMAX 칸에 모은다 */
export const RMAX = 15;

/** 질량 전파 최대 타석 수 (engine.js 그대로) */
const MAX_STEPS = 200;
/** 아직 반이닝이 끝나지 않은 질량이 이보다 작으면 멈춘다 */
const ACTIVE_EPS = 1e-15;

/** 인덱스 (outs × 8 + bases) × 7 + 사건 → 주루 분기. 안쪽 반복에서 범위 검사를 되풀이하지 않도록 한 번 모아 둔다 */
const LISTS: readonly (readonly Transition[])[] = Array.from({ length: 3 * 8 * 7 }, (_, i) =>
  transitions(Math.floor(i / 7) % 8, Math.floor(i / 56), (i % 7) as EventIndex),
);

const isIndex = (x: number, size: number) => Number.isInteger(x) && x >= 0 && x < size;

/**
 * 반이닝 마르코프 질량 전파 (engine.js 그대로). 상태는 (아웃, 주자, 타순, 지금부터 낸 득점).
 * dists[slot]은 그 타순 타자의 타석 분포이고 firstDist가 있으면 첫 타석에만 그것을 쓴다.
 * 반환 배열의 r*9 + s = 지금부터 r점(RMAX 이상은 RMAX)을 더 내고 다음 반이닝 선두 타순이 s일 확률.
 */
export function halfInning(
  dists: readonly ArrayLike<number>[],
  start: { slot: number; outs: number; bases: Bases },
  firstDist?: ArrayLike<number>,
): Float64Array {
  const { slot, outs, bases } = start;
  if (dists.length !== 9 || !isIndex(slot, 9) || !isIndex(outs, 3) || !isIndex(bases, 8)) {
    throw new RangeError(
      `halfInning: 타석 분포 9개, 타순 0~8, 아웃 0~2, 주자 0~7이어야 한다 (분포 ${dists.length}개, slot ${slot}, outs ${outs}, bases ${bases})`,
    );
  }
  const R = RMAX + 1;
  let cur = new Float64Array(3 * 8 * 9 * R);
  const term = new Float64Array(R * 9);
  cur[((outs * 8 + bases) * 9 + slot) * R] = 1;
  let first = firstDist !== undefined;
  for (let step = 0; step < MAX_STEPS; step++) {
    const next = new Float64Array(cur.length);
    let active = 0;
    for (let o = 0; o < 3; o++) {
      for (let b = 0; b < 8; b++) {
        for (let sl = 0; sl < 9; sl++) {
          const at = ((o * 8 + b) * 9 + sl) * R;
          const dist = first && firstDist ? firstDist : dists[sl];
          const ns = (sl + 1) % 9;
          for (let r = 0; r < R; r++) {
            const m = cur[at + r];
            if (m === 0) continue;
            for (let e = 0; e < 7; e++) {
              const pe = m * dist[e];
              if (pe === 0) continue;
              const list = LISTS[(o * 8 + b) * 7 + e];
              for (let k = 0; k < list.length; k++) {
                const x = list[k];
                const pm = pe * x.p;
                const rr = Math.min(r + x.runs, RMAX);
                if (x.outs >= 3) {
                  term[rr * 9 + ns] += pm;
                } else {
                  next[((x.outs * 8 + x.bases) * 9 + ns) * R + rr] += pm;
                  active += pm;
                }
              }
            }
          }
        }
      }
    }
    cur = next;
    first = false;
    if (active < ACTIVE_EPS) break;
  }
  return term;
}

/** 반이닝 분포 요약: pScore = 1 − P(0점), expRuns = Σ r × p, total = 질량 합 */
export function halfSummary(hd: ArrayLike<number>): { pScore: number; expRuns: number; total: number } {
  let p0 = 0;
  let expRuns = 0;
  let total = 0;
  for (let r = 0; r <= RMAX; r++) {
    for (let s = 0; s < 9; s++) {
      const p = hd[r * 9 + s];
      if (r === 0) p0 += p;
      expRuns += r * p;
      total += p;
    }
  }
  return { pScore: 1 - p0, expRuns, total };
}
