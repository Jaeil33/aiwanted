'use strict';
// Engine tests: plate appearance -> half inning -> game, the pitch-count model and the "useless variable" effects.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./engine.js');

const LG = [0.197, 0.111, 0.024, 0.004, 0.041, 0.170, 0.453]; // 2026 KBO plate-appearance mix: K BB HR 3B 2B 1B OUT
const ONES = [1, 1, 1, 1, 1, 1, 1];
const COUNT_TABLE = []; // synthetic [ball, called strike, swinging strike, foul, in play] per count, index balls * 3 + strikes
for (let b = 0; b < 4; b++) {
  for (let s = 0; s < 3; s++) {
    COUNT_TABLE.push([0.36 + 0.02 * s - 0.03 * b, 0.17 - 0.03 * s + (b === 3 ? 0.08 : 0), 0.10 + 0.01 * s, 0.18 + 0.05 * s, 0.19 - 0.02 * s + 0.02 * b]);
  }
}

const sum = (xs) => Array.from(xs).reduce((a, x) => a + x, 0);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const onBase = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
const team = (prefix, rel = ONES) => ({
  lineup: Array.from({ length: 9 }, (_, i) => ({ id: `${prefix}${i}`, rel })),
  bullpen: { id: `${prefix}pen`, rel: ONES },
});
const at = (over) => ({ inning: 1, half: 0, outs: 0, bases: 0, away: 0, home: 0, slotAway: 0, slotHome: 0, ...over });
const pitcher = (id, rel = ONES) => ({ id, rel });
const game = (effects = []) => T.createGame({ lg: LG, away: team('a'), home: team('h'), effects, countTable: COUNT_TABLE });

// ---------- plate appearance ----------
test('league-average batter against league-average pitcher reproduces the league mix', () => {
  const p = T.matchup(ONES, ONES, LG);
  near(sum(p), 1, 1e-12, 'total');
  LG.forEach((x, i) => near(p[i], x / sum(LG), 1e-12, `event ${i}`));
});

test('a strikeout pitcher raises the strikeout share against the same batter', () => {
  assert.ok(T.matchup(ONES, [1.5, 1, 1, 1, 1, 1, 1], LG)[T.EV.K] > T.matchup(ONES, ONES, LG)[T.EV.K]);
});

// ---------- useless-variable effects ----------
test('a game-long effect on one batter changes only that batter', () => {
  const fx = [{ knob: 'power', strength: 3, scope: 'game', target: { type: 'player', id: 'a3' } }];
  const own = T.effectMultipliers(fx, { batterId: 'a3', pitcherId: 'hpen', batSide: 'away', first: false });
  const mate = T.effectMultipliers(fx, { batterId: 'a4', pitcherId: 'hpen', batSide: 'away', first: false });
  assert.ok(own[T.EV.HR] > 1);
  assert.deepEqual(Array.from(mate), ONES);
});

test('a this-at-bat effect expires after the first plate appearance', () => {
  const fx = [{ knob: 'stuff', strength: -2, scope: 'pa', target: { type: 'player', id: 'p' } }];
  assert.ok(T.effectMultipliers(fx, { batterId: 'a0', pitcherId: 'p', batSide: 'away', first: true })[T.EV.K] < 1);
  assert.deepEqual(Array.from(T.effectMultipliers(fx, { batterId: 'a0', pitcherId: 'p', batSide: 'away', first: false })), ONES);
});

test('team effects follow the side: batting knobs reach its batters, pitching knobs its pitchers', () => {
  const fx = [
    { knob: 'contact', strength: 2, scope: 'game', target: { type: 'team', side: 'home' } },
    { knob: 'control', strength: -2, scope: 'game', target: { type: 'team', side: 'home' } },
  ];
  const homeBatting = T.effectMultipliers(fx, { batterId: 'h1', pitcherId: 'apen', batSide: 'home', first: false });
  const homePitching = T.effectMultipliers(fx, { batterId: 'a1', pitcherId: 'hpen', batSide: 'away', first: false });
  assert.ok(homeBatting[T.EV.K] < 1 && homeBatting[T.EV.BB] === 1);
  assert.ok(homePitching[T.EV.BB] > 1 && homePitching[T.EV.K] <= 1);
});

test('environment effects reach every plate appearance and stacking is capped', () => {
  const wind = [{ knob: 'carry', strength: 2, scope: 'game', target: { type: 'all' } }];
  for (const batSide of ['away', 'home']) {
    assert.ok(T.effectMultipliers(wind, { batterId: 'x', pitcherId: 'y', batSide, first: false })[T.EV.HR] > 1);
  }
  const pile = Array.from({ length: 20 }, () => ({ knob: 'power', strength: 3, scope: 'game', target: { type: 'all' } }));
  near(T.effectMultipliers(pile, { batterId: 'x', pitcherId: 'y', batSide: 'away', first: false })[T.EV.HR], Math.exp(T.LOG_CAP), 1e-12, 'cap');
});

