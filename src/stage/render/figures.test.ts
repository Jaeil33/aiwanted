import { describe, expect, it } from 'vitest';
import {
  BAT,
  BATTER_X,
  CAMERA,
  FIELDERS,
  PITCHER_KEYS,
  PITCHER_SET,
  RELEASE_AT,
  W,
  poseAt,
  project,
  uniform,
} from '../math';
import { CHALK, batterKeys, drawBatter, drawFielders, drawPitcher, idleBatterPose, idlePitcherPose } from './figures';
import { createFakeContext } from './testing';

const HOME = uniform({ color: '#F0474B', home: true });
const AWAY = uniform({ color: '#5C8DF6', home: false });
const MOUND = project(0, 60.5, 0.83);

describe('drawPitcher', () => {
  it('우투는 던지는 손이 3루 쪽(화면 왼쪽)이고, 좌투는 좌우를 뒤집는다', () => {
    const pose = poseAt(PITCHER_KEYS, RELEASE_AT);
    const right = drawPitcher(createFakeContext().ctx, pose, { throws: 'R', uniform: AWAY, holding: true });
    const left = drawPitcher(createFakeContext().ctx, pose, { throws: 'L', uniform: AWAY, holding: true });
    expect(right.x).toBeCloseTo(MOUND.x + PITCHER_KEYS[3].j.haT[0] * MOUND.s, 9);
    expect(right.y).toBeCloseTo(MOUND.y - PITCHER_KEYS[3].j.haT[1] * MOUND.s, 9);
    expect(right.x).toBeLessThan(MOUND.x);
    expect(left.x).toBeGreaterThan(MOUND.x);
    expect(left.x - MOUND.x).toBeCloseTo(MOUND.x - right.x, 9);
  });

  it('공을 쥐고 있을 때만 손에 공을 그리고, 수비팀 유니폼 색을 입힌다', () => {
    const pose = poseAt(PITCHER_KEYS, 0);
    const holding = createFakeContext();
    const empty = createFakeContext();
    drawPitcher(holding.ctx, pose, { throws: 'R', uniform: AWAY, holding: true });
    drawPitcher(empty.ctx, pose, { throws: 'R', uniform: AWAY, holding: false });
    expect(holding.count('arc')).toBe(empty.count('arc') + 1);
    expect(holding.valuesOf('fillStyle')).toContain(CHALK);
    expect(empty.valuesOf('fillStyle')).not.toContain(CHALK);
    expect(holding.valuesOf('fillStyle')).toEqual(expect.arrayContaining([AWAY.jersey, AWAY.cap]));
    expect(holding.valuesOf('strokeStyle')).toEqual(expect.arrayContaining([AWAY.trim, AWAY.pants, AWAY.jersey]));
  });
});

describe('drawBatter', () => {
  it('우타는 3루 쪽 타석(−x), 좌타는 1루 쪽 타석(+x)에 선다', () => {
    const pose = idleBatterPose(0, true);
    const right = createFakeContext();
    const left = createFakeContext();
    drawBatter(right.ctx, pose, { bats: 'R', uniform: HOME });
    drawBatter(left.ctx, pose, { bats: 'L', uniform: HOME });
    const [rx] = right.argsOf('ellipse')[0] as number[];
    const [lx] = left.argsOf('ellipse')[0] as number[];
    expect(rx).toBeCloseTo(project(-BATTER_X, 0.3, 0).x, 9);
    expect(lx).toBeCloseTo(project(BATTER_X, 0.3, 0).x, 9);
    expect(rx).toBeLessThan(CAMERA.cx);
    expect(lx).toBeGreaterThan(CAMERA.cx);
  });

  it('공격팀 유니폼과 나무 배트를 그린다', () => {
    const fake = createFakeContext();
    drawBatter(fake.ctx, idleBatterPose(0, true), { bats: 'R', uniform: HOME });
    expect(fake.valuesOf('strokeStyle')).toEqual(expect.arrayContaining([HOME.pants, HOME.jersey, '#B48A57', '#C9A26B']));
    expect(fake.valuesOf('fillStyle')).toContain(HOME.cap);
  });
});

