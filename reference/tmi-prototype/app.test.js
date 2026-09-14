'use strict';
// Pure app logic: Korean particles, offline variable rules, AI answer checks, pitch replay picking, KBO scoreboard rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./engine.js');
const A = require('./app.js');

const ctx = (over) => ({ batter: { id: 'b', name: '이호연' }, pitcher: { id: 'p', name: '김원중' }, homeBatting: true, ...over });
const bottomNine = { inning: 9, half: 1, outs: 2, bases: 0b111, away: 5, home: 4, slotAway: 1, slotHome: 7 };

test('Korean particles follow the final consonant', () => {
  assert.equal(A.josa('김원중', '이/가'), '김원중이');
  assert.equal(A.josa('이의리', '이/가'), '이의리가');
  assert.equal(A.josa('김서현', '은/는'), '김서현은');
  assert.equal(A.josa('KIA', '이/가'), 'KIA가');
  assert.equal(A.josa('롯데', '으로/로'), '롯데로');
  assert.equal(A.josa('김선빈', '으로/로'), '김선빈으로');
  assert.equal(A.josa('서울', '으로/로'), '서울로');
});

test("offline rules turn a named player's big meal into a stamina or focus dip", () => {
  const p = A.ruleInterpret('김원중이 경기 전 짜장면 곱빼기를 먹었다', ctx());
  assert.deepEqual(p.effects.map(({ knob, targetKind, strength, scope }) => ({ knob, targetKind, strength, scope })),
    [{ knob: 'stamina', targetKind: 'pitcher', strength: -1, scope: 'game' }]);
  const b = A.ruleInterpret('이호연이 짜장면 곱빼기를 먹었다', ctx());
  assert.deepEqual([b.effects[0].knob, b.effects[0].targetKind, b.effects[0].strength], ['focus', 'batter', -1]);
});

test('offline rules read weather as an everyone effect and crowds as a home-team effect', () => {
  const wind = A.ruleInterpret('야구장에 역풍이 세게 분다', ctx());
  assert.deepEqual([wind.effects[0].knob, wind.effects[0].targetKind, wind.effects[0].strength], ['carry', 'everyone', -2]);
  assert.equal(A.ruleInterpret('관중 2만 명이 떼창 중', ctx({ homeBatting: true })).effects[0].targetKind, 'batting_team');
  assert.equal(A.ruleInterpret('관중 2만 명이 떼창 중', ctx({ homeBatting: false })).effects[0].targetKind, 'fielding_team');
});

test('an unreadable variable produces no effect', () => {
  assert.deepEqual(A.ruleInterpret('외계인이 우주선에서 경기를 본다', ctx()).effects, []);
});

test('AI answers are checked before they touch the model', () => {
  const out = A.normalizeAI({
    comment: '해설',
    effects: [
      { knob: 'power', target: 'pitcher', strength: 2, scope: 'game', evidence: 'fun', why: 'x' },
      { knob: 'stuff', target: 'pitcher', strength: 7, scope: 'pa', evidence: 'data', why: 'y' },
      { knob: 'carry', target: 'batter', strength: 1.6, why: 'z' },
      { knob: 'teleport', target: 'everyone', strength: 1 },
      { knob: 'eye', target: 'batter', strength: 0 },
    ],
  });
  assert.equal(out.refused, false);
  assert.deepEqual(out.effects.map((e) => [e.knob, e.targetKind, e.strength, e.scope, e.evidence]), [
    ['stuff', 'pitcher', 3, 'pa', 'data'],
    ['carry', 'everyone', 2, 'game', 'fun'],
  ]);
  assert.equal(A.normalizeAI('nope'), null);
  const refused = A.normalizeAI({ refused: true, reason: '실존 선수 사생활' });
  assert.equal(refused.refused, true);
  assert.deepEqual(refused.effects, []);
});

test('interpreted effects become engine targets for the current matchup', () => {
  const c = { batterId: 'b7', pitcherId: 'p1', batSide: 'away' };
  assert.deepEqual(A.toEngineTarget('batter', c), { type: 'player', id: 'b7' });
  assert.deepEqual(A.toEngineTarget('pitcher', c), { type: 'player', id: 'p1' });
  assert.deepEqual(A.toEngineTarget('batting_team', c), { type: 'team', side: 'away' });
  assert.deepEqual(A.toEngineTarget('fielding_team', c), { type: 'team', side: 'home' });
  assert.deepEqual(A.toEngineTarget('everyone', c), { type: 'all' });
});

