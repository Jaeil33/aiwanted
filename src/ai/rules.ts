import { KNOB_META } from '../domain/knobs';
import { MEASURED } from '../domain/measured';
import type { EvidenceData } from '../types/data';
import type {
  EffectPart,
  Interpretation,
  KnobId,
  MeasuredDef,
  MeasuredId,
  PromptContext,
  Subject,
  Verdict,
  VerdictResult,
} from '../types/domain';
import { CONCEPTS, matchConcepts, sentimentOf, type Concept, type ConceptMatch } from './lexicon';
import { assessSafety, SENSITIVE_REASON, type SafetyAssessment } from './safety';
import { resolveTarget, type TargetResolution } from './targets';
import { prepareText, type Clause, type PreparedText } from './text';

/*
 * AI를 쓸 수 없을 때의 규칙 해석(ADR-013·026)과 규칙 판정. 확률이나 실측 효과 크기는 만들지 않는다(ADR-003, ADR-004):
 * 문장을 손잡이 세기·실측 입력값으로 옮기기만 한다. 순수 모듈이라 난수 대신 문장 해시를 쓴다.
 * 순서: 입력 정리 → 안전 판정 → 절마다 대상 추론·개념 사전(핵심 + 일상 낱말 DB) → 부정·강도 → 실측 값 → 합치기 → 없으면 분위기 대체.
 */

/** 효과를 하나도 만들 수 없을 때(빈 문장)의 해설 */
export const NO_EFFECT_COMMENT = '승부와 이어 붙일 방법이 없는 변수로 판정했어요. 차이는 0이에요.';
/** 사전에 맞는 낱말이 없어 문장 분위기로 이었을 때의 이유 */
export const FALLBACK_WHY = '딱 맞는 사전 낱말이 없어 문장 분위기로 살짝 이었어요';

export const VERDICT_HEADLINE: Record<Verdict, string> = {
  real: '기록으로 확인된 효과예요',
  maybe: '있을 수도, 없을 수도 있어요',
  useless: '쓸모없는 변수로 판정됐어요',
};
export const UNMEASURABLE_HEADLINE = '기록으로 잴 수 없는 변수예요';
export const UNMEASURABLE_BODY = '이런 이야기는 경기 기록에 남지 않아 실제 효과를 잴 수 없어요.';
export const NO_EVIDENCE_HEADLINE = '판정 데이터가 아직 없어요';
const NO_EVIDENCE_BODY = '실측 판정표가 아직 준비되지 않아 효과를 확인할 수 없어요.';

const MAX_PARTS = 3;
const MAX_VARIABLES = 3;
const MAX_STRENGTH = 3;
const MAX_COMMENT = 90;
const WHAT_MAX = 14;
/** 기온이 이 값에서 TEMP_BAND보다 멀어야 비거리 손잡이를 움직인다 */
const TEMP_CENTER = 20;
const TEMP_BAND = 3;
/** 이동 시간(시간) → 거리(km) */
const KM_PER_HOUR = 80;

const MEASURED_BY_ID = new Map<MeasuredId, MeasuredDef>(MEASURED.map((def) => [def.id, def]));
/** 문장에 섭씨 숫자만 있을 때("오늘 30도") 쓰는 기온 개념 */
const TEMP_CONCEPT = CONCEPTS.find((concept) => concept.id === 'weather-temp');

/** 투수에게 걸린 타자 손잡이, 타자에게 걸린 투수 손잡이를 같은 방향의 짝으로 옮긴다 */
const TO_PITCHER: Partial<Record<KnobId, KnobId>> = { contact: 'control', power: 'stuff', eye: 'control', focus: 'nerve', speed: 'stamina' };
const TO_BATTER: Partial<Record<KnobId, KnobId>> = { stuff: 'power', control: 'eye', stamina: 'focus', nerve: 'focus' };
const BATTER_FALLBACK: readonly KnobId[] = ['focus', 'contact', 'eye', 'power'];
const PITCHER_FALLBACK: readonly KnobId[] = ['nerve', 'control', 'stuff', 'stamina'];

