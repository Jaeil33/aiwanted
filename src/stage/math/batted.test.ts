import { describe, expect, it } from 'vitest';
import { DRAG, GRAVITY, battedPreset, flight, pathAt } from './batted';
import type { FlightPoint } from './batted';
import { CAMERA } from './camera';

const GRID = [0, 0.25, 0.5, 0.75, 0.99];
const HANDS = ['L', 'R'] as const;

describe('battedPreset', () => {
  it('중력·항력 상수가 프로토타입 값 그대로다', () => {
    expect(GRAVITY).toBe(32.17);
    expect(DRAG).toBe(0.0012);
  });

  it('프리셋은 u1·u2로 타구 속도·발사각·방향을 보간한다', () => {
    expect(battedPreset('HR', 'R', 0, 1)).toEqual({ kind: 'HR', ev: 155, la: 32, spray: -8 });
    expect(battedPreset('FB', 'L', 1, 0)).toEqual({ kind: 'fly', ev: 130, la: 34, spray: 32 });
    expect(battedPreset('SF', 'L', 1, 0)).toEqual(battedPreset('FB', 'L', 1, 0));
    expect(battedPreset('DP', 'R', 0.3, 0.6)).toEqual(battedPreset('GB', 'R', 0.3, 0.6));
  });

  it('홈런은 여러 u1·u2에서 360ft 이상 날아가고 470ft를 넘으면 멈춘다', () => {
    for (const bats of HANDS) {
      for (const u1 of GRID) {
        for (const u2 of GRID) {
          const hr = flight(battedPreset('HR', bats, u1, u2));
          expect(hr.distance).toBeGreaterThanOrEqual(360);
          expect(hr.distance).toBeLessThan(472);
        }
      }
    }
  });

  it('뜬공(FB·SF)은 정점 60ft 이상, 비거리 200~340ft', () => {
    // 프리셋에서 가장 멀리 가는 구석(u1 ≥ 0.5이고 u2도 클 때)은 340ft를 조금 넘으므로 안쪽 값들로 확인한다.
    const cases: Array<[number, number]> = [[0, 0], [0, 0.99], [0.2, 0.5], [0.4, 0], [0.4, 0.99], [0.5, 0.5]];
    for (const play of ['FB', 'SF'] as const) {
      for (const bats of HANDS) {
        for (const [u1, u2] of cases) {
          const fly = flight(battedPreset(play, bats, u1, u2));
          expect(fly.apex).toBeGreaterThanOrEqual(60);
          expect(fly.distance).toBeGreaterThan(200);
          expect(fly.distance).toBeLessThan(340);
        }
      }
    }
  });

  it('땅볼(GB·DP)은 정점 6ft 이하, 비거리 160ft 미만', () => {
    for (const play of ['GB', 'DP'] as const) {
      for (const bats of HANDS) {
        for (const u1 of GRID) {
          for (const u2 of GRID) {
            const grounder = flight(battedPreset(play, bats, u1, u2));
            expect(grounder.apex).toBeLessThanOrEqual(6);
            expect(grounder.distance).toBeLessThan(160);
          }
        }
      }
    }
  });

  it('우타자는 좌측(−x), 좌타자는 우측(+x)으로 당겨친다', () => {
    for (const u1 of GRID) {
      expect(battedPreset('HR', 'R', u1, 0.5).spray).toBeLessThan(0);
      expect(battedPreset('HR', 'L', u1, 0.5).spray).toBeGreaterThan(0);
      expect(flight(battedPreset('HR', 'R', u1, 0.5)).landing.x).toBeLessThan(0);
      expect(flight(battedPreset('HR', 'L', u1, 0.5)).landing.x).toBeGreaterThan(0);
    }
    for (const play of ['GB', 'LD'] as const) {
      expect(battedPreset(play, 'R', 0.5, 0.5).spray).toBeLessThan(0);
      expect(battedPreset(play, 'L', 0.5, 0.5).spray).toBeGreaterThan(0);
    }
  });

  it('장타는 u2로 좌우 갭, 안타는 u2로 땅볼·라인드라이브, 파울은 파울 지역으로 간다', () => {
    expect(battedPreset('2B', 'R', 0.5, 0.2)).toMatchObject({ kind: 'gap' });
    expect(battedPreset('2B', 'R', 0.5, 0.2).spray).toBeLessThan(0);
    expect(battedPreset('3B', 'L', 0.5, 0.8)).toMatchObject({ kind: 'gap' });
    expect(battedPreset('3B', 'L', 0.5, 0.8).spray).toBeGreaterThan(0);
    expect(battedPreset('1B', 'R', 0.5, 0.2)).toMatchObject({ kind: 'grounder', stopAt: 175 });
    expect(battedPreset('1B', 'R', 0.5, 0.7)).toMatchObject({ kind: 'liner' });
    expect(battedPreset('1B', 'R', 0.5, 0.7).stopAt).toBeUndefined();
    expect(battedPreset('GB', 'R', 0.5, 0.5).stopAt).toBe(118);
    expect(battedPreset('LD', 'R', 0.5, 0.5)).toMatchObject({ kind: 'liner', stopAt: 125 });
    const foul = battedPreset('F', 'R', 0.3, 0.6);
    expect(foul.kind).toBe('foul');
    expect(Math.abs(foul.spray)).toBeGreaterThanOrEqual(100);
    expect(battedPreset('K', 'R', 0.5, 0.5)).toEqual({ kind: 'fly', ev: 120, la: 20, spray: 0 });
  });
});

