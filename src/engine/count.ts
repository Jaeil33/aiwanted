import { EV } from '../domain/events';
import type { EventIndex, PitchCode, PitchSample } from '../types/domain';
import { sampleInPlay } from './transitions';

/** 볼카운트 흡수 마르코프 체인 */
export interface CountModel {
  /** rates[b*3+s] = [B, T, S, F, X] 한 구 결과 확률 */
  rates: number[][];
  /** term[b*3+s] = [K, BB, 인플레이] 그 카운트에서 타석이 끝날 흡수 확률 */
  term: number[][];
}

/** 카운트 표: 12행(balls*3+strikes) × 5열(B, T, S, F, X) */
type CountTable = readonly (readonly number[])[];

/** simulatePA 한 타석의 투구 상한. 넘으면 인플레이로 끝낸다 (engine.js 그대로) */
const MAX_PITCHES = 400;

function assertCount(where: string, balls: number, strikes: number): void {
  const ok = Number.isInteger(balls) && balls >= 0 && balls <= 3 && Number.isInteger(strikes) && strikes >= 0 && strikes <= 2;
  if (!ok) throw new RangeError(`${where}: 볼 0~3, 스트라이크 0~2여야 한다 (${balls}-${strikes})`);
}

/**
 * 카운트 표의 볼(B)·스트라이크(T·S)·인플레이(X) 비율에 배율을 곱해(파울은 그대로) 행마다 정규화하고,
 * 3-2부터 거꾸로 흡수 확률을 채운다. 2스트라이크 파울은 카운트 유지, 3볼에서 볼이면 볼넷, 2스트라이크에서 T·S면 삼진.
 */
export function countChain(table: CountTable, aBall: number, aStrike: number, aPlay: number): CountModel {
  const rates = new Array<number[]>(12);
  const term = new Array<number[]>(12);
  for (let b = 3; b >= 0; b--) {
    for (let s = 2; s >= 0; s--) {
      const c = b * 3 + s;
      const row = table[c];
      const raw = [row[0] * aBall, row[1] * aStrike, row[2] * aStrike, row[3], row[4] * aPlay];
      const total = raw[0] + raw[1] + raw[2] + raw[3] + raw[4];
      const [pB, pT, pS, pF, pX] = raw.map((x) => x / total);
      rates[c] = [pB, pT, pS, pF, pX];
      const onBall = b === 3 ? [0, 1, 0] : term[(b + 1) * 3 + s];
      if (s === 2) {
        const stay = 1 - pF;
        term[c] = [(pB * onBall[0] + pT + pS) / stay, (pB * onBall[1]) / stay, (pB * onBall[2] + pX) / stay];
      } else {
        const next = term[c + 1];
        const move = pT + pS + pF;
        term[c] = [pB * onBall[0] + move * next[0], pB * onBall[1] + move * next[1], pB * onBall[2] + move * next[2] + pX];
      }
    }
  }
  return { rates, term };
}

/**
 * 매치업 타석 분포(pa)의 삼진·볼넷 비율이 0-0에서 나오도록 볼·스트라이크 배율을 맞춘다(인플레이 배율 1 고정).
 * 로그 공간 두 미지수의 감쇠 뉴턴(engine.js 그대로): 유한차분 h=1e-6, 개선될 때까지 스텝 절반(최대 40번),
 * u는 [−15, 15], 잔차 노름 1e-12 또는 100회에서 멈춘다.
 */
