import type { MeasuredDef, MeasuredId, MeasuredTransform, MeasuredWho } from '../types/domain.js';
import measuredJson from './measured.json' with { type: 'json' };

type LinearTransform = Extract<MeasuredTransform, { kind: 'linear' }>;

const MEASURED_IDS: readonly MeasuredId[] = [
  'temp_c', 'wind_ms', 'rain_pre3h', 'day_game', 'weekend',
  'travel_km', 'after_off_day', 'starter_short_rest', 'starter_long_rest', 'home',
];
const MEASURED_WHOS: readonly MeasuredWho[] = ['env', 'team', 'opponentStarter'];

function invalid(message: string): never {
  throw new Error(`measured.json 형식 오류: ${message}`);
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x !== '';
}

function isMeasuredId(x: unknown): x is MeasuredId {
  return typeof x === 'string' && (MEASURED_IDS as readonly string[]).includes(x);
}

function isMeasuredWho(x: unknown): x is MeasuredWho {
  return typeof x === 'string' && (MEASURED_WHOS as readonly string[]).includes(x);
}

function optionalNumber(x: unknown, at: string): number | undefined {
  if (x === undefined) return undefined;
  if (!isFiniteNumber(x)) invalid(`${at}는 유한한 숫자여야 한다`);
  return x;
}

function parseTransform(x: unknown, at: string): MeasuredTransform {
  if (!isObject(x)) invalid(`${at}.transform은 객체여야 한다`);
  if (x.kind === 'indicator') return { kind: 'indicator' };
  if (x.kind !== 'linear') invalid(`${at}.transform.kind는 linear 또는 indicator여야 한다`);
  const { center, per } = x;
  if (!isFiniteNumber(center)) invalid(`${at}.transform.center는 유한한 숫자여야 한다`);
  if (!isFiniteNumber(per) || per === 0) invalid(`${at}.transform.per는 0이 아닌 유한한 숫자여야 한다`);
  const min = optionalNumber(x.min, `${at}.transform.min`);
  const max = optionalNumber(x.max, `${at}.transform.max`);
  if (min !== undefined && max !== undefined && min > max) invalid(`${at}.transform.min이 max보다 크다`);
  const linear: LinearTransform = { kind: 'linear', center, per };
  if (min !== undefined) linear.min = min;
  if (max !== undefined) linear.max = max;
  return linear;
}

function parseEntry(entry: unknown, index: number): MeasuredDef {
  if (!isObject(entry)) invalid(`[${index}]은 객체여야 한다`);
  const { id, label, unit, who, transform, perLabel, applicable, examples } = entry;
  if (!isMeasuredId(id)) invalid(`[${index}].id ${JSON.stringify(id)}는 알 수 없는 실측 변수다`);
  const at = `[${index}] ${id}`;
  if (!isNonEmptyString(label)) invalid(`${at}.label은 비어 있지 않은 문자열이어야 한다`);
  if (typeof unit !== 'string') invalid(`${at}.unit은 문자열이어야 한다`);
  if (!isMeasuredWho(who)) invalid(`${at}.who는 env·team·opponentStarter 중 하나여야 한다`);
  if (!isNonEmptyString(perLabel)) invalid(`${at}.perLabel은 비어 있지 않은 문자열이어야 한다`);
  if (typeof applicable !== 'boolean') invalid(`${at}.applicable은 불리언이어야 한다`);
  if (!Array.isArray(examples) || !examples.every((e) => typeof e === 'string')) {
    invalid(`${at}.examples는 문자열 배열이어야 한다`);
  }
  return {
    id,
    label,
    unit,
    who,
    transform: parseTransform(transform, at),
    perLabel,
    applicable,
    examples: [...examples],
  };
}

/** measured.json 형식을 검사해 MeasuredDef 배열로 돌려준다. 형식이 틀리거나 id가 빠지거나 겹치면 throw */
export function parseMeasured(input: unknown): MeasuredDef[] {
  if (!Array.isArray(input)) invalid('최상위 값은 배열이어야 한다');
  const defs = input.map((entry, index) => parseEntry(entry, index));
  const seen = new Set<MeasuredId>();
  for (const def of defs) {
    if (seen.has(def.id)) invalid(`id ${def.id}가 두 번 나온다`);
    seen.add(def.id);
  }
  const missing = MEASURED_IDS.filter((id) => !seen.has(id));
  if (missing.length > 0) invalid(`빠진 id: ${missing.join(', ')}`);
  return defs;
}

/** 실측 변수 정의. 원본은 measured.json 하나이고 파이프라인(contract.py)도 같은 파일을 읽는다 */
export const MEASURED: readonly MeasuredDef[] = parseMeasured(measuredJson);

const BY_ID = new Map(MEASURED.map((def) => [def.id, def] as const));

export function measuredById(id: MeasuredId): MeasuredDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`알 수 없는 실측 변수: ${id}`);
  return def;
}

/** 원래 값을 효과 단위로 바꾼다: linear는 min·max로 자른 뒤 (v - center) / per, indicator는 0이 아니면 1 */
export function transformValue(def: MeasuredDef, value: number): number {
  const t = def.transform;
  if (t.kind === 'indicator') return value !== 0 ? 1 : 0;
  const clamped = Math.min(t.max ?? Infinity, Math.max(t.min ?? -Infinity, value));
  return (clamped - t.center) / t.per;
}