interface Candidate {
  part: EffectPart;
  /** 문장 안 순서(절 번호 × 100 + 절 안 순서) */
  order: number;
  clause: number;
  comment: string;
}

const whoOf = (knob: KnobId) => KNOB_META[knob].who;
const clampStrength = (x: number) => Math.max(-MAX_STRENGTH, Math.min(MAX_STRENGTH, x));
const fill = (template: string, key: string, value: string) => template.split(key).join(value);

function clip(text: string, max: number): string {
  const chars = Array.from(text.trim());
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
}

/** FNV-1a 32비트 해시(대체 해석의 결정적 선택) */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 사전 세기 → 해석 세기: 보통은 한 단계 크게, "너무·완전"은 두 단계, "살짝·조금"은 사전 세기 그대로(ADR-026) */
function scaled(base: number, intensity: 0 | 1 | 2): number {
  const bump = intensity === 1 ? 0 : intensity === 2 ? 2 : 1;
  return Math.sign(base) * Math.min(MAX_STRENGTH, Math.abs(base) + bump);
}

/** 같은 표현의 대상별 변형(group) 중 이 대상에 맞는 하나. 대상 말이 없으면 사전의 첫 변형 */
function pickVariant(list: readonly ConceptMatch[], target: TargetResolution): ConceptMatch {
  if (list.length === 1 || target.via === 'default') return list[0];
  const by = (who: string) => list.find((m) => whoOf(m.concept.knob) === who);
  switch (target.subject) {
    case 'batter':
      return by('batter') ?? list[0];
    case 'pitcher':
      return by('pitcher') ?? list[0];
    case 'battingTeam':
      return (target.teamOnly ? by('team') : undefined) ?? by('batter') ?? list[0];
    case 'fieldingTeam':
      return (target.teamOnly ? by('team') : undefined) ?? by('pitcher') ?? by('field') ?? list[0];
    default:
      return list[0];
  }
}

/** 개념 손잡이를 대상에 놓는다. 손잡이·대상 조합은 항상 SUBJECTS_FOR 안이다 */
function place(concept: Concept, target: TargetResolution): { knob: KnobId; subject: Subject } {
  const { knob } = concept;
  const who = whoOf(knob);
  if (who === 'env') return { knob, subject: 'everyone' };
  if (target.via === 'default') return { knob, subject: concept.defaultSubject };
  const t = target.subject;
  if (who === 'team') {
    if (t === 'battingTeam' || t === 'fieldingTeam') return { knob, subject: t };
    if (t === 'batter') return { knob, subject: 'battingTeam' };
    if (t === 'pitcher') return { knob, subject: 'fieldingTeam' };
    return { knob, subject: concept.defaultSubject };
  }
  if (who === 'field') {
    if (t === 'fieldingTeam' || t === 'pitcher') return { knob, subject: 'fieldingTeam' };
    if (t === 'battingTeam' || t === 'batter') return { knob: 'mood', subject: 'battingTeam' };
    return { knob, subject: concept.defaultSubject };
  }
  if (who === 'batter') {
    if (t === 'batter' || t === 'battingTeam') return { knob, subject: t };
    if (t === 'pitcher') return { knob: TO_PITCHER[knob] ?? 'nerve', subject: 'pitcher' };
    if (t === 'fieldingTeam') return { knob: 'mood', subject: 'fieldingTeam' };
    return { knob, subject: concept.defaultSubject };
  }
  if (t === 'pitcher' || t === 'fieldingTeam') return { knob, subject: t };
  if (t === 'batter') return { knob: TO_BATTER[knob] ?? 'focus', subject: 'batter' };
  if (t === 'battingTeam') return { knob: 'mood', subject: 'battingTeam' };
  return { knob, subject: concept.defaultSubject };
}

/** linear는 min·max로 자르고 indicator는 0/1 (normalize와 같은 규칙) */
function clampMeasured(def: MeasuredDef, value: number): number {
  const t = def.transform;
  if (t.kind === 'indicator') return value !== 0 ? 1 : 0;
  return Math.min(t.max ?? Infinity, Math.max(t.min ?? -Infinity, value));
}

