import { describe, expect, it } from 'vitest';
import { PITCH_CODE_LABEL } from '../../domain/events';
import { CAMERA, FIELDERS, PLATE_Y, W, basePoint, project } from '../math';
import { INK } from './figures';
import {
  BANNER_OUT_MS,
  CALL_COLOR,
  CALL_MS,
  bannerDone,
  burst,
  callFor,
  drawBall,
  drawBanner,
  drawBoard,
  drawCall,
  drawMap,
  drawMitt,
  drawSparks,
  drawZone,
  runnerAt,
} from './overlay';
import type { MapView, Trail } from './overlay';
import { createFakeContext } from './testing';

const ZONE = { top: 3.4, bottom: 1.6 };

describe('drawZone', () => {
  it('홈플레이트 위 스트라이크 존 사각형을 돌려주고 3×3 칸을 긋는다', () => {
    const fake = createFakeContext();
    const rect = drawZone(fake.ctx, ZONE, [], 1);
    expect(rect.tl).toEqual(project(-0.83, PLATE_Y, 3.4));
    expect(rect.br).toEqual(project(0.83, PLATE_Y, 1.6));
    expect(fake.argsOf('strokeRect')).toEqual([[rect.tl.x, rect.tl.y, rect.br.x - rect.tl.x, rect.br.y - rect.tl.y]]);
    expect(fake.count('stroke')).toBe(2);
  });

  it('투구 위치마다 판정 색 원에 공 번호를 적는다', () => {
    const fake = createFakeContext();
    drawZone(fake.ctx, ZONE, [{ x: 0.2, z: 2.9, n: 1, code: 'B' }, { x: -0.5, z: 2.0, n: 2, code: 'S' }], 1.4);
    expect(fake.argsOf('fillText').map(([text]) => text)).toEqual(['1', '2']);
    expect(fake.valuesOf('fillStyle')).toEqual(expect.arrayContaining([CALL_COLOR.B, CALL_COLOR.S, INK]));
    const p = project(0.2, PLATE_Y, 2.9);
    expect(fake.argsOf('arc')[0].slice(0, 3)).toEqual([p.x, p.y, 9 * Math.min(1.4, 1.5)]);
  });
});

describe('drawBall', () => {
  it('카메라에 너무 가깝거나 뒤에 있는 공은 그리지 않는다', () => {
    const fake = createFakeContext();
    drawBall(fake.ctx, { x: 0, y: CAMERA.y + 1, z: 5 }, null, false);
    expect(fake.count('arc')).toBe(0);
  });

  it('그림자와 잔상(최대 9개)을 그리고, 동작 줄이기면 잔상을 끈다', () => {
    const trail: Trail = [];
    const fake = createFakeContext();
    for (let i = 0; i < 12; i++) drawBall(fake.ctx, { x: 0, y: 40 - i, z: 4 }, trail, false);
    expect(trail).toHaveLength(9);
    expect(fake.count('ellipse')).toBe(12);
    const calmTrail: Trail = [];
    const calm = createFakeContext();
    drawBall(calm.ctx, { x: 0, y: 40, z: 4 }, calmTrail, true);
    expect(calmTrail).toHaveLength(0);
    expect(calm.count('arc')).toBe(1);
  });

  it('가까이 온 큰 공에는 빨간 실밥을 그린다', () => {
    const near = createFakeContext();
    drawBall(near.ctx, { x: 0, y: -12, z: 6 }, null, false);
    expect(near.valuesOf('strokeStyle')).toContain('#D0453F');
    const far = createFakeContext();
    drawBall(far.ctx, { x: 0, y: 50, z: 6 }, null, false);
    expect(far.valuesOf('strokeStyle')).not.toContain('#D0453F');
  });
});

describe('drawMitt', () => {
  it('미트를 그리고, 공이 들어오면 공과 퍼지는 고리를 그린다', () => {
    const waiting = createFakeContext();
    drawMitt(waiting.ctx, { x: 0, z: 2.5 }, false, -60, false);
    expect(waiting.count('ellipse')).toBe(2);
    expect(waiting.count('arc')).toBe(0);
    const caught = createFakeContext();
    drawMitt(caught.ctx, { x: 0, z: 2.5 }, true, 50, false);
    expect(caught.count('arc')).toBe(2);
    const later = createFakeContext();
    drawMitt(later.ctx, { x: 0, z: 2.5 }, true, 300, false);
    expect(later.count('arc')).toBe(1);
    const calm = createFakeContext();
    drawMitt(calm.ctx, { x: 0, z: 2.5 }, true, 50, true);
    expect(calm.count('arc')).toBe(1);
  });

  it('공이 미트에 닿기 전(popAge < 0)에는 고리를 그리지 않아 반지름이 음수가 되지 않는다', () => {
    const fake = createFakeContext();
    drawMitt(fake.ctx, { x: 0, z: 2.5 }, false, -182, false);
    expect(fake.count('arc')).toBe(0);
  });
});

