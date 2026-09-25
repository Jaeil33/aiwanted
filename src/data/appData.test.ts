import { describe, expect, it } from 'vitest';
import { fixtureAppData } from '../test/fixtures/appData';
import type { PitchRow } from '../types/data';
import { APP_DATA, hitterOf, loadAppData, pitcherOf, todaySceneIndex } from './appData';

const DIR = '../../data/build/app';
const { core, pitches, scenes, evidence, trust } = fixtureAppData;

/** import.meta.glob 결과 모양의 파일 레코드 (테스트는 합성 픽스처만 쓴다) */
function files(over: Record<string, unknown> = {}, drop: string[] = []): Record<string, unknown> {
  const all: Record<string, unknown> = {
    [`${DIR}/core.json`]: core,
    [`${DIR}/pitches.json`]: pitches,
    [`${DIR}/scenes.json`]: scenes,
    [`${DIR}/evidence.json`]: evidence,
    [`${DIR}/trust.json`]: trust,
  };
  for (const [name, value] of Object.entries(over)) all[`${DIR}/${name}`] = value;
  for (const name of drop) delete all[`${DIR}/${name}`];
  return all;
}

const clone = <T>(x: T): T => structuredClone(x);
const loose = (x: unknown) => x as Record<string, unknown>;

describe('loadAppData', () => {
  it('core·pitches·scenes·evidence·trust가 모두 있으면 AppData를 돌려준다', () => {
    expect(loadAppData(files())).toEqual(fixtureAppData);
  });

  it('경로 앞부분과 상관없이 파일 이름으로 찾는다', () => {
    const record = Object.fromEntries(Object.entries(files()).map(([path, value]) => [path.replace(DIR, '/data/build/app'), value]));
    expect(loadAppData(record)).toEqual(fixtureAppData);
    expect(loadAppData({ ...files({}, ['core.json']), '/somewhere/else/core.json.bak': core })).toBeNull();
  });

  it('필수 파일(core·pitches·scenes)이 하나라도 없으면 null', () => {
    for (const name of ['core.json', 'pitches.json', 'scenes.json']) {
      expect(loadAppData(files({}, [name])), name).toBeNull();
    }
    expect(loadAppData({})).toBeNull();
  });

  it('선택 파일(evidence·trust)이 없으면 그 필드만 null', () => {
    expect(loadAppData(files({}, ['evidence.json']))).toEqual({ ...fixtureAppData, evidence: null });
    expect(loadAppData(files({}, ['trust.json']))).toEqual({ ...fixtureAppData, trust: null });
    expect(loadAppData(files({}, ['evidence.json', 'trust.json']))).toEqual({ ...fixtureAppData, evidence: null, trust: null });
  });

  it('필수 파일 모양이 틀리면 null', () => {
    const shortLeague = clone(core);
    shortLeague.league = shortLeague.league.slice(0, 6);
    const shortTable = clone(core);
    shortTable.countTable = shortTable.countTable.slice(0, 11);
    const badRel = clone(core);
    badRel.players.h6.rel = [1, 1, 1, 1, 1, 1];
    const noPoolR = { ...clone(pitches), pools: { L: pitches.pools.L } };
    const shortRow = clone(pitches);
    shortRow.byPitcher.ap[0] = shortRow.byPitcher.ap[0].slice(0, 15) as unknown as PitchRow;
    const shortLineup = clone(scenes);
    shortLineup[0].lineups.home = shortLineup[0].lineups.home.slice(0, 8);
    const badOuts = clone(scenes);
    loose(badOuts[0].state).outs = 'two';
    const lateInning = clone(scenes);
    lateInning[0].state.inning = 12;
    const badTemp = clone(scenes);
    loose(badTemp[0].context).tempC = 'hot';
    const noActual = clone(scenes);
    delete loose(noActual[0]).actual;

    const cases: Array<[string, Record<string, unknown>]> = [
      ['리그 분포 길이 6', { 'core.json': shortLeague }],
      ['카운트 표 11행', { 'core.json': shortTable }],
      ['선수 rel 길이 6', { 'core.json': badRel }],
      ['core가 배열', { 'core.json': [] }],
      ['우투 리그 표본 없음', { 'pitches.json': noPoolR }],
      ['투구 행 15칸', { 'pitches.json': shortRow }],
      ['장면이 배열이 아님', { 'scenes.json': { 0: scenes[0] } }],
      ['장면이 비어 있음', { 'scenes.json': [] }],
      ['타선 8명', { 'scenes.json': shortLineup }],
      ['아웃이 문자열', { 'scenes.json': badOuts }],
      ['엔진이 못 받는 12회', { 'scenes.json': lateInning }],
      ['기온이 문자열', { 'scenes.json': badTemp }],
      ['실제 결과 없음', { 'scenes.json': noActual }],
    ];
    for (const [label, over] of cases) expect(loadAppData(files(over)), label).toBeNull();
  });

  it('돔 구장처럼 날씨가 null인 장면은 받는다', () => {
    const dome = clone(scenes);
    dome[0].context = { tempC: null, windMs: null, dayGame: true, dome: true };
    expect(loadAppData(files({ 'scenes.json': dome }))?.scenes[0].context.dome).toBe(true);
  });

  it('선택 파일 모양이 틀리면 그 필드만 null', () => {
    expect(loadAppData(files({ 'evidence.json': { items: 'x' } }))).toEqual({ ...fixtureAppData, evidence: null });
    expect(loadAppData(files({ 'trust.json': 42 }))).toEqual({ ...fixtureAppData, trust: null });
  });
});