test('replayed pitches come from the same result and count situation when possible', () => {
  const rows = [
    [0, 150, 0, 0, 0, 1, 0, 0, 0, -130, 0, 0, 25, -30, 3.4, 1.6],
    [3, 135, 1, 0, 2, 1, 0, 0, 0, -120, 0, 0, 25, -30, 3.4, 1.6],
    [3, 136, 1, 3, 0, 0, 0, 0, 0, -120, 0, 0, 25, -30, 3.4, 1.6],
    [7, 131, 4, 1, 1, 1, 0, 0, 0, -118, 0, 0, 25, -30, 3.4, 1.6],
  ];
  assert.equal(A.pickPitch(rows, 'T', 0, 2, 1, () => 0), rows[1]);
  assert.equal(A.pickPitch(rows, 'T', 3, 0, 0, () => 0), rows[2]);
  assert.equal(A.pickPitch(rows, 'X', 2, 2, 0, () => 0), rows[3]);
  assert.equal(A.pickPitch(rows, 'S', 0, 0, 1, () => 0.99), rows[3]);
});

test('plays update the scoreboard and end games by KBO rules', () => {
  const slam = T.transitions(0b111, 2, T.EV.HR)[0];
  const a = A.applyPlay(bottomNine, slam);
  assert.deepEqual([a.state.home, a.state.bases, a.state.slotHome], [8, 0, 8]);
  assert.deepEqual(a.over, { kind: 'game', winner: 'home', walkoff: true });
  assert.equal(bottomNine.home, 4, 'input state is not mutated');

  assert.deepEqual(A.applyPlay(bottomNine, T.transitions(0b111, 2, T.EV.K)[0]).over, { kind: 'game', winner: 'away', walkoff: false });

  const dp = T.transitions(0b101, 1, T.EV.OUT).find((x) => x.play === 'DP');
  assert.deepEqual(A.applyPlay({ inning: 11, half: 1, outs: 1, bases: 0b101, away: 2, home: 1, slotAway: 3, slotHome: 4 }, dp).over,
    { kind: 'game', winner: 'away', walkoff: false });

  const tieEnd = A.applyPlay({ inning: 11, half: 1, outs: 2, bases: 0, away: 3, home: 3, slotAway: 0, slotHome: 0 }, T.transitions(0, 2, T.EV.K)[0]);
  assert.deepEqual(tieEnd.over, { kind: 'game', winner: 'tie', walkoff: false });

  const topTen = A.applyPlay({ inning: 10, half: 0, outs: 2, bases: 0b110, away: 7, home: 7, slotAway: 8, slotHome: 5 }, T.transitions(0b110, 2, T.EV.K)[0]);
  assert.deepEqual([topTen.over.kind, topTen.state.slotAway], ['half', 0]);

  const topNineLead = A.applyPlay({ inning: 9, half: 0, outs: 2, bases: 0, away: 1, home: 3, slotAway: 2, slotHome: 0 }, T.transitions(0, 2, T.EV.K)[0]);
  assert.deepEqual(topNineLead.over, { kind: 'game', winner: 'home', walkoff: false });

  const single = T.transitions(0b001, 0, T.EV.S1)[0];
  assert.equal(A.applyPlay({ inning: 3, half: 0, outs: 0, bases: 0b001, away: 0, home: 0, slotAway: 4, slotHome: 0 }, single).over, null);
});

test('headlines name the moment', () => {
  const slam = T.transitions(0b111, 2, T.EV.HR)[0];
  assert.equal(A.headline(T.EV.HR, slam, A.applyPlay(bottomNine, slam)), '끝내기 만루 홈런!');
  const walk = T.transitions(0b111, 2, T.EV.BB)[0];
  assert.equal(A.headline(T.EV.BB, walk, A.applyPlay(bottomNine, walk)), '밀어내기 볼넷');
  assert.equal(A.headline(T.EV.BB, walk, A.applyPlay({ ...bottomNine, away: 2, home: 2 }, walk)), '끝내기 밀어내기 볼넷!');
  const dp = T.transitions(0b101, 1, T.EV.OUT).find((x) => x.play === 'DP');
  assert.equal(A.headline(T.EV.OUT, dp, A.applyPlay({ ...bottomNine, inning: 11, outs: 1, bases: 0b101, away: 2, home: 1 }, dp)), '병살타');
  const k = T.transitions(0, 0, T.EV.K)[0];
  assert.equal(A.headline(T.EV.K, k, A.applyPlay({ ...bottomNine, outs: 0, bases: 0 }, k)), '삼진');
  const two = T.transitions(0b010, 1, T.EV.HR)[0];
  assert.equal(A.headline(T.EV.HR, two, A.applyPlay({ ...bottomNine, inning: 5, outs: 1, bases: 0b010 }, two)), '2점 홈런!');
});

test('differences read as percentage points with enough digits for tiny effects', () => {
  assert.equal(A.formatDelta(0.008), '+0.8%p');
  assert.equal(A.formatDelta(-0.0007), '−0.07%p');
  assert.equal(A.formatDelta(0.00001), '±0.00%p');
  assert.equal(A.formatDelta(0.1234), '+12.3%p');
});
