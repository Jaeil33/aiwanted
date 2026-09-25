import { describe, expect, it } from 'vitest';
import { fixtureAppData } from '../test/fixtures/appData';
import type { PitchRow } from '../types/data';
import { nameMapOf } from '../domain/players';
import { APP_DATA, hitterOf, loadAppData, pitcherOf } from './appData';

const DIR = '../../data/build/app';
const { core, pitches, evidence, trust } = fixtureAppData;

/** import.meta.glob 결과 모양의 파일 레코드 (테스트는 합성 픽스처만 쓴다) */
function files(over: Record<string, unknown> = {}, drop: string[] = []): Record<string, unknown> {
  const all: Record<string, unknown> = {
    [`${DIR}/core.json`]: core,
    [`${DIR}/pitches.json`]: pitches,
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
  it('core·pitches·evidence·trust가 모두 있으면 AppData를 돌려준다', () => {
    expect(loadAppData(files())).toEqual(fixtureAppData);
  });

  it('경로 앞부분과 상관없이 파일 이름으로 찾는다', () => {
    const record = Object.fromEntries(Object.entries(files()).map(([path, value]) => [path.replace(DIR, '/data/build/app'), value]));
    expect(loadAppData(record)).toEqual(fixtureAppData);
    expect(loadAppData({ ...files({}, ['core.json']), '/somewhere/else/core.json.bak': core })).toBeNull();
  });

  it('필수 파일(core·pitches)이 하나라도 없으면 null', () => {
    for (const name of ['core.json', 'pitches.json']) {
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
    shortRow.pools.R[0] = shortRow.pools.R[0].slice(0, 15) as unknown as PitchRow;

    const cases: Array<[string, Record<string, unknown>]> = [
      ['리그 분포 길이 6', { 'core.json': shortLeague }],
      ['카운트 표 11행', { 'core.json': shortTable }],
      ['선수 rel 길이 6', { 'core.json': badRel }],
      ['core가 배열', { 'core.json': [] }],
      ['우투 리그 표본 없음', { 'pitches.json': noPoolR }],
      ['투구 행 15칸', { 'pitches.json': shortRow }],
    ];
    for (const [label, over] of cases) expect(loadAppData(files(over)), label).toBeNull();
  });

  it('선택 파일 모양이 틀리면 그 필드만 null', () => {
    expect(loadAppData(files({ 'evidence.json': { items: 'x' } }))).toEqual({ ...fixtureAppData, evidence: null });
    expect(loadAppData(files({ 'trust.json': 42 }))).toEqual({ ...fixtureAppData, trust: null });
  });
});

describe('APP_DATA', () => {
  it('빌드에 넣은 앱 데이터이거나, 파일이 없으면 null이다 (내용에는 기대지 않는다)', () => {
    expect(APP_DATA === null || Object.keys(APP_DATA.core.players).length > 0).toBe(true);
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

  it('nameMapOf는 겸업 키를 꼬리 없는 id에 합치고 투수 이름도 담는다', () => {
    // 중계(LiveGame.names)에는 타석에 선 선수만 있어 투수 이름이 없다. 목록 화면은 이 표로 채운다
    const names = nameMapOf(dualCore());
    expect(names.x9).toBe('정선수');
    expect(names['x9:H']).toBeUndefined();
    const pitcherId = Object.keys(loose(core).players as Record<string, { kind: string }>).find(
      (k) => (loose(core).players as Record<string, { kind: string }>)[k].kind === 'P',
    )!;
    expect(names[pitcherId]).toBeTruthy();
  });

  it('nameMapOf는 같은 core면 같은 표를 돌려준다', () => {
    expect(nameMapOf(core)).toBe(nameMapOf(core));
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