/** 절 안 숫자(단위가 맞는 것) → 실측 값. 이동은 km, 없으면 시간 × 80km, 둘 다 없으면 개념 기본값 */
function measuredValue(concept: Concept, clause: Clause, prepared: PreparedText): number | null {
  const spec = concept.measured;
  if (!spec) return null;
  const numbers = prepared.numbers.filter((n) => n.raw !== '' && clause.text.includes(n.raw));
  if (spec.variable === 'travel_km') {
    const km = numbers.find((n) => n.unit === 'km');
    if (km) return km.value;
    const hours = numbers.find((n) => n.unit === 'hour');
    return hours ? hours.value * KM_PER_HOUR : spec.defaultValue;
  }
  const own = spec.unit ? numbers.find((n) => n.unit === spec.unit) : undefined;
  return own ? own.value : spec.defaultValue;
}

function measuredSubject(def: MeasuredDef, placed: Subject): Subject {
  if (def.who === 'env') return 'everyone';
  if (def.who === 'team') return placed;
  return placed === 'everyone' ? 'pitcher' : placed;
}

function tempDirection(value: number): -1 | 0 | 1 {
  if (value > TEMP_CENTER + TEMP_BAND) return 1;
  return value < TEMP_CENTER - TEMP_BAND ? -1 : 0;
}

/** 해설에 쓸 대상 이름: 대상 추론이 고른 이름표가 이 대상이면 그것, 아니면 장면 이름 */
function labelFor(subject: Subject, target: TargetResolution, ctx: PromptContext): string {
  if (target.via !== 'default' && target.subject === subject && target.label.trim() !== '') return target.label;
  switch (subject) {
    case 'batter':
      return ctx.batter.name.trim() || '타자';
    case 'pitcher':
      return ctx.pitcher.name.trim() || '투수';
    case 'battingTeam':
      return ctx.battingTeam || '공격 팀';
    case 'fieldingTeam':
      return ctx.fieldingTeam || '수비 팀';
    default:
      return '양 팀';
  }
}

function commentOf(
  match: ConceptMatch,
  placed: { knob: KnobId; subject: Subject },
  strength: number,
  target: TargetResolution,
  ctx: PromptContext,
): string {
  const { concept } = match;
  const what = clip(match.matched, WHAT_MAX);
  const who = labelFor(placed.subject, target, ctx);
  const effect = `${KNOB_META[placed.knob].label} ${strength > 0 ? '↑' : '↓'}`;
  let text: string;
  if (match.negated) text = `'${what}' 아니라니, ${who} ${effect}로 봤어요`;
  else if (placed.knob !== concept.knob) text = `'${what}' 이야기를 ${who} ${effect}로 옮겨 봤어요`;
  else if (Math.sign(strength) !== Math.sign(concept.strength)) text = `'${what}' → ${who} ${effect}로 봤어요`;
  else if (target.subject === 'everyone' && target.via !== 'default' && whoOf(placed.knob) !== 'env') {
    text = `${target.label}의 '${what}'이 ${who} ${effect}로 번졌다고 봤어요`;
  } else text = fill(fill(concept.comment, '{what}', what), '{who}', who);
  return clip(text, MAX_COMMENT);
}

/** 응원·관중 개념의 대상: 문장 주어 대신 관중 말 바로 앞 두 낱말까지 보고 팀을 정한다. 팀이 안 나오면 홈 팀 */
function crowdTarget(clause: Clause, match: ConceptMatch, prepared: PreparedText, ctx: PromptContext): TargetResolution {
  const at = clause.text.indexOf(match.matched);
  const before = at > 0 ? clause.text.slice(0, at).trim().split(' ').filter(Boolean).slice(-2) : [];
  const local = resolveTarget({ text: [...before, match.matched].join(' '), subjectHint: null }, prepared, ctx);
  const subject: Subject = local.teamOnly ? local.subject : ctx.battingTeam === ctx.homeName ? 'battingTeam' : 'fieldingTeam';
  if (subject !== 'battingTeam' && subject !== 'fieldingTeam') return local;
  return { subject, label: subject === 'battingTeam' ? ctx.battingTeam : ctx.fieldingTeam, via: 'role', teamOnly: true };
}