describe('drawFielders', () => {
  it('화면 안에 들어오는 수비수만, 먼 쪽부터 그린다', () => {
    const fake = createFakeContext();
    drawFielders(fake.ctx, FIELDERS, AWAY);
    const visible = FIELDERS.filter(([x, y]) => {
      const foot = project(x, y, 0);
      return foot.x >= -30 && foot.x <= W + 30;
    });
    expect(visible.length).toBeGreaterThan(0);
    expect(fake.count('arc')).toBe(visible.length);
    const farthest = [...visible].sort((a, b) => b[1] - a[1])[0];
    expect((fake.argsOf('moveTo')[0] as number[])[0]).toBeCloseTo(project(farthest[0], farthest[1], 0).x, 9);
    expect(fake.valuesOf('strokeStyle')).toContain(AWAY.jersey);
    expect(fake.valuesOf('fillStyle')).toContain(AWAY.cap);
  });

  it('화면 밖으로 멀리 벗어난 수비수는 건너뛴다', () => {
    const fake = createFakeContext();
    drawFielders(fake.ctx, [[0, 318], [5000, 100]], AWAY);
    expect(fake.count('arc')).toBe(1);
  });
});

describe('batterKeys', () => {
  const base = { bats: 'R' as const, relMs: 1254, plateMs: 2202, slow: 2.2, loc: { x: 0, z: 2.5 } };

  it('볼·루킹 스트라이크는 준비 → 하중 → 흘려보내기 → 준비 자세다', () => {
    for (const code of ['B', 'T'] as const) {
      const keys = batterKeys({ ...base, code });
      expect(keys.map((k) => k.t)).toEqual([0, 1254, 2202, 2902]);
      expect(keys.map((k) => k.j)).toEqual([BAT.stance, BAT.load, BAT.take, BAT.stance]);
    }
  });

  it('스윙(헛스윙·파울·타격)은 공이 홈에 오는 순간 배트가 공 쪽을 향한다', () => {
    const keys = batterKeys({ ...base, code: 'X' });
    expect(keys.map((k) => k.t)).toEqual([0, 1254, 2202 - 330 * 2.2, 2202, 2202 + 240, 2202 + 1100, 2202 + 1700]);
    expect(keys.map((k) => k.j.hip)).toEqual([BAT.stance.hip, BAT.load.hip, BAT.stride.hip, BAT.contact.hip, BAT.follow.hip, BAT.follow.hip, BAT.stance.hip]);
    const toBall = (Math.atan2(2.5 - 3.95, 0 - (-BATTER_X + 0.75)) * 180) / Math.PI;
    expect(keys[3].j.bat[0]).toBeCloseTo(toBall, 9);
    expect(batterKeys({ ...base, code: 'S' })[3].j.bat[0]).toBeCloseTo(toBall + 14, 9);
    expect(batterKeys({ ...base, bats: 'L', code: 'F' })[3].j.bat[0]).toBeCloseTo(toBall, 9);
  });

  it('스트라이드는 릴리스보다 늦게 시작한다', () => {
    const keys = batterKeys({ ...base, code: 'X', relMs: 532, plateMs: 600, slow: 1 });
    expect(keys[2].t).toBe(533);
  });
});

describe('대기 동작', () => {
  it('투수는 숨 쉬듯 위아래로 흔들리되 발은 땅에 붙어 있고, 동작 줄이기면 멈춘다', () => {
    const now = (700 * Math.PI) / 2;
    const pose = idlePitcherPose(now, false);
    expect(pose.head[1]).toBeCloseTo(PITCHER_SET.head[1] + 0.03, 9);
    expect(pose.ftT).toEqual([...PITCHER_SET.ftT]);
    expect(pose.ftG).toEqual([...PITCHER_SET.ftG]);
    expect(idlePitcherPose(now, true).head).toEqual([...PITCHER_SET.head]);
  });

  it('타자는 배트를 까딱이고, 동작 줄이기면 멈춘다', () => {
    const now = (420 * Math.PI) / 2;
    expect(idleBatterPose(now, false).bat[0]).toBeCloseTo(BAT.stance.bat[0] + 5, 9);
    expect(idleBatterPose(now, true).bat).toEqual([...BAT.stance.bat]);
  });
});