describe('runnerAt', () => {
  it('진루는 두 루 사이를 따라가고, 아웃(−1)은 반 루만 가다 사라진다', () => {
    expect(runnerAt({ from: 1, to: 2 }, 0.5)).toEqual({ q: 1.5, alpha: 1 });
    expect(runnerAt({ from: 0, to: 4 }, 1)).toEqual({ q: 4, alpha: 1 });
    expect(runnerAt({ from: 1, to: -1 }, 0.6)).toEqual({ q: 1.3, alpha: 1 });
    expect(runnerAt({ from: 1, to: -1 }, 0.8).alpha).toBeCloseTo(0.5, 9);
    expect(runnerAt({ from: 1, to: -1 }, 1)).toEqual({ q: 1.5, alpha: 0 });
  });
});

describe('drawMap', () => {
  const view = (over: Partial<MapView> = {}): MapView => ({
    fielders: FIELDERS,
    fielderColor: '#123456',
    runnerColor: '#F0474B',
    occupied: 0,
    runners: [],
    ball: null,
    ...over,
  });

  it('오른쪽 위에 미니 다이아몬드와 수비수 7명, 베이스 3개를 그린다', () => {
    const fake = createFakeContext();
    drawMap(fake.ctx, view(), 1);
    const [x0, y0, w, h] = fake.argsOf('fillRect')[0] as number[];
    expect([x0 + w, y0, w, h]).toEqual([W - 12, 12, 176, 150]);
    expect(fake.count('arc')).toBe(7);
    expect(fake.count('fillRect')).toBe(4);
  });

  it('주자가 있는 루는 공격팀 색이고, 움직이는 주자는 떠난 루를 비우고 주로 위에 그린다', () => {
    const still = createFakeContext();
    drawMap(still.ctx, view({ occupied: 0b101 }), 1);
    expect(still.valuesOf('fillStyle').filter((c) => c === '#F0474B')).toHaveLength(2);

    const moving = createFakeContext();
    drawMap(moving.ctx, view({ occupied: 0b101, runners: [{ from: 1, q: 1.5, alpha: 1 }] }), 1);
    expect(moving.valuesOf('fillStyle').filter((c) => c === '#F0474B')).toHaveLength(2);
    expect(moving.count('arc')).toBe(8);
    const [rx, ry] = moving.argsOf('arc')[7] as number[];
    const [bx, by] = basePoint(1.5);
    const hx = W - 12 - 176 / 2;
    const hy = 12 + 150 - 12;
    expect(rx).toBeCloseTo(hx + bx * 0.3, 9);
    expect(ry).toBeCloseTo(hy - by * 0.3, 9);
  });

  it('타구가 날면 홈에서 공까지 점선을 긋는다', () => {
    const fake = createFakeContext();
    drawMap(fake.ctx, view({ ball: { x: 0, y: 200 } }), 1);
    expect(fake.argsOf('setLineDash')).toEqual([[[3, 3]], [[]]]);
    expect(fake.count('arc')).toBe(8);
  });

  it('작은 화면(ui가 큼)에서는 최대 1.6배까지 키운다', () => {
    const fake = createFakeContext();
    drawMap(fake.ctx, view(), 2.2);
    const [, , w] = fake.argsOf('fillRect')[0] as number[];
    expect(w).toBeCloseTo(176 * 1.6, 9);
  });
});

describe('판정 태그', () => {
  it('callFor는 판정 이름과 색을 준다', () => {
    expect(CALL_COLOR).toEqual({ B: '#4FD37F', T: '#FFD34E', S: '#FFD34E', F: '#C9D2D8', X: '#EEF2E9' });
    for (const code of ['B', 'T', 'S', 'F', 'X'] as const) {
      expect(callFor(code, 10)).toEqual({ text: PITCH_CODE_LABEL[code], color: CALL_COLOR[code], start: 10 });
    }
  });

  it('존 오른쪽 위에 색 띠와 글자를 그리고, 950ms 뒤부터 흐려진다', () => {
    const zone = drawZone(createFakeContext().ctx, ZONE, [], 1);
    const fresh = createFakeContext();
    drawCall(fresh.ctx, callFor('T', 0), 100, zone, 1);
    expect(fresh.argsOf('fillText')).toEqual([['스트라이크', zone.br.x + 14 + 8, zone.tl.y + 12 + 1]]);
    expect(fresh.valuesOf('globalAlpha')).toEqual([1, 1]);
    const fading = createFakeContext();
    drawCall(fading.ctx, callFor('B', 0), 1125, zone, 1);
    expect(fading.valuesOf('globalAlpha')[0]).toBeCloseTo(0.5, 9);
    expect(CALL_MS).toBe(1300);
  });
});

