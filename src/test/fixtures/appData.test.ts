import { describe, expect, it } from 'vitest';
import { MEASURED } from '../../domain/measured';
import type { PitchRow } from '../../types/data';
import { AP_ROWS, HP_ROWS, fixtureAppData, fixtureSituation } from './appData';

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

describe('fixtureAppData', () => {
  const { core, pitches, evidence, trust } = fixtureAppData;
  const scene = fixtureSituation;

  it('리그 타석 결과 비율은 길이 7이고 합이 1', () => {
    expect(core.league).toHaveLength(7);
    expect(Math.abs(sum(core.league) - 1)).toBeLessThan(1e-9);
  });

  it('카운트 표는 12행 × 5열이고 행 합이 1', () => {
    expect(core.countTable).toHaveLength(12);
    for (const row of core.countTable) {
      expect(row).toHaveLength(5);
      expect(Math.abs(sum(row) - 1)).toBeLessThan(1e-9);
    }
  });

  it('선수는 합성 이름이고 능력치는 길이 7', () => {
    for (const [id, player] of Object.entries(core.players)) {
      expect(player.id).toBe(id);
      expect(player.name).toMatch(/^(원정|홈)(타자\d|투수)$/);
      expect(player.rel).toHaveLength(7);
    }
  });

  it('불펜은 HT-pen, LT-pen이고 능력치는 1 벡터', () => {
    expect(Object.keys(core.bullpens).sort()).toEqual(['HT', 'LT']);
    for (const [code, pen] of Object.entries(core.bullpens)) {
      expect(pen.team).toBe(code);
      expect(pen.id).toBe(`${code}-pen`);
      expect(pen.rel).toEqual([1, 1, 1, 1, 1, 1, 1]);
    }
  });

  it('상황은 9회말 2사 만루 동점, h6 대 ap, 실제 결과 만루 홈런', () => {
    expect(scene.kind).toBe('past');
    expect(scene.state).toMatchObject({ inning: 9, half: 1, outs: 2, bases: 7, away: 4, home: 4 });
    expect(scene.batter).toBe('h6');
    expect(scene.pitcher).toBe('ap');
    expect(scene.lineups.home[scene.state.slotHome]).toBe('h6');
    expect(scene.actual).toMatchObject({ event: 2, runs: 4, wpAfterHome: 1 });
    expect(scene.context).toEqual({ tempC: 27.5, windMs: 2.1, dayGame: false, dome: false });
  });

  it('장면의 라인업·타자·투수 id가 players에 있다', () => {
    expect(scene.lineups.away).toHaveLength(9);
    expect(scene.lineups.home).toHaveLength(9);
    for (const id of [...scene.lineups.away, ...scene.lineups.home, scene.batter]) {
      expect(core.players[id]?.kind, id).toBe('H');
    }
    expect(core.players[scene.pitcher]?.kind).toBe('P');
    expect(core.players.ap?.throws).toBe('R');
    expect(core.players.hp?.throws).toBe('L');
  });

  it('투구 표본이 10개 이상이고 code 0~4와 좌·우타가 모두 있다', () => {
    const rows = AP_ROWS;
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(new Set(rows.map((r) => r[2]))).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(new Set(rows.map((r) => r[5]))).toEqual(new Set([0, 1]));
    expect(pitches.pools.L.length).toBeGreaterThan(0);
    expect(pitches.pools.R.length).toBeGreaterThan(0);
  });

  it('모든 PitchRow는 길이 16이고 구종·카운트가 범위 안에 있다', () => {
    const rows: PitchRow[] = [
      ...AP_ROWS,
      ...HP_ROWS,
      ...pitches.pools.L,
      ...pitches.pools.R,
      ...(scene.actual?.pitches ?? []),
    ];
    for (const row of rows) {
      expect(row).toHaveLength(16);
      expect(row[0]).toBeLessThan(pitches.pitchTypes.length);
      expect(row[3]).toBeLessThanOrEqual(3);
      expect(row[4]).toBeLessThanOrEqual(2);
    }
  });

  it('evidence id는 MEASURED에 있다', () => {
    const ids = new Set(MEASURED.map((d) => d.id));
    const items = evidence?.items ?? [];
    expect(items.map((i) => [i.id, i.verdict])).toEqual([
      ['temp_c', 'maybe'],
      ['day_game', 'useless'],
    ]);
    for (const item of items) expect(ids.has(item.id)).toBe(true);
    expect(trust).not.toBeNull();
  });
});