test('unknown knobs and malformed effects are ignored', () => {
  const fx = [{ knob: 'telekinesis', strength: 3, scope: 'game', target: { type: 'all' } }, { knob: 'power', strength: 'lots', scope: 'game', target: { type: 'all' } }, null];
  assert.deepEqual(Array.from(T.effectMultipliers(fx, { batterId: 'x', pitcherId: 'y', batSide: 'away', first: true })), ONES);
});

// ---------- baserunning ----------
test('baserunning outcomes are complete probability splits that conserve runners', () => {
  for (let outs = 0; outs < 3; outs++) {
    for (let bases = 0; bases < 8; bases++) {
      for (let e = 0; e < 7; e++) {
        const branches = T.transitions(bases, outs, e);
        near(sum(branches.map((x) => x.p)), 1, 1e-12, `probabilities ${outs}/${bases}/${e}`);
        for (const x of branches) {
          if (x.outs >= 3) {
            assert.equal(x.runs, 0, `no runs on the third out ${outs}/${bases}/${e}`);
          } else {
            assert.equal(onBase(bases) + 1, onBase(x.bases) + x.runs + x.outs - outs, `runners ${outs}/${bases}/${e}`);
          }
        }
      }
    }
  }
});

test('bases-loaded walk forces in a run and a homer clears the bases', () => {
  const [walk] = T.transitions(0b111, 1, T.EV.BB);
  assert.deepEqual([walk.bases, walk.outs, walk.runs], [0b111, 1, 1]);
  const [homer] = T.transitions(0b001, 0, T.EV.HR);
  assert.deepEqual([homer.bases, homer.outs, homer.runs], [0, 0, 2]);
});

// ---------- pitch count ----------
test('count model reproduces the matchup strikeout, walk and in-play shares from 0-0', () => {
  for (const pa of [T.matchup(ONES, ONES, LG), T.matchup(ONES, [2, 0.5, 1, 1, 1, 1, 1], LG), T.matchup([0.6, 1.8, 1.5, 1, 1, 1, 1], ONES, LG)]) {
    const cm = T.calibrateCount(pa, COUNT_TABLE);
    T.outcomeAtCount(cm, pa, 0, 0).forEach((x, i) => near(x, pa[i], 1e-6, `event ${i}`));
  }
});

test('hitter counts favour the batter and pitcher counts the pitcher', () => {
  const pa = T.matchup(ONES, ONES, LG);
  const cm = T.calibrateCount(pa, COUNT_TABLE);
  const win = (b, s) => T.batterWin(T.outcomeAtCount(cm, pa, b, s));
  assert.ok(win(3, 0) > win(0, 0));
  assert.ok(win(0, 0) > win(0, 2));
});

test('simulated plate appearances follow the rules of the count', () => {
  const pa = T.matchup(ONES, ONES, LG);
  const cm = T.calibrateCount(pa, COUNT_TABLE);
  const r = T.rng(3);
  for (let n = 0; n < 2000; n++) {
    const { event, pitches } = T.simulatePA(cm, pa, r);
    let b = 0;
    let s = 0;
    pitches.forEach((p, i) => {
      assert.deepEqual([p.balls, p.strikes], [b, s]);
      const last = i === pitches.length - 1;
      if (p.code === 'B') {
        b += 1;
        assert.equal(b === 4, last);
      } else if (p.code === 'T' || p.code === 'S') {
        s += 1;
        assert.equal(s === 3, last);
      } else if (p.code === 'F') {
        s = Math.min(s + 1, 2);
        assert.ok(!last);
      } else {
        assert.equal(p.code, 'X');
        assert.ok(last);
      }
    });
    const end = pitches[pitches.length - 1].code;
    if (event === T.EV.K) assert.ok(end === 'T' || end === 'S');
    else if (event === T.EV.BB) assert.equal(end, 'B');
    else assert.equal(end, 'X');
  }
});

test('pitch-by-pitch simulation reproduces the plate appearance mix', () => {
  const pa = T.matchup(ONES, [1.3, 0.8, 0.9, 1, 1, 1, 1], LG);
  const cm = T.calibrateCount(pa, COUNT_TABLE);
  const r = T.rng(11);
  const N = 100000;
  const seen = new Array(7).fill(0);
  for (let n = 0; n < N; n++) seen[T.simulatePA(cm, pa, r).event] += 1;
  seen.forEach((c, i) => near(c / N, pa[i], 0.006, `event ${i}`));
});