describe('todaySceneIndex', () => {
  it('2026-01-01부터 지난 날 수를 장면 수로 나눈 나머지', () => {
    const cases: Array<[string, number, number]> = [
      ['2026-01-01', 16, 0],
      ['2026-01-02', 16, 1],
      ['2026-01-17', 16, 0],
      ['2026-03-01', 7, 3],
      ['2026-09-14', 16, 0],
      ['2026-09-15', 16, 1],
      ['2026-09-14', 1, 0],
    ];
    for (const [date, count, index] of cases) expect(todaySceneIndex(date, count), `${date} / ${count}`).toBe(index);
  });

  it('2026년 이전 날짜도 음수가 아니다', () => {
    expect(todaySceneIndex('2025-12-31', 16)).toBe(15);
    expect(todaySceneIndex('2024-02-29', 16)).toBeGreaterThanOrEqual(0);
    expect(todaySceneIndex('2024-02-29', 16)).toBeLessThan(16);
  });

  it('장면 수가 양의 정수가 아니거나 날짜 형식이 틀리면 0', () => {
    expect(todaySceneIndex('2026-09-14', 0)).toBe(0);
    expect(todaySceneIndex('2026-09-14', -3)).toBe(0);
    expect(todaySceneIndex('2026-09-14', 2.5)).toBe(0);
    expect(todaySceneIndex('not-a-date', 16)).toBe(0);
    expect(todaySceneIndex('2026-13-01', 16)).toBe(0);
    expect(todaySceneIndex('2026-02-30', 16)).toBe(0);
  });
});

describe('APP_DATA', () => {
  it('빌드에 넣은 앱 데이터이거나, 파일이 없으면 null이다 (내용에는 기대지 않는다)', () => {
    expect(APP_DATA === null || (Array.isArray(APP_DATA.scenes) && APP_DATA.scenes.length > 0)).toBe(true);
  });
});

// 19-season step 0: 겸업 선수 조회 (ADR-035)
describe('hitterOf·pitcherOf', () => {
  /** 같은 id가 타자·투수 둘 다인 합성 core */
  function dualCore() {
    const c = clone(core);
    const pitcher = { id: 'x9', name: '정선수', team: 'HT', kind: 'P', throws: 'R', rel: [1, 1, 1, 1, 1, 1, 1], line: {} };
    const hitter = { id: 'x9', name: '정선수', team: 'HT', kind: 'H', bats: 'R', rel: [2, 2, 2, 2, 2, 2, 2], line: {} };
    loose(c).players = { ...(loose(c).players as object), x9: pitcher, 'x9:H': hitter };
    return c;
  }

  it('`:H` 키가 있으면 타자 레코드를 돌려준다', () => {
    const c = dualCore();
    expect(hitterOf(c, 'x9')?.kind).toBe('H');
    expect(hitterOf(c, 'x9')?.rel[0]).toBe(2);
  });

  it('투수는 언제나 꼬리 없는 id다', () => {
    const c = dualCore();
    expect(pitcherOf(c, 'x9')?.kind).toBe('P');
    expect(pitcherOf(c, 'x9')?.rel[0]).toBe(1);
  });

  it('겸업이 아니면 타자도 꼬리 없는 id로 찾는다', () => {
    const players = loose(core).players as Record<string, { kind: string }>;
    const id = Object.keys(players).find((k) => !k.includes(':') && players[k].kind === 'H')!;
    expect(hitterOf(core, id)?.id).toBe(id);
  });

  it('없는 선수는 null', () => {
    expect(hitterOf(core, '없는id')).toBeNull();
    expect(pitcherOf(core, '없는id')).toBeNull();
  });

  it('`:H` 키가 들어 있어도 core 검증을 통과한다', () => {
    expect(loadAppData(files({ 'core.json': dualCore() }))).not.toBeNull();
  });
});