/** 절 하나의 효과 후보: 개념마다 대상에 맞는 변형 → 부정·강도 → (실측 값) → 손잡이 */
function clauseCandidates(clause: Clause, index: number, prepared: PreparedText, ctx: PromptContext, measuredAvailable: boolean): Candidate[] {
  const matches = matchConcepts(clause, prepared);
  if (TEMP_CONCEPT && !matches.some((m) => m.concept.measured?.variable === 'temp_c')) {
    const celsius = prepared.numbers.find((n) => n.unit === 'celsius' && n.raw !== '' && clause.text.includes(n.raw));
    if (celsius) matches.push({ concept: TEMP_CONCEPT, matched: celsius.raw, negated: false });
  }
  if (matches.length === 0) return [];

  const target = resolveTarget(clause, prepared, ctx);
  const groups = new Map<string, ConceptMatch[]>();
  for (const match of matches) {
    const key = match.concept.group ?? match.concept.id;
    const list = groups.get(key);
    if (list) list.push(match);
    else groups.set(key, [match]);
  }

  const out: Candidate[] = [];
  let n = 0;
  for (const list of groups.values()) {
    // 응원·관중 개념은 문장 주어가 아니라 관중 말 앞의 팀을 본다
    const own = list[0].concept.category === 'crowd' ? crowdTarget(clause, list[0], prepared, ctx) : target;
    const match = pickVariant(list, own);
    const { concept } = match;
    if (match.negated && concept.negation === 'cancel') continue;
    const order = index * 100 + n;
    n += 1;
    const placed = place(concept, own);
    const def = concept.measured ? MEASURED_BY_ID.get(concept.measured.variable) : undefined;
    const raw = measuredValue(concept, clause, prepared);
    const value = def && raw !== null ? clampMeasured(def, raw) : null;
    let base = match.negated ? -concept.strength : concept.strength;
    if (concept.measured?.variable === 'temp_c' && value !== null) base = Math.abs(concept.strength) * tempDirection(value) * (match.negated ? -1 : 1);
    const strength = base === 0 ? 0 : scaled(base, prepared.intensity);
    const comment = commentOf(match, placed, strength === 0 ? concept.strength : strength, own, ctx);

    if (measuredAvailable && def?.applicable && value !== null && !match.negated) {
      out.push({ part: { kind: 'measured', variable: def.id, value, subject: measuredSubject(def, placed.subject), why: concept.why }, order, clause: index, comment });
    }
    if (strength !== 0) {
      out.push({
        part: { kind: 'knob', knob: placed.knob, subject: placed.subject, strength, scope: concept.scope, evidence: concept.evidence, why: concept.why },
        order: order + 0.5,
        clause: index,
        comment,
      });
    }
  }
  return out;
}

function partKey(part: EffectPart): string {
  return part.kind === 'knob' ? `knob:${part.knob}:${part.subject}` : `measured:${part.variable}:${part.subject}`;
}

/** 절 안에서는 같은 손잡이·대상 중 |세기|가 큰 하나, 절 사이에서는 세기를 더해 ±3(0이면 지운다). 실측은 첫 하나 */
function merge(candidates: readonly Candidate[]): Candidate[] {
  const perClause = new Map<string, Candidate>();
  for (const c of candidates) {
    const key = `${c.clause}|${partKey(c.part)}`;
    const prev = perClause.get(key);
    if (!prev) perClause.set(key, c);
    else if (c.part.kind === 'knob' && prev.part.kind === 'knob' && Math.abs(c.part.strength) > Math.abs(prev.part.strength)) perClause.set(key, c);
  }
  const merged = new Map<string, Candidate>();
  for (const c of [...perClause.values()].sort((a, b) => a.order - b.order)) {
    const key = partKey(c.part);
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, c);
      continue;
    }
    if (prev.part.kind !== 'knob' || c.part.kind !== 'knob') continue;
    const strength = clampStrength(prev.part.strength + c.part.strength);
    // 방향이 바뀌면 나중 절의 이유·해설을 쓴다
    const lead = Math.sign(strength) === Math.sign(prev.part.strength) ? prev : c;
    if (lead.part.kind === 'knob') merged.set(key, { ...lead, order: prev.order, part: { ...lead.part, strength } });
  }
  return [...merged.values()].filter((c) => c.part.kind !== 'knob' || c.part.strength !== 0);
}