describe('drawBanner', () => {
  it('들어오기 전(age < 0)이나 다 사라진 뒤에는 그리지 않는다', () => {
    const fake = createFakeContext();
    drawBanner(fake.ctx, { text: '삼진' }, -10, 1500, 1);
    drawBanner(fake.ctx, { text: '삼진' }, 1500 + BANNER_OUT_MS, 1500, 1);
    expect(fake.count('fillText')).toBe(0);
    expect(bannerDone(1500 + BANNER_OUT_MS, 1500)).toBe(true);
    expect(bannerDone(1500 + BANNER_OUT_MS - 1, 1500)).toBe(false);
  });

  it('가운데 띠에 큰 글씨와 설명을 쓰고, big 톤은 LED 색 띠를 쓴다', () => {
    const normal = createFakeContext();
    drawBanner(normal.ctx, { text: '밀어내기 볼넷', sub: 'KIA 4 : 5 롯데' }, 600, 1500, 1);
    expect(normal.argsOf('fillText').map(([text]) => text)).toEqual(['밀어내기 볼넷', 'KIA 4 : 5 롯데']);
    expect(normal.argsOf('strokeText').map(([text]) => text)).toEqual(['밀어내기 볼넷']);
    expect((normal.argsOf('fillText')[0] as [string, number])[1]).toBe(W / 2);
    expect(normal.argsOf('addColorStop').map(([, color]) => color)).toEqual([
      'rgba(6, 13, 21, 0)',
      'rgba(6, 13, 21, 0.88)',
      'rgba(6, 13, 21, 0)',
    ]);
    const big = createFakeContext();
    drawBanner(big.ctx, { text: '끝내기 만루 홈런!', tone: 'big' }, 600, 1500, 1);
    expect(big.valuesOf('fillStyle')).toContain('#FFF7E6');
    expect(big.argsOf('addColorStop')[1][1]).toBe('rgba(255, 181, 71, 0.88)');
  });

  it('들어오는 동안 반투명하게 왼쪽에서 밀려 들어온다', () => {
    const fake = createFakeContext();
    drawBanner(fake.ctx, { text: '홈런' }, 120, 1500, 1);
    expect((fake.argsOf('fillText')[0] as [string, number])[1]).toBeLessThan(W / 2);
    expect(fake.valuesOf('globalAlpha')[0]).toBeCloseTo(0.5, 9);
  });
});

describe('불꽃', () => {
  it('burst는 받은 난수로 네 가지 색 불꽃 48개를 만든다', () => {
    let i = 0;
    const random = () => ((i++ % 10) + 0.5) / 10;
    const sparks = burst(100, 50, 1000, random);
    expect(sparks).toHaveLength(48);
    expect(new Set(sparks.map((s) => s.color))).toEqual(new Set(['#FFB547', '#FFF4D6', '#FF5C50', '#4FD37F']));
    expect(sparks.every((s) => s.start === 1000 && s.x === 100 && s.y === 50)).toBe(true);
  });

  it('drawSparks는 중력을 받아 떨어뜨리며 흐리게 그린다', () => {
    const sparks = burst(100, 50, 1000, () => 0.25);
    const fake = createFakeContext();
    drawSparks(fake.ctx, sparks, 1500);
    expect(fake.count('fillRect')).toBe(48);
    const [x, y] = fake.argsOf('fillRect')[0] as number[];
    expect(x).toBeCloseTo(100 + sparks[0].vx * 0.5, 9);
    expect(y).toBeCloseTo(50 + sparks[0].vy * 0.5 + 90 * 0.25, 9);
    expect(fake.valuesOf('globalAlpha')[0]).toBeCloseTo(1 - 0.5 / 1.3, 9);
    expect(fake.valuesOf('globalAlpha').at(-1)).toBe(1);
  });
});

describe('drawBoard', () => {
  it('전광판 두 줄을 LED 색 글자로 쓴다', () => {
    const fake = createFakeContext();
    drawBoard(fake.ctx, ['4 : 4', 'B1 S2 O2']);
    expect(fake.argsOf('fillText')).toEqual([['4 : 4', 480, 81], ['B1 S2 O2', 480, 103]]);
    expect(fake.ctx.fillStyle).toBe('#FFB547');
  });
});
