import { KNOB_META, SUBJECTS_FOR } from '../domain/knobs';
import { MEASURED } from '../domain/measured';
import type { EvidenceData } from '../types/data';
import type {
  EffectPart,
  Evidence,
  Interpretation,
  KnobId,
  KnobPart,
  MeasuredDef,
  MeasuredId,
  MeasuredPart,
  MeasuredWho,
  Subject,
  VerdictResult,
} from '../types/domain';
import { UNMEASURABLE_BODY, UNMEASURABLE_HEADLINE, VERDICT_HEADLINE } from './rules';
import { SENSITIVE_REASON } from './safety';

/*
 * AI 원문 JSON을 엔진에 넣어도 되는 값으로 검증한다(ADR-003).
 * 통과하지 못한 항목은 버리고, 숫자는 범위 안으로 자르며, 판정은 evidence 데이터가 이긴다.
 */

const MAX_PARTS = 3;
const MAX_VARIABLES = 3;

/** 실측 변수 who마다 해석 결과가 고를 수 있는 Subject (env는 everyone으로 바꾼다) */
const MEASURED_SUBJECTS: Record<Exclude<MeasuredWho, 'env'>, readonly Subject[]> = {
  team: ['batter', 'pitcher', 'battingTeam', 'fieldingTeam', 'everyone'],
  opponentStarter: ['pitcher', 'fieldingTeam', 'batter', 'battingTeam'],
};

const APPLICABLE = new Map<string, MeasuredDef>(MEASURED.filter((def) => def.applicable).map((def) => [def.id, def]));

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** 제어 문자(C0·C1)와 보이지 않는 폭·방향 제어 문자인지 */
function isControl(code: number): boolean {
  return code < 0x20
    || (code >= 0x7f && code <= 0x9f)
    || (code >= 0x200b && code <= 0x200f)
    || (code >= 0x202a && code <= 0x202e)
    || (code >= 0x2060 && code <= 0x206f)
    || code === 0xfeff;
}

/** 제어 문자(C0·C1)와 보이지 않는 폭·방향 제어 문자를 replacement로 바꾼다 */
export function stripControl(text: string, replacement = ''): string {
  return Array.from(text, (ch) => (isControl(ch.codePointAt(0) ?? 0) ? replacement : ch)).join('');
}

/** 문자열이면 제어 문자를 지우고 앞뒤 공백을 없앤 뒤 max 글자(코드 포인트)로 자른다. 문자열이 아니면 '' */
function cleanText(x: unknown, max: number): string {
  if (typeof x !== 'string') return '';
  return Array.from(stripControl(x).trim()).slice(0, max).join('').trim();
}

/** 숫자나 숫자 문자열이면 유한수, 아니면 null */
function toFinite(x: unknown): number | null {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
}

function pickSubject(allowed: readonly Subject[], x: unknown): Subject | null {
  return allowed.find((s) => s === x) ?? null;
}

function knobEvidence(x: unknown): Evidence {
  return x === 'plausible' || x === 'measured' ? 'plausible' : 'fun';
}

function normalizeKnob(x: Record<string, unknown>): KnobPart | null {
  if (typeof x.knob !== 'string' || !Object.hasOwn(KNOB_META, x.knob)) return null;
  const knob = x.knob as KnobId;
  const who = KNOB_META[knob].who;
  const subject = who === 'env' ? 'everyone' : pickSubject(SUBJECTS_FOR[who], x.subject);
  if (!subject) return null;
  const n = toFinite(x.strength);
  if (n === null) return null;
  const strength = Math.max(-3, Math.min(3, Math.round(n)));
  if (strength === 0) return null;
  return {
    kind: 'knob',
    knob,
    subject,
    strength,
    scope: x.scope === 'pa' ? 'pa' : 'game',
    evidence: knobEvidence(x.evidence),
    why: cleanText(x.why, 60),
  };
}

/** linear는 min·max로 자르고 indicator는 0/1로 */
function clampMeasured(def: MeasuredDef, value: number): number {
  const t = def.transform;
  if (t.kind === 'indicator') return value !== 0 ? 1 : 0;
  return Math.min(t.max ?? Infinity, Math.max(t.min ?? -Infinity, value));
}

function normalizeMeasured(x: Record<string, unknown>): MeasuredPart | null {
  const def = typeof x.variable === 'string' ? APPLICABLE.get(x.variable) : undefined;
  if (!def) return null;
  const value = toFinite(x.value);
  if (value === null) return null;
  const subject = def.who === 'env' ? 'everyone' : pickSubject(MEASURED_SUBJECTS[def.who], x.subject);
  if (!subject) return null;
  return { kind: 'measured', variable: def.id, value: clampMeasured(def, value), subject, why: cleanText(x.why, 60) };
}

function partKey(part: EffectPart): string {
  return part.kind === 'knob' ? `knob:${part.knob}:${part.subject}` : `measured:${part.variable}:${part.subject}`;
}

/** AI 해석 원문 → Interpretation(source 'ai'). 객체가 아니면 null */
export function normalizeInterpretation(raw: unknown): Interpretation | null {
  if (!isRecord(raw)) return null;
  if (raw.refused === true) {
    return { source: 'ai', refused: true, reason: cleanText(raw.reason, 80) || SENSITIVE_REASON, comment: '', parts: [] };
  }
  const parts: EffectPart[] = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(raw.parts) ? raw.parts : []) {
    if (parts.length === MAX_PARTS) break;
    if (!isRecord(x)) continue;
    const part = x.kind === 'knob' ? normalizeKnob(x) : x.kind === 'measured' ? normalizeMeasured(x) : null;
    if (!part || seen.has(partKey(part))) continue;
    seen.add(partKey(part));
    parts.push(part);
  }
  return { source: 'ai', refused: false, reason: '', comment: cleanText(raw.comment, 90), parts };
}

/**
 * AI 판정 원문 → VerdictResult(source 'ai'). 객체가 아니면 null.
 * 판정은 첫 변수의 evidence item이 정한다. AI가 다른 판정을 말했거나 문장이 비었으면 기록표 문구를 쓴다.
 */
export function normalizeVerdict(raw: unknown, evidence: EvidenceData): VerdictResult | null {
  if (!isRecord(raw)) return null;
  const items = new Map(evidence.items.map((item) => [item.id as string, item]));
  const variables: MeasuredId[] = [];
  for (const v of Array.isArray(raw.variables) ? raw.variables : []) {
    if (variables.length === MAX_VARIABLES) break;
    const item = typeof v === 'string' ? items.get(v) : undefined;
    if (item && !variables.includes(item.id)) variables.push(item.id);
  }
  const first = variables.length > 0 ? items.get(variables[0]) : undefined;
  const verdict = first ? first.verdict : 'unmeasurable';
  const agrees = raw.verdict === verdict;
  const headline = agrees ? cleanText(raw.headline, 40) : '';
  const body = agrees ? cleanText(raw.body, 220) : '';
  return {
    source: 'ai',
    variables,
    verdict,
    headline: headline || (first ? VERDICT_HEADLINE[first.verdict] : UNMEASURABLE_HEADLINE),
    body: body || (first ? cleanText(first.note, 220) : UNMEASURABLE_BODY),
  };
}
