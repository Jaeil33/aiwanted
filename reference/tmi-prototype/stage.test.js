'use strict';
// Pure geometry behind the broadcast canvas: camera projection, real pitch kinematics, batted balls, pose easing.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./stage.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
// One real tracked pitch from the 2026-08-01 relay; Naver reports crossPlateX -0.264756 for it.
const REAL = [3, 135, 0, 0, 0, 0, 1.04356, 6.04893, -3.05429, -123.575, -2.77439, 0.947999, 25.5941, -31.5731, 3.548, 1.721];

test('the camera puts the far horizon at eye level and first base to the right', () => {
  const far = S.project(0, 1e7, S.CAMERA.z);
  near(far.x, S.CAMERA.cx, 1e-6, 'center');
  near(far.y, S.CAMERA.hy, 1e-3, 'horizon');
  assert.ok(S.project(1, 20, 0).x > S.CAMERA.cx);
  near(S.project(0, 40 + S.CAMERA.y, 0).s, 2 * S.project(0, 80 + S.CAMERA.y, 0).s, 1e-9, 'scale halves when depth doubles');
});

test('a real tracked pitch crosses the plate where the tracking system says', () => {
  const t = S.plateTime(REAL);
  near(t, 0.4614, 0.002, 'flight time');
  near(S.pitchAt(REAL, t).x, -0.264756, 0.002, 'plate x');
  near(S.pitchAt(REAL, 0).y, 55, 1e-9, 'tracking start');
});

test('batted-ball presets fly like their names', () => {
  const hr = S.flight(S.battedPreset('HR', 'R', 0.5, 0.5));
  assert.ok(hr.distance >= 360, `HR distance ${hr.distance}`);
  const fb = S.flight(S.battedPreset('FB', 'L', 0.5, 0.5));
  assert.ok(fb.apex >= 60 && fb.distance > 200 && fb.distance < 340, `FB apex ${fb.apex} distance ${fb.distance}`);
  const gb = S.flight(S.battedPreset('GB', 'R', 0.5, 0.5));
  assert.ok(gb.apex <= 6 && gb.distance < 160, `GB apex ${gb.apex} distance ${gb.distance}`);
});

test('right-handed batters pull the ball to left field, lefties to right field', () => {
  assert.ok(S.battedPreset('HR', 'R', 0.5, 0.5).spray < 0);
  assert.ok(S.battedPreset('HR', 'L', 0.5, 0.5).spray > 0);
});

test('flight points run forward in time and start at the plate', () => {
  const path = S.flight(S.battedPreset('2B', 'R', 0.2, 0.8)).points;
  assert.ok(path.length > 5);
  near(Math.hypot(path[0].x, path[0].y), 0, 3, 'starts at home plate');
  for (let i = 1; i < path.length; i++) assert.ok(path[i].t > path[i - 1].t);
});

test('poses interpolate smoothly between keyframes', () => {
  const keys = [{ t: 0, j: { hand: [0, 0] } }, { t: 1, j: { hand: [2, 4] } }];
  assert.deepEqual(S.poseAt(keys, 0).hand, [0, 0]);
  assert.deepEqual(S.poseAt(keys, 1).hand, [2, 4]);
  assert.deepEqual(S.poseAt(keys, 0.5).hand, [1, 2]);
  assert.deepEqual(S.poseAt(keys, 7).hand, [2, 4]);
});