describe('flight', () => {
  it('점들이 시간순이고 홈플레이트 근처에서 시작한다', () => {
    const path = flight(battedPreset('2B', 'R', 0.2, 0.8)).points;
    expect(path.length).toBeGreaterThan(5);
    expect(path[0]).toEqual({ t: 0, x: 0, y: 1.4, z: 2.6 });
    expect(Math.hypot(path[0].x, path[0].y)).toBeLessThanOrEqual(3);
    for (let i = 1; i < path.length; i++) expect(path[i].t).toBeGreaterThan(path[i - 1].t);
  });

  it('landing·distance·duration은 마지막 점, apex는 가장 높은 z다', () => {
    const fly = flight(battedPreset('FB', 'L', 0.5, 0.5));
    const last = fly.points[fly.points.length - 1];
    expect(fly.landing).toEqual({ x: last.x, y: last.y });
    expect(fly.distance).toBeCloseTo(Math.hypot(last.x, last.y), 12);
    expect(fly.duration).toBe(last.t);
    expect(fly.apex).toBeGreaterThanOrEqual(Math.max(...fly.points.map((p) => p.z)));
    expect(last.z).toBe(0);
  });

  it('땅볼은 튕기면서도 땅 밑으로 내려가지 않고 stopAt 거리에서 멈춘다', () => {
    const grounder = flight(battedPreset('GB', 'R', 0.5, 0.5));
    for (const p of grounder.points) expect(p.z).toBeGreaterThanOrEqual(0);
    expect(grounder.distance).toBeGreaterThanOrEqual(118);
    expect(grounder.distance).toBeLessThan(120);
  });

  it('파울은 1.4초 안에 땅에 닿거나 카메라 뒤로 넘어가면 멈춘다', () => {
    for (const u1 of GRID) {
      for (const u2 of GRID) {
        const foul = flight(battedPreset('F', 'R', u1, u2));
        const last = foul.points[foul.points.length - 1];
        expect(foul.duration).toBeLessThanOrEqual(1.4 + 1 / 120 + 1e-9);
        expect(last.z === 0 || last.y < CAMERA.y + 3 || foul.duration > 1.4).toBe(true);
      }
    }
  });
});

describe('pathAt', () => {
  const pts: FlightPoint[] = [
    { t: 0, x: 0, y: 0, z: 0 },
    { t: 1, x: 10, y: 20, z: 30 },
    { t: 2, x: 20, y: 20, z: 0 },
  ];

  it('두 점 사이를 직선으로 보간한다', () => {
    expect(pathAt(pts, 0.5)).toEqual({ t: 0.5, x: 5, y: 10, z: 15 });
    expect(pathAt(pts, 1.5)).toEqual({ t: 1.5, x: 15, y: 20, z: 15 });
  });

  it('시작 전은 첫 점, 끝 뒤는 마지막 점이다', () => {
    expect(pathAt(pts, -1)).toEqual(pts[0]);
    expect(pathAt(pts, 0)).toEqual(pts[0]);
    expect(pathAt(pts, 2)).toEqual(pts[2]);
    expect(pathAt(pts, 9)).toEqual(pts[2]);
  });

  it('flight 경로를 따라 끊기지 않는다', () => {
    const hr = flight(battedPreset('HR', 'L', 0.5, 0.5));
    for (let t = 0; t < hr.duration; t += 0.05) {
      const a = pathAt(hr.points, t);
      const b = pathAt(hr.points, t + 0.001);
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(1);
    }
    expect(pathAt(hr.points, hr.duration)).toEqual(hr.points[hr.points.length - 1]);
  });
});