const strengthOf = (c: Candidate) => (c.part.kind === 'knob' ? Math.abs(c.part.strength) : 0);

/** 최대 3개: 실측 하나 → 손잡이(|세기| 큰 순서) → 나머지 실측 */
function select(list: readonly Candidate[]): Candidate[] {
  const measured = list.filter((c) => c.part.kind === 'measured').sort((a, b) => a.order - b.order);
  const knobs = list.filter((c) => c.part.kind === 'knob').sort((a, b) => strengthOf(b) - strengthOf(a) || a.order - b.order);
  return [...measured.slice(0, 1), ...knobs, ...measured.slice(1)].slice(0, MAX_PARTS);
}

/** 사전에 맞는 말이 없을 때: 문장 분위기(없으면 해시 홀짝)로 방향, 사람은 개인 손잡이·팀은 mood, 이번 타석·상상 */
function fallback(prepared: PreparedText, ctx: PromptContext): Interpretation {
  const clause = prepared.clauses[0] ?? { text: prepared.normalized, subjectHint: null };
  const target = resolveTarget(clause, prepared, ctx);
  const hash = fnv1a(prepared.normalized);
  const mood = sentimentOf(prepared.normalized);
  const sign = mood !== 0 ? mood : hash % 2 === 0 ? 1 : -1;
  const size = Math.min(MAX_STRENGTH, (mood !== 0 ? 2 : 1) + (prepared.intensity === 2 ? 1 : 0));
  const pick = (list: readonly KnobId[]) => list[(hash >>> 3) % list.length];
  let knob: KnobId = 'mood';
  let subject: Subject = 'battingTeam';
  if (target.subject === 'batter') {
    knob = pick(BATTER_FALLBACK);
    subject = 'batter';
  } else if (target.subject === 'pitcher') {
    knob = pick(PITCHER_FALLBACK);
    subject = 'pitcher';
  } else if (target.subject === 'fieldingTeam' || target.subject === 'battingTeam') {
    subject = target.subject;
  }
  const strength = sign * size;
  const who = labelFor(subject, target, ctx);
  const comment = clip(`'${clip(clause.text, 16)}' → ${who} ${KNOB_META[knob].label} ${strength > 0 ? '↑' : '↓'} 쪽으로 살짝 이었어요`, MAX_COMMENT);
  return {
    source: 'rules',
    refused: false,
    reason: '',
    comment,
    parts: [{ kind: 'knob', knob, subject, strength, scope: 'pa', evidence: 'fun', why: FALLBACK_WHY }],
  };
}

/** 규칙 해석(source 'rules'). 거부가 아니면 효과가 항상 1~3개다 */
export function ruleInterpret(
  text: string,
  ctx: PromptContext,
  opts: { measuredAvailable: boolean; safety?: SafetyAssessment },
): Interpretation {
  const prepared = prepareText(text);
  if (prepared.normalized === '') return { source: 'rules', refused: false, reason: '', comment: NO_EFFECT_COMMENT, parts: [] };
  // AI가 없는 경로라 판단을 미룬 review도 거부한다(ADR-013)
  const safety = opts.safety ?? assessSafety(prepared, ctx);
  if (safety.level !== 'allow') return { source: 'rules', refused: true, reason: safety.reason || SENSITIVE_REASON, comment: '', parts: [] };

  const candidates = prepared.clauses.flatMap((clause, i) => clauseCandidates(clause, i, prepared, ctx, opts.measuredAvailable));
  const chosen = select(merge(candidates));
  if (chosen.length === 0) return fallback(prepared, ctx);
  return { source: 'rules', refused: false, reason: '', comment: chosen[0].comment, parts: chosen.map((c) => c.part) };
}