export function calibrateCount(pa: ArrayLike<number>, table: CountTable): CountModel {
  const residual = (u: readonly [number, number]) => {
    const model = countChain(table, Math.exp(u[0]), Math.exp(u[1]), 1);
    const f: [number, number] = [model.term[0][1] - pa[EV.BB], model.term[0][0] - pa[EV.K]];
    return { model, f };
  };
  const clampU = (x: number) => Math.max(-15, Math.min(15, x));
  let u: [number, number] = [0, 0];
  let cur = residual(u);
  for (let iter = 0; iter < 100; iter++) {
    const norm = Math.hypot(cur.f[0], cur.f[1]);
    if (norm < 1e-12) break;
    const h = 1e-6;
    const fa = residual([u[0] + h, u[1]]).f;
    const fb = residual([u[0], u[1] + h]).f;
    const j00 = (fa[0] - cur.f[0]) / h;
    const j01 = (fb[0] - cur.f[0]) / h;
    const j10 = (fa[1] - cur.f[1]) / h;
    const j11 = (fb[1] - cur.f[1]) / h;
    const det = j00 * j11 - j01 * j10;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-18) break;
    const d0 = (j11 * cur.f[0] - j01 * cur.f[1]) / det;
    const d1 = (j00 * cur.f[1] - j10 * cur.f[0]) / det;
    let step = 1;
    let moved = false;
    for (let k = 0; k < 40 && !moved; k++) {
      const cand: [number, number] = [clampU(u[0] - step * d0), clampU(u[1] - step * d1)];
      const next = residual(cand);
      if (Math.hypot(next.f[0], next.f[1]) < norm) {
        u = cand;
        cur = next;
        moved = true;
      }
      step /= 2;
    }
    if (!moved) break;
  }
  return cur.model;
}

/** 그 카운트에서 타석이 끝날 사건 분포: K·BB는 term, 인플레이 몫은 pa의 인플레이 사건 비율대로 나눈다 */
export function outcomeAtCount(cm: CountModel, pa: ArrayLike<number>, balls: number, strikes: number): Float64Array {
  assertCount('outcomeAtCount', balls, strikes);
  const t = cm.term[balls * 3 + strikes];
  const play = pa[2] + pa[3] + pa[4] + pa[5] + pa[6];
  const out = new Float64Array(7);
  out[EV.K] = t[0];
  out[EV.BB] = t[1];
  for (let i = 2; i < 7; i++) out[i] = (t[2] * pa[i]) / play;
  return out;
}

/**
 * 한 구 진행 규칙: 던지기 전 카운트와 공 결과로 던진 뒤 카운트와 타석 종료를 돌려준다.
 * 볼넷이면 볼 4, 삼진이면 스트라이크 3, 인플레이(X)면 카운트 그대로. 2스트라이크 파울은 카운트 유지.
 */
export function nextCount(
  balls: number,
  strikes: number,
  code: PitchCode,
): { balls: number; strikes: number; ends: 'K' | 'BB' | 'X' | null } {
  assertCount('nextCount', balls, strikes);
  switch (code) {
    case 'B':
      return { balls: balls + 1, strikes, ends: balls === 3 ? 'BB' : null };
    case 'T':
    case 'S':
      return { balls, strikes: strikes + 1, ends: strikes === 2 ? 'K' : null };
    case 'F':
      return { balls, strikes: Math.min(strikes + 1, 2), ends: null };
    case 'X':
      return { balls, strikes, ends: 'X' };
    default:
      throw new RangeError(`nextCount: 알 수 없는 공 결과 ${String(code)}`);
  }
}

/** 난수 u로 그 카운트의 한 구 결과를 고른다 */
function pitchCodeAt(q: readonly number[], u: number): PitchCode {
  if (u < q[0]) return 'B';
  if (u < q[0] + q[1]) return 'T';
  if (u < q[0] + q[1] + q[2]) return 'S';
  if (u < q[0] + q[1] + q[2] + q[3]) return 'F';
  return 'X';
}

/**
 * 한 타석을 공 하나씩 뽑는다(engine.js 그대로). pitches의 balls·strikes는 그 공을 던지기 전 카운트이고,
 * 인플레이면 사건을 pa의 인플레이 비율대로 뽑는다.
 */
export function simulatePA(cm: CountModel, pa: ArrayLike<number>, r: () => number): { event: EventIndex; pitches: PitchSample[] } {
  let balls = 0;
  let strikes = 0;
  const pitches: PitchSample[] = [];
  for (let n = 0; n < MAX_PITCHES; n++) {
    const code = pitchCodeAt(cm.rates[balls * 3 + strikes], r());
    pitches.push({ balls, strikes, code });
    const next = nextCount(balls, strikes, code);
    if (next.ends === 'BB') return { event: EV.BB, pitches };
    if (next.ends === 'K') return { event: EV.K, pitches };
    if (next.ends === 'X') return { event: sampleInPlay(pa, r), pitches };
    balls = next.balls;
    strikes = next.strikes;
  }
  pitches.push({ balls, strikes, code: 'X' });
  return { event: sampleInPlay(pa, r), pitches };
}
