import { describe, expect, it } from 'vitest';
import type { MeasuredDef, MeasuredId } from '../types/domain';
import { MEASURED, measuredById, parseMeasured, transformValue } from './measured';
import measuredJson from './measured.json';

const IDS: MeasuredId[] = [
  'temp_c', 'wind_ms', 'rain_pre3h', 'day_game', 'weekend',
  'travel_km', 'after_off_day', 'starter_short_rest', 'starter_long_rest', 'home',
];

/** measured.json을 복사해 index번째 항목에 patch를 덮어쓴다 */
function withEntry(index: number, patch: Record<string, unknown>): unknown {
  const copy = JSON.parse(JSON.stringify(measuredJson)) as Record<string, unknown>[];
  copy[index] = { ...copy[index], ...patch };
  return copy;
}

describe('MEASURED', () => {
  it('measured.json의 실측 변수 10개를 그대로 내보낸다', () => {
    expect(MEASURED.map((d) => d.id)).toEqual(IDS);
    expect(MEASURED).toEqual(measuredJson);
  });

  it('applicable === false는 home 하나다', () => {
    expect(MEASURED.filter((d) => !d.applicable).map((d) => d.id)).toEqual(['home']);
  });
});

describe('measuredById', () => {
  it('id로 정의를 찾는다', () => {
    for (const id of IDS) expect(measuredById(id).id).toBe(id);
    expect(measuredById('wind_ms').perLabel).toBe('바람이 5m/s 강해질 때');
    expect(measuredById('starter_short_rest').who).toBe('opponentStarter');
  });
});

describe('transformValue', () => {
  it('linear는 min·max로 자른 뒤 (v - center) / per', () => {
    const temp = measuredById('temp_c');
    expect(transformValue(temp, 30)).toBe(1);
    expect(transformValue(temp, 50)).toBe(2);
    expect(transformValue(temp, -20)).toBe(-3);
    expect(transformValue(temp, 20)).toBe(0);
    expect(transformValue(measuredById('wind_ms'), -3)).toBe(0);
    expect(transformValue(measuredById('travel_km'), 600)).toBe(1.5);
  });

  it('indicator는 0이 아니면 1, 0이면 0', () => {
    const day = measuredById('day_game');
    expect(transformValue(day, 5)).toBe(1);
    expect(transformValue(day, -1)).toBe(1);
    expect(transformValue(day, 0)).toBe(0);
  });

  it('min·max가 없는 linear는 자르지 않는다', () => {
    const def: MeasuredDef = { ...measuredById('temp_c'), transform: { kind: 'linear', center: 0, per: 2 } };
    expect(transformValue(def, 10)).toBe(5);
    expect(transformValue(def, -10)).toBe(-5);
  });
});

describe('parseMeasured', () => {
  it('올바른 정의는 그대로 통과한다', () => {
    expect(parseMeasured(measuredJson)).toEqual(measuredJson);
  });

  it.each([
    ['배열이 아님', { temp_c: {} }],
    ['항목이 객체가 아님', ['temp_c']],
    ['알 수 없는 id', withEntry(0, { id: 'humidity' })],
    ['id 중복', withEntry(1, { id: 'temp_c' })],
    ['id 누락', (JSON.parse(JSON.stringify(measuredJson)) as unknown[]).slice(0, 9)],
    ['빈 label', withEntry(0, { label: '' })],
    ['unit이 문자열이 아님', withEntry(0, { unit: 3 })],
    ['who가 틀림', withEntry(0, { who: 'batter' })],
    ['빈 perLabel', withEntry(0, { perLabel: '' })],
    ['applicable이 불리언이 아님', withEntry(0, { applicable: 'yes' })],
    ['examples에 문자열이 아닌 값', withEntry(0, { examples: ['더워', 1] })],
    ['transform이 없음', withEntry(0, { transform: undefined })],
    ['알 수 없는 transform', withEntry(0, { transform: { kind: 'log' } })],
    ['linear center 없음', withEntry(0, { transform: { kind: 'linear', per: 10 } })],
    ['linear per가 0', withEntry(0, { transform: { kind: 'linear', center: 20, per: 0 } })],
    ['linear min이 숫자가 아님', withEntry(0, { transform: { kind: 'linear', center: 20, per: 10, min: '-10' } })],
    ['linear min > max', withEntry(0, { transform: { kind: 'linear', center: 20, per: 10, min: 40, max: -10 } })],
  ])('형식이 틀리면 throw: %s', (_label, input) => {
    expect(() => parseMeasured(input)).toThrow(/measured\.json/);
  });
});
