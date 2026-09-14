/* TMI 야구 engine: exact plate appearance -> half inning -> game probabilities, a pitch-count model,
   and "useless variable" effects. Runs in Node (tests) and in the browser (window.TMI).
   Event order everywhere: [K, BB(+HBP), HR, 3B, 2B, 1B, OUT in play]. Bases are a bitmask: 1st=1, 2nd=2, 3rd=4. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TMI = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EV = { K: 0, BB: 1, HR: 2, T3: 3, D2: 4, S1: 5, OUT: 6 };
  const EVENT_LABEL = ['삼진', '볼넷', '홈런', '3루타', '2루타', '안타', '범타'];
  const MAX_INN = 11; // KBO regular season: ties after the 11th
  const RMAX = 15; // runs in one half inning are capped here
  const DMAX = 20; // score differences beyond this are treated as this
  const STEP = 0.06; // log-odds per strength unit of a knob
  const LOG_CAP = 0.45; // stacked effects never move one event by more than x1.57
  const WIDTH = 2 * DMAX + 1;

  function rng(seed) {
    let a = seed >>> 0;
    return function next() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- plate appearance ----------
  function matchup(bRel, pRel, lg, mult) {
    const w = new Float64Array(7);
    let tot = 0;
    for (let i = 0; i < 7; i++) {
      w[i] = bRel[i] * pRel[i] * lg[i] * (mult ? mult[i] : 1);
      tot += w[i];
    }
    for (let i = 0; i < 7; i++) w[i] /= tot;
    return w;
  }

  function batterWin(d) {
    return 1 - d[EV.K] - d[EV.OUT];
  }

  // ---------- useless-variable effects ----------
  // who decides which plate appearances a knob touches; w is log-odds per strength unit on [K, BB, HR, 3B, 2B, 1B, OUT].
  // Positive strength is good for the subject (batter, pitcher, defense, team) or more of the phenomenon (environment).
  const KNOBS = {
    contact: { who: 'batter', label: '컨택', w: [-1, 0, 0, 0, 0.2, 0.5, -0.1] },
    power: { who: 'batter', label: '파워', w: [0.15, 0, 1, 0.2, 0.4, 0, -0.1] },
    eye: { who: 'batter', label: '선구안', w: [-0.3, 1, 0, 0, 0, 0, 0] },
    focus: { who: 'batter', label: '집중력', w: [-0.5, 0.2, 0.3, 0.3, 0.3, 0.3, -0.15] },
    speed: { who: 'batter', label: '주력', w: [0, 0, 0, 0.8, 0.1, 0.3, -0.1] },
    stuff: { who: 'pitcher', label: '구위', w: [1, 0, -0.5, -0.2, -0.3, -0.3, 0.1] },
    control: { who: 'pitcher', label: '제구', w: [0.2, -1, 0.15, 0, 0, 0, 0] },
    stamina: { who: 'pitcher', label: '체력', w: [0.3, -0.4, -0.5, -0.3, -0.3, -0.3, 0.1] },
    nerve: { who: 'pitcher', label: '멘탈', w: [0.3, -0.6, -0.4, 0, -0.2, -0.2, 0] },
    defense: { who: 'field', label: '수비', w: [0, 0, 0, -0.3, -0.3, -0.4, 0.2] },
    carry: { who: 'env', label: '타구 비거리', w: [0, 0, 1, 0.1, 0.3, 0, -0.1] },
    slick: { who: 'env', label: '미끄러운 공', w: [-0.3, 0.8, 0.2, 0, 0, 0, 0] },
    glare: { who: 'env', label: '시야 방해', w: [0.6, 0, -0.2, 0, -0.2, -0.2, 0] },
    mood: { who: 'team', label: '팀 분위기', w: [-0.3, 0.2, 0.2, 0.2, 0.2, 0.2, -0.1] },
  };

  function targets(t, playerId, side) {
    if (t.type === 'all') return true;
    if (t.type === 'player') return t.id === playerId;
    if (t.type === 'team') return t.side === side;
    return false;
  }

  function effectMultipliers(effects, ctx) {
    const log = new Float64Array(7);
    const fieldSide = ctx.batSide === 'away' ? 'home' : 'away';
    for (const fx of effects || []) {
      if (!fx || typeof fx !== 'object') continue;
      const knob = KNOBS[fx.knob];
      const strength = typeof fx.strength === 'number' ? fx.strength : NaN;
      if (!knob || !Number.isFinite(strength)) continue;
      if (fx.scope === 'pa' && !ctx.first) continue;
      const t = fx.target || { type: 'all' };
      let sign = 0;
      if (knob.who === 'env') sign = 1;
      else if (knob.who === 'batter') sign = targets(t, ctx.batterId, ctx.batSide) ? 1 : 0;
      else if (knob.who === 'pitcher' || knob.who === 'field') sign = targets(t, ctx.pitcherId, fieldSide) ? 1 : 0;
      else if (knob.who === 'team' && t.type === 'team') sign = t.side === ctx.batSide ? 1 : t.side === fieldSide ? -1 : 0;
      if (!sign) continue;
      const s = Math.max(-3, Math.min(3, strength));
      for (let i = 0; i < 7; i++) log[i] += STEP * s * sign * knob.w[i];
    }
    const m = new Float64Array(7);
    for (let i = 0; i < 7; i++) m[i] = Math.exp(Math.max(-LOG_CAP, Math.min(LOG_CAP, log[i])));
    return m;
  }

  // ---------- baserunning (exact version of pilot_player_sim.advance) ----------
  // moves: [from, to] with from 0 = batter, 1..3 = base; to 1..3 = base, 4 = scored, -1 = out.
  function buildTransitions(bases, outs, e) {
    const b1 = bases & 1;
    const b2 = (bases >> 1) & 1;
    const b3 = (bases >> 2) & 1;
    const list = [];
    const add = (p, n1, n2, n3, o, runs, play, moves) => {
      if (p <= 0) return;
      if (o >= 3) list.push({ p, bases: 0, outs: 3, runs: 0, play, moves });
      else list.push({ p, bases: n1 | (n2 << 1) | (n3 << 2), outs: o, runs, play, moves });
    };
    const runnersTo = (to) => [[3, 4], [2, 4], [1, 4]].filter(([from]) => (bases >> (from - 1)) & 1).map(([from]) => [from, to]);
    if (e === EV.K) {
      add(1, b1, b2, b3, outs + 1, 0, 'K', [[0, -1]]);
    } else if (e === EV.BB) {
      const moves = [[0, 1]];
      if (b1) moves.push([1, 2]);
      if (b1 && b2) moves.push([2, 3]);
      if (b1 && b2 && b3) moves.push([3, 4]);
      add(1, 1, b2 | b1, b3 | (b1 & b2), outs, b1 & b2 & b3, 'BB', moves);
    } else if (e === EV.HR) {
      add(1, 0, 0, 0, outs, b1 + b2 + b3 + 1, 'HR', runnersTo(4).concat([[0, 4]]));
    } else if (e === EV.T3) {
      add(1, 0, 0, 1, outs, b1 + b2 + b3, '3B', runnersTo(4).concat([[0, 3]]));
    } else if (e === EV.D2) {
      const moves = [[0, 2]];
      if (b3) moves.push([3, 4]);
      if (b2) moves.push([2, 4]);
      if (b1) {
        add(0.45, 0, 1, 0, outs, b2 + b3 + 1, '2B', moves.concat([[1, 4]]));
        add(0.55, 0, 1, 1, outs, b2 + b3, '2B', moves.concat([[1, 3]]));
      } else {
        add(1, 0, 1, 0, outs, b2 + b3, '2B', moves);
      }
    } else if (e === EV.S1) {
      const base = [[0, 1]];
      if (b3) base.push([3, 4]);
      const fromSecond = b2 ? [[0.62, 1], [0.38, 0]] : [[1, 0]];
      for (const [p2, scored] of fromSecond) {
        const onThird = b2 && !scored ? 1 : 0;
        const moves = b2 ? base.concat([[2, scored ? 4 : 3]]) : base;
        const runs = b3 + (b2 && scored ? 1 : 0);
        if (!b1) add(p2, 1, 0, onThird, outs, runs, '1B', moves);
        else if (onThird) add(p2, 1, 1, 1, outs, runs, '1B', moves.concat([[1, 2]]));
        else {
          add(p2 * 0.28, 1, 0, 1, outs, runs, '1B', moves.concat([[1, 3]]));
          add(p2 * 0.72, 1, 1, 0, outs, runs, '1B', moves.concat([[1, 2]]));
        }
      }
    } else {
      const GB = 0.46;
      const FB = 0.36;
      const LD = 0.18;
      let groundOut = GB;
      if (b1 && outs < 2) {
        groundOut = GB * 0.55;
        const moves = [[0, -1], [1, -1]];
        if (b2) moves.push([2, 3]);
        if (b3) moves.push([3, 4]);
        add(GB * 0.45, 0, 0, b2, outs + 2, b3, 'DP', moves);
      }
      if (outs + 1 >= 3) {
        add(groundOut, 0, 0, 0, 3, 0, 'GB', [[0, -1]]);
        add(FB, 0, 0, 0, 3, 0, 'FB', [[0, -1]]);
        add(LD, 0, 0, 0, 3, 0, 'LD', [[0, -1]]);
      } else {
        for (const [p3, scored] of (b3 ? [[0.5, 1], [0.5, 0]] : [[1, 0]])) {
          const held = b3 && !scored ? 1 : 0;
          for (const [p2, toThird] of (b2 && !held ? [[0.6, 1], [0.4, 0]] : [[1, 0]])) {
            let n1 = 0;
            let n2 = 0;
            let n3 = held;
            const moves = [[0, -1]];
            if (b3) moves.push([3, scored ? 4 : 3]);
            if (b2) {
              if (toThird) {
                n3 = 1;
                moves.push([2, 3]);
              } else {
                n2 = 1;
                moves.push([2, 2]);
              }
            }
            if (b1) {
              if (!n2) {
                n2 = 1;
                moves.push([1, 2]);
              } else {
                n1 = 1;
                moves.push([1, 1]);
              }
            }
            add(groundOut * p3 * p2, n1, n2, n3, outs + 1, scored, 'GB', moves);
          }
        }
        for (const [p3, scored] of (b3 ? [[0.55, 1], [0.45, 0]] : [[1, 0]])) {
          const held = b3 && !scored ? 1 : 0;
          for (const [p2, tag] of (b2 && !held ? [[0.25, 1], [0.75, 0]] : [[1, 0]])) {
            const moves = [[0, -1]];
            if (b3) moves.push([3, scored ? 4 : 3]);
            if (b2) moves.push([2, tag ? 3 : 2]);
            if (b1) moves.push([1, 1]);
            add(FB * p3 * p2, b1, b2 && !tag ? 1 : 0, held | tag, outs + 1, scored, scored ? 'SF' : 'FB', moves);
          }
        }
        add(LD, b1, b2, b3, outs + 1, 0, 'LD', [[0, -1]]);
      }
    }
    return list;
  }

  const TRANSITIONS = [];
  for (let o = 0; o < 3; o++) {
    for (let b = 0; b < 8; b++) {
      for (let e = 0; e < 7; e++) TRANSITIONS.push(buildTransitions(b, o, e));
    }
  }

  function transitions(bases, outs, e) {
    return TRANSITIONS[(outs * 8 + bases) * 7 + e];
  }

  function sampleEvent(dist, r) {
    let u = r();
    for (let i = 0; i < 6; i++) {
      if (u < dist[i]) return i;
      u -= dist[i];
    }
    return 6;
  }

  function sampleInPlay(pa, r) {
    let u = r() * (pa[2] + pa[3] + pa[4] + pa[5] + pa[6]);
    for (let i = 2; i < 6; i++) {
      if (u < pa[i]) return i;
      u -= pa[i];
    }
    return 6;
  }

  function sampleTransition(bases, outs, e, r) {
    const list = transitions(bases, outs, e);
    let u = r();
    for (let k = 0; k < list.length - 1; k++) {
      if (u < list[k].p) return list[k];
      u -= list[k].p;
    }
    return list[list.length - 1];
  }

  // ---------- pitch count ----------
  // table[balls * 3 + strikes] = league shares [ball, called strike, swinging strike, foul, in play].
  function countChain(table, aBall, aStrike, aPlay) {
    const rates = new Array(12);
    const term = new Array(12); // [K, BB, in play] absorption probabilities from each count
    for (let b = 3; b >= 0; b--) {
      for (let s = 2; s >= 0; s--) {
        const c = b * 3 + s;
        const row = table[c];
        const raw = [row[0] * aBall, row[1] * aStrike, row[2] * aStrike, row[3], row[4] * aPlay];
        const tot = raw[0] + raw[1] + raw[2] + raw[3] + raw[4];
        const [pB, pT, pS, pF, pX] = raw.map((x) => x / tot);
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

  // Scale ball and strike rates (in-play fixed) so the chain's walk and strikeout shares from 0-0 match the matchup.
  // Damped Newton in log space; two unknowns for two free targets, so the scale cannot drift.
  function calibrateCount(pa, table) {
    const residual = (u) => {
      const model = countChain(table, Math.exp(u[0]), Math.exp(u[1]), 1);
      return { model, f: [model.term[0][1] - pa[EV.BB], model.term[0][0] - pa[EV.K]] };
    };
    const clampU = (x) => Math.max(-15, Math.min(15, x));
    let u = [0, 0];
    let cur = residual(u);
    for (let it = 0; it < 100; it++) {
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
        const cand = [clampU(u[0] - step * d0), clampU(u[1] - step * d1)];
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

  function outcomeAtCount(cm, pa, b, s) {
    const t = cm.term[b * 3 + s];
    const play = pa[2] + pa[3] + pa[4] + pa[5] + pa[6];
    const out = new Float64Array(7);
    out[0] = t[0];
    out[1] = t[1];
    for (let i = 2; i < 7; i++) out[i] = (t[2] * pa[i]) / play;
    return out;
  }

  function simulatePA(cm, pa, r) {
    let b = 0;
    let s = 0;
    const pitches = [];
    for (let n = 0; n < 400; n++) {
      const q = cm.rates[b * 3 + s];
      const u = r();
      const code = u < q[0] ? 'B' : u < q[0] + q[1] ? 'T' : u < q[0] + q[1] + q[2] ? 'S' : u < q[0] + q[1] + q[2] + q[3] ? 'F' : 'X';
      pitches.push({ balls: b, strikes: s, code });
      if (code === 'B') {
        if (b === 3) return { event: EV.BB, pitches };
        b += 1;
      } else if (code === 'T' || code === 'S') {
        if (s === 2) return { event: EV.K, pitches };
        s += 1;
      } else if (code === 'F') {
        if (s < 2) s += 1;
      } else {
        return { event: sampleInPlay(pa, r), pitches };
      }
    }
    pitches.push({ balls: b, strikes: s, code: 'X' });
    return { event: sampleInPlay(pa, r), pitches };
  }

  // ---------- half inning ----------
  // Returns P(runs added from now = r, next half starts with slot s) at index r * 9 + s.
  function halfInning(dists, start, firstDist) {
    const R = RMAX + 1;
    let cur = new Float64Array(3 * 8 * 9 * R);
    const term = new Float64Array(R * 9);
    cur[(((start.outs || 0) * 8 + (start.bases || 0)) * 9 + start.slot) * R] = 1;
    let first = Boolean(firstDist);
    for (let step = 0; step < 200; step++) {
      const next = new Float64Array(cur.length);
      let active = 0;
      for (let o = 0; o < 3; o++) {
        for (let b = 0; b < 8; b++) {
          for (let sl = 0; sl < 9; sl++) {
            const at = ((o * 8 + b) * 9 + sl) * R;
            const dist = first ? firstDist : dists[sl];
            const ns = (sl + 1) % 9;
            for (let r = 0; r < R; r++) {
              const m = cur[at + r];
              if (m === 0) continue;
              for (let e = 0; e < 7; e++) {
                const pe = m * dist[e];
                if (pe === 0) continue;
                const list = TRANSITIONS[(o * 8 + b) * 7 + e];
                for (let k = 0; k < list.length; k++) {
                  const x = list[k];
                  const pm = pe * x.p;
                  const rr = Math.min(r + x.runs, RMAX);
                  if (x.outs >= 3) term[rr * 9 + ns] += pm;
                  else {
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
      if (active < 1e-15) break;
    }
    return term;
  }

  function halfSummary(hd) {
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

  // ---------- game ----------
  // cfg: { lg, away: { lineup: [{id, rel}] x9, bullpen: {id, rel} }, home: {...}, effects, countTable }
  // The pitcher passed to evaluate() finishes the current half; later halves face each team's bullpen composite.
  function createGame(cfg) {
    const { lg, away, home } = cfg;
    const effects = cfg.effects || [];
    const countTable = cfg.countTable || null;

    const distsFor = (batSide, pitcher) => (batSide === 'away' ? away : home).lineup.map((b) => matchup(
      b.rel, pitcher.rel, lg, effectMultipliers(effects, { batterId: b.id, pitcherId: pitcher.id, batSide, first: false })));
    const sparse = (hd) => {
      const list = [];
      for (let r = 0; r <= RMAX; r++) {
        for (let s = 0; s < 9; s++) {
          if (hd[r * 9 + s] > 1e-16) list.push(r, s, hd[r * 9 + s]);
        }
      }
      return list;
    };
    const awayLater = distsFor('away', home.bullpen);
    const homeLater = distsFor('home', away.bullpen);
    const halvesAway = [];
    const halvesHome = [];
    for (let s = 0; s < 9; s++) {
      halvesAway.push(sparse(halfInning(awayLater, { slot: s, outs: 0, bases: 0 })));
      halvesHome.push(sparse(halfInning(homeLater, { slot: s, outs: 0, bases: 0 })));
    }

    const size = WIDTH * 81;
    const topWin = [];
    const topTie = [];
    const botWin = [];
    const botTie = [];
    for (let i = 0; i <= MAX_INN + 1; i++) {
      topWin.push(new Float64Array(size));
      topTie.push(new Float64Array(size));
      botWin.push(new Float64Array(size));
      botTie.push(new Float64Array(size));
    }
    const index = (d, sA, sH) => ((d > DMAX ? DMAX : d < -DMAX ? -DMAX : d) + DMAX) * 81 + sA * 9 + sH;

    // [home win, tie] once the bottom of inning i is over with home - away = d
    function afterBottom(i, d, sA, sH, out) {
      if (i >= 9 && d !== 0) {
        out[0] = d > 0 ? 1 : 0;
        out[1] = 0;
      } else if (i >= MAX_INN) {
        out[0] = 0;
        out[1] = 1;
      } else {
        const k = index(d, sA, sH);
        out[0] = topWin[i + 1][k];
        out[1] = topTie[i + 1][k];
      }
    }

    // [home win, tie] at the start of the bottom of inning i; home does not bat in the 9th or later when ahead
    function startBottom(i, d, sA, sH, out) {
      if (i >= 9 && d > 0) {
        out[0] = 1;
        out[1] = 0;
      } else {
        const k = index(d, sA, sH);
        out[0] = botWin[i][k];
        out[1] = botTie[i][k];
      }
    }

    const tmp = [0, 0];
    for (let i = MAX_INN; i >= 1; i--) {
      for (let di = 0; di < WIDTH; di++) {
        for (let sA = 0; sA < 9; sA++) {
          for (let sH = 0; sH < 9; sH++) {
            const k = di * 81 + sA * 9 + sH;
            const list = halvesHome[sH];
            let w = 0;
            let t = 0;
            for (let j = 0; j < list.length; j += 3) {
              afterBottom(i, di - DMAX + list[j], sA, list[j + 1], tmp);
              w += list[j + 2] * tmp[0];
              t += list[j + 2] * tmp[1];
            }
            botWin[i][k] = w;
            botTie[i][k] = t;
          }
        }
      }
      for (let di = 0; di < WIDTH; di++) {
        for (let sA = 0; sA < 9; sA++) {
          for (let sH = 0; sH < 9; sH++) {
            const k = di * 81 + sA * 9 + sH;
            const list = halvesAway[sA];
            let w = 0;
            let t = 0;
            for (let j = 0; j < list.length; j += 3) {
              startBottom(i, di - DMAX - list[j], list[j + 1], sH, tmp);
              w += list[j + 2] * tmp[0];
              t += list[j + 2] * tmp[1];
            }
            topWin[i][k] = w;
            topTie[i][k] = t;
          }
        }
      }
    }

    function evaluate(st, pitcher) {
      const batSide = st.half === 0 ? 'away' : 'home';
      const slot = batSide === 'away' ? st.slotAway : st.slotHome;
      const batter = (batSide === 'away' ? away : home).lineup[slot];
      const dists = distsFor(batSide, pitcher);
      const pa = matchup(batter.rel, pitcher.rel, lg, effectMultipliers(effects, { batterId: batter.id, pitcherId: pitcher.id, batSide, first: true }));
      const out = [0, 0];

      const endOfHalf = (runs, nextSlot) => {
        if (st.half === 0) startBottom(st.inning, st.home - st.away - runs, nextSlot, st.slotHome, out);
        else afterBottom(st.inning, st.home + runs - st.away, st.slotAway, nextSlot, out);
        return out;
      };
      const valueFrom = (hd, runsBefore) => {
        let w = 0;
        let t = 0;
        let p0 = 0;
        let expRuns = 0;
        for (let r = 0; r <= RMAX; r++) {
          for (let s = 0; s < 9; s++) {
            const p = hd[r * 9 + s];
            if (p === 0) continue;
            const v = endOfHalf(Math.min(runsBefore + r, RMAX), s);
            w += p * v[0];
            t += p * v[1];
            if (r === 0) p0 += p;
            expRuns += p * r;
          }
        }
        return { w, t, p0, expRuns };
      };

      const now = valueFrom(halfInning(dists, { slot, outs: st.outs, bases: st.bases }, pa), 0);
      const nextSlot = (slot + 1) % 9;
      const memo = new Map();
      const after = [];
      for (let e = 0; e < 7; e++) {
        let w = 0;
        let t = 0;
        let score = 0;
        for (const x of transitions(st.bases, st.outs, e)) {
          if (x.outs >= 3) {
            const v = endOfHalf(0, nextSlot);
            w += x.p * v[0];
            t += x.p * v[1];
            continue;
          }
          const key = x.outs * 8 + x.bases;
          if (!memo.has(key)) memo.set(key, halfInning(dists, { slot: nextSlot, outs: x.outs, bases: x.bases }));
          const v = valueFrom(memo.get(key), x.runs);
          w += x.p * v.w;
          t += x.p * v.t;
          score += x.p * (x.runs > 0 ? 1 : 1 - v.p0);
        }
        after.push({ winHome: w, tie: t, winAway: 1 - w - t, inningScore: score });
      }
      return {
        batSide,
        pa,
        batterWin: batterWin(pa),
        pitcherWin: 1 - batterWin(pa),
        inningScore: 1 - now.p0,
        expRuns: now.expRuns,
        winHome: now.w,
        tie: now.t,
        winAway: 1 - now.w - now.t,
        after,
        count: countTable ? calibrateCount(pa, countTable) : null,
      };
    }

    return { evaluate };
  }

  function gaugesAtCount(v, b, s) {
    const d = outcomeAtCount(v.count, v.pa, b, s);
    let w = 0;
    let t = 0;
    let score = 0;
    for (let e = 0; e < 7; e++) {
      w += d[e] * v.after[e].winHome;
      t += d[e] * v.after[e].tie;
      score += d[e] * v.after[e].inningScore;
    }
    return { dist: d, batterWin: batterWin(d), inningScore: score, winHome: w, tie: t, winAway: 1 - w - t };
  }

  return {
    EV, EVENT_LABEL, KNOBS, MAX_INN, RMAX, STEP, LOG_CAP,
    rng, matchup, batterWin, effectMultipliers, transitions, sampleEvent, sampleInPlay, sampleTransition,
    calibrateCount, outcomeAtCount, simulatePA, halfInning, halfSummary, createGame, gaugesAtCount,
  };
}));