// ---------- 규칙 판정 ----------

interface MeasuredRule {
  variable: MeasuredId;
  /** 문장에서 measured.json 단위의 값을 찾는다. 없으면 null */
  find(text: string): number | null;
}

const TEMP_NUMBER = /(영하\s*)?(?<![\d.])(\d{1,2}(?:\.\d+)?)\s*(?:도(?!루)|℃|°C)/;
const WIND_NUMBER = /(?<![\d.])(\d{1,2}(?:\.\d+)?)\s*(?:m\/s|㎧)/;

function findTemp(text: string): number | null {
  const m = TEMP_NUMBER.exec(text);
  if (m) {
    const value = Number(m[2]) * (m[1] ? -1 : 1);
    if (value >= -20 && value <= 45) return value;
  }
  if (/폭염|무더위|더워|더운/.test(text)) return 32;
  if (/쌀쌀|추워|추운|한파/.test(text)) return 8;
  return null;
}

function findWind(text: string): number | null {
  const m = WIND_NUMBER.exec(text);
  if (m) return Number(m[1]);
  return /강풍|바람이\s*세|태풍/.test(text) ? 9 : null;
}

const flag = (re: RegExp) => (text: string) => (re.test(text) ? 1 : null);
const starter = (re: RegExp) => (text: string) => (text.includes('선발') && re.test(text) ? 1 : null);

/** 판정 후보를 찾는 날씨·일정 키워드 */
const MEASURED_RULES: readonly MeasuredRule[] = [
  { variable: 'temp_c', find: findTemp },
  { variable: 'wind_ms', find: findWind },
  { variable: 'rain_pre3h', find: (text) => (/(?<![가-힣])비가|(?<![가-힣])비\s?온|빗방울|우천|젖은|습한/.test(text) ? 3 : null) },
  { variable: 'day_game', find: flag(/낮\s?경기|땡볕|햇빛/) },
  { variable: 'weekend', find: flag(/주말|토요일|일요일/) },
  { variable: 'travel_km', find: (text) => (/원정길|장거리\s?이동|버스로/.test(text) ? 350 : null) },
  { variable: 'after_off_day', find: flag(/푹\s?쉬|휴식일|쉬고\s?온/) },
  { variable: 'starter_short_rest', find: starter(/짧게\s?쉬|당겨서|덜\s?쉬/) },
  { variable: 'starter_long_rest', find: starter(/오래\s?쉬|열흘|복귀/) },
];

/** 규칙 판정(source 'rules'): 해석의 실측 변수와 날씨·일정 키워드 변수 중 evidence에 있는 첫 변수의 판정 */
export function rulesVerdict(text: string, interpretation: Interpretation, evidence: EvidenceData | null): VerdictResult {
  if (!evidence) {
    return { source: 'rules', variables: [], verdict: 'unmeasurable', headline: NO_EVIDENCE_HEADLINE, body: NO_EVIDENCE_BODY };
  }
  const candidates = [
    ...interpretation.parts.flatMap((part) => (part.kind === 'measured' ? [part.variable] : [])),
    ...MEASURED_RULES.filter((rule) => rule.find(text) !== null).map((rule) => rule.variable),
  ];
  const items = new Map(evidence.items.map((item) => [item.id, item]));
  const variables = [...new Set(candidates)].filter((id) => items.has(id)).slice(0, MAX_VARIABLES);
  const first = variables.length > 0 ? items.get(variables[0]) : undefined;
  if (!first) {
    return { source: 'rules', variables: [], verdict: 'unmeasurable', headline: UNMEASURABLE_HEADLINE, body: UNMEASURABLE_BODY };
  }
  return { source: 'rules', variables, verdict: first.verdict, headline: VERDICT_HEADLINE[first.verdict], body: first.note };
}