// ---------- half inning ----------
test('three strikeout batters hand the next inning to the fourth hitter', () => {
  const whiff = T.matchup([1e6, 1e-9, 1e-9, 1e-9, 1e-9, 1e-9, 1e-9], ONES, LG);
  const hd = T.halfInning(Array(9).fill(whiff), { slot: 0, outs: 0, bases: 0 });
  near(sum(hd), 1, 1e-9, 'total');
  assert.ok(hd[0 * 9 + 3] > 0.999);
});

test('exact half-inning runs match a seeded simulation of the same rules', () => {
  const slugger = [0.8, 1.2, 2.0, 1, 1.2, 1, 0.9];
  const dists = Array.from({ length: 9 }, (_, i) => T.matchup(i === 3 ? slugger : ONES, ONES, LG));
  const exact = T.halfSummary(T.halfInning(dists, { slot: 0, outs: 0, bases: 0 }));
  const r = T.rng(7);
  const N = 200000;
  let scored = 0;
  let runs = 0;
  for (let n = 0; n < N; n++) {
    let outs = 0;
    let bases = 0;
    let slot = 0;
    let total = 0;
    while (outs < 3) {
      const x = T.sampleTransition(bases, outs, T.sampleEvent(dists[slot], r), r);
      outs = x.outs;
      bases = x.bases;
      total += x.runs;
      slot = (slot + 1) % 9;
    }
    scored += total > 0 ? 1 : 0;
    runs += total;
  }
  near(scored / N, exact.pScore, 0.005, 'P(score)');
  near(runs / N, exact.expRuns, 0.02, 'expected runs');
});

// ---------- game ----------
test('identical teams split the game evenly', () => {
  const v = game().evaluate(at({}), pitcher('hpen'));
  near(v.winHome, v.winAway, 1e-9, 'home vs away');
  near(v.winHome + v.winAway + v.tie, 1, 1e-9, 'total');
  assert.ok(v.tie > 0 && v.tie < 0.1);
});

test('late-game states behave like baseball', () => {
  const g = game();
  assert.ok(g.evaluate(at({ inning: 9, half: 1, outs: 2, home: 0, away: 5 }), pitcher('apen')).winHome < 0.02);
  assert.ok(g.evaluate(at({ inning: 9, half: 1, outs: 0, bases: 0b111, home: 3, away: 3 }), pitcher('apen')).winHome > 0.75);
  assert.ok(g.evaluate(at({ inning: 9, half: 0, outs: 2, home: 10, away: 0 }), pitcher('hpen')).winHome > 0.999);
});

test('win probability now is the mix over this plate appearance outcomes', () => {
  const v = game().evaluate(at({ inning: 8, half: 1, outs: 1, bases: 0b011, away: 3, home: 2, slotHome: 4, slotAway: 6 }), pitcher('apen'));
  near(sum(v.pa.map((x, e) => x * v.after[e].winHome)), v.winHome, 1e-9, 'game');
  near(sum(v.pa.map((x, e) => x * v.after[e].inningScore)), v.inningScore, 1e-9, 'inning');
});

test('count gauges start at the plate appearance values and lean with the count', () => {
  const v = game().evaluate(at({ inning: 8, half: 1, outs: 1, bases: 0b011, away: 3, home: 2, slotHome: 4, slotAway: 6 }), pitcher('apen'));
  const start = T.gaugesAtCount(v, 0, 0);
  near(start.batterWin, v.batterWin, 1e-6, 'batter');
  near(start.inningScore, v.inningScore, 1e-6, 'inning');
  near(start.winHome, v.winHome, 1e-6, 'game');
  assert.ok(T.gaugesAtCount(v, 3, 0).winHome > T.gaugesAtCount(v, 0, 2).winHome);
});

test('one batter effect cascades: plate appearance, inning and game all move the same way', () => {
  const s = at({ inning: 7, half: 0, outs: 1, bases: 0b001, away: 2, home: 3, slotAway: 3 });
  const base = game().evaluate(s, pitcher('hpen'));
  const boosted = game([{ knob: 'power', strength: 3, scope: 'pa', target: { type: 'player', id: 'a3' } }]).evaluate(s, pitcher('hpen'));
  assert.ok(boosted.batterWin > base.batterWin, 'plate appearance');
  assert.ok(boosted.inningScore > base.inningScore, 'inning');
  assert.ok(boosted.winAway > base.winAway, 'game');
});
