import { describe, expect, it } from 'vitest';
import type { EvidenceData } from '../types/data';
import type { MeasuredId } from '../types/domain';
import { normalizeInterpretation, normalizeVerdict } from './normalize';
import { SENSITIVE_REASON } from './safety';
import { fixtureEvidence } from './test-helpers';

type Raw = Record<string, unknown>;

const knob = (over: Raw = {}): Raw => ({
  kind: 'knob', knob: 'stamina', subject: 'pitcher', strength: -1, scope: 'game', evidence: 'fun', why: '배가 무겁다', ...over,
});
const measured = (over: Raw = {}): Raw => ({
  kind: 'measured', variable: 'temp_c', value: 33, subject: 'everyone', why: '더운 날', ...over,
});

/** parts 하나만 넣어 정규화한 parts */
const partsOf = (part: Raw) => normalizeInterpretation({ parts: [part] })!.parts;

describe('normalizeInterpretation', () => {
  it('객체가 아니면 null', () => {
    for (const raw of [null, undefined, 'nope', 3, true, [knob()]]) {
      expect(normalizeInterpretation(raw)).toBeNull();
    }
  });

  it('올바른 응답은 source ai로 통과한다', () => {
    expect(normalizeInterpretation({ refused: false, reason: '', comment: '곱빼기는 무겁죠', parts: [knob(), measured()] })).toEqual({
      source: 'ai',
      refused: false,
      reason: '',
      comment: '곱빼기는 무겁죠',
      parts: [
        { kind: 'knob', knob: 'stamina', subject: 'pitcher', strength: -1, scope: 'game', evidence: 'fun', why: '배가 무겁다' },
        { kind: 'measured', variable: 'temp_c', value: 33, subject: 'everyone', why: '더운 날' },
      ],
    });
  });

  it('refused면 parts를 비우고 reason은 80자, 비면 safety 기본 문구', () => {
    expect(normalizeInterpretation({ refused: true, reason: '사생활이에요', comment: '해설', parts: [knob()] })).toEqual({
      source: 'ai', refused: true, reason: '사생활이에요', comment: '', parts: [],
    });
    expect(normalizeInterpretation({ refused: true })!.reason).toBe(SENSITIVE_REASON);
    expect(normalizeInterpretation({ refused: true, reason: '  ' })!.reason).toBe(SENSITIVE_REASON);
    expect(normalizeInterpretation({ refused: true, reason: '가'.repeat(100) })!.reason).toBe('가'.repeat(80));
    expect(normalizeInterpretation({ refused: 'true', parts: [knob()] })).toMatchObject({ refused: false, parts: [{ knob: 'stamina' }] });
  });

  it('parts가 배열이 아니면 빈 배열, 객체가 아닌 항목과 모르는 kind는 버린다', () => {
    expect(normalizeInterpretation({ comment: '해설', parts: 'knob' })!.parts).toEqual([]);
    expect(normalizeInterpretation({ comment: '해설' })!.parts).toEqual([]);
    expect(normalizeInterpretation({ parts: [null, 'knob', 3, [knob()], { kind: 'magic' }, knob()] })!.parts).toHaveLength(1);
  });

  describe('knob', () => {
    it('KNOB_META에 없는 손잡이는 버린다', () => {
      expect(partsOf(knob({ knob: 'teleport' }))).toEqual([]);
      expect(partsOf(knob({ knob: 'constructor' }))).toEqual([]);
      expect(partsOf(knob({ knob: undefined }))).toEqual([]);
    });

    it('대상이 SUBJECTS_FOR에 없으면 버린다', () => {
      expect(partsOf(knob({ knob: 'power', subject: 'pitcher' }))).toEqual([]);
      expect(partsOf(knob({ knob: 'defense', subject: 'batter' }))).toEqual([]);
      expect(partsOf(knob({ knob: 'mood', subject: 'everyone' }))).toEqual([]);
      expect(partsOf(knob({ knob: 'mood', subject: undefined }))).toEqual([]);
      expect(partsOf(knob({ knob: 'power', subject: 'battingTeam' }))).toMatchObject([{ knob: 'power', subject: 'battingTeam' }]);
      expect(partsOf(knob({ knob: 'defense', subject: 'fieldingTeam' }))).toMatchObject([{ knob: 'defense', subject: 'fieldingTeam' }]);
    });

    it('env 손잡이는 대상을 everyone으로 바꾼다', () => {
      expect(partsOf(knob({ knob: 'carry', subject: 'batter', strength: 2 }))).toMatchObject([{ knob: 'carry', subject: 'everyone', strength: 2 }]);
      expect(partsOf(knob({ knob: 'glare', subject: undefined }))).toMatchObject([{ knob: 'glare', subject: 'everyone' }]);
    });

    it('세기는 반올림 후 -3..3으로 자르고 0·숫자가 아닌 값은 버린다', () => {
      expect(partsOf(knob({ strength: 7 }))).toMatchObject([{ strength: 3 }]);
      expect(partsOf(knob({ strength: -9 }))).toMatchObject([{ strength: -3 }]);
      expect(partsOf(knob({ strength: 1.6 }))).toMatchObject([{ strength: 2 }]);
      expect(partsOf(knob({ strength: '-2' }))).toMatchObject([{ strength: -2 }]);
      for (const strength of [0, 0.4, -0.4, 'big', '', null, true, undefined, Infinity, NaN]) {
        expect(partsOf(knob({ strength }))).toEqual([]);
      }
    });

    it('scope는 pa가 아니면 game', () => {
      expect(partsOf(knob({ scope: 'pa' }))).toMatchObject([{ scope: 'pa' }]);
      expect(partsOf(knob({ scope: 'inning' }))).toMatchObject([{ scope: 'game' }]);
      expect(partsOf(knob({ scope: undefined }))).toMatchObject([{ scope: 'game' }]);
    });

    it('evidence는 plausible·fun만, measured는 plausible로, 그 외는 fun으로', () => {
      expect(partsOf(knob({ evidence: 'plausible' }))).toMatchObject([{ evidence: 'plausible' }]);
      expect(partsOf(knob({ evidence: 'fun' }))).toMatchObject([{ evidence: 'fun' }]);
      expect(partsOf(knob({ evidence: 'measured' }))).toMatchObject([{ evidence: 'plausible' }]);
      expect(partsOf(knob({ evidence: 'data' }))).toMatchObject([{ evidence: 'fun' }]);
      expect(partsOf(knob({ evidence: undefined }))).toMatchObject([{ evidence: 'fun' }]);
    });
  });

  describe('measured', () => {
    it('MEASURED에 없거나 applicable이 아닌 변수(home)는 버린다', () => {
      expect(partsOf(measured({ variable: 'humidity' }))).toEqual([]);
      expect(partsOf(measured({ variable: 'home', value: 1, subject: 'battingTeam' }))).toEqual([]);
    });

    it('value는 유한수여야 하고 linear는 min·max로 자른다', () => {
      expect(partsOf(measured({ value: 55 }))).toMatchObject([{ value: 40 }]);
      expect(partsOf(measured({ value: -30 }))).toMatchObject([{ value: -10 }]);
      expect(partsOf(measured({ variable: 'wind_ms', value: 25 }))).toMatchObject([{ value: 20 }]);
      expect(partsOf(measured({ variable: 'travel_km', value: '350', subject: 'battingTeam' }))).toMatchObject([{ value: 350 }]);
      for (const value of ['hot', '', null, undefined, NaN, Infinity]) {
        expect(partsOf(measured({ value }))).toEqual([]);
      }
    });

    it('indicator는 0/1로 바꾼다', () => {
      expect(partsOf(measured({ variable: 'day_game', value: 5 }))).toMatchObject([{ value: 1 }]);
      expect(partsOf(measured({ variable: 'weekend', value: 0 }))).toMatchObject([{ value: 0 }]);
    });

    it('who별 대상: env는 everyone으로, team은 다섯 대상, opponentStarter는 everyone 제외', () => {
      expect(partsOf(measured({ variable: 'rain_pre3h', value: 3, subject: 'batter' }))).toMatchObject([{ subject: 'everyone' }]);
      for (const subject of ['batter', 'pitcher', 'battingTeam', 'fieldingTeam', 'everyone']) {
        expect(partsOf(measured({ variable: 'travel_km', value: 350, subject }))).toMatchObject([{ subject }]);
      }
      expect(partsOf(measured({ variable: 'after_off_day', value: 1, subject: 'umpire' }))).toEqual([]);
      for (const subject of ['pitcher', 'fieldingTeam', 'batter', 'battingTeam']) {
        expect(partsOf(measured({ variable: 'starter_short_rest', value: 1, subject }))).toMatchObject([{ subject }]);
      }
      expect(partsOf(measured({ variable: 'starter_long_rest', value: 1, subject: 'everyone' }))).toEqual([]);
    });
  });

  it('(kind, 손잡이·변수, 대상)이 같은 중복은 첫 번째만 남긴다', () => {
    const out = normalizeInterpretation({
      parts: [
        knob({ strength: -1 }),
        knob({ strength: -3 }),
        knob({ subject: 'fieldingTeam', strength: 1 }),
        measured({ value: 30 }),
        measured({ value: 35, subject: 'batter' }),
      ],
    })!;
    expect(out.parts).toEqual([
      expect.objectContaining({ kind: 'knob', knob: 'stamina', subject: 'pitcher', strength: -1 }),
      expect.objectContaining({ kind: 'knob', knob: 'stamina', subject: 'fieldingTeam', strength: 1 }),
      expect.objectContaining({ kind: 'measured', variable: 'temp_c', subject: 'everyone', value: 30 }),
    ]);
  });

  it('통과한 것만 앞에서부터 최대 3개', () => {
    const out = normalizeInterpretation({
      parts: [
        knob({ knob: 'teleport' }),
        knob({ knob: 'power', subject: 'batter', strength: 1 }),
        knob({ knob: 'eye', subject: 'batter', strength: 0 }),
        knob({ knob: 'contact', subject: 'batter', strength: 2 }),
        measured(),
        knob({ knob: 'mood', subject: 'battingTeam', strength: 1 }),
      ],
    })!;
    expect(out.parts.map((p) => (p.kind === 'knob' ? p.knob : p.variable))).toEqual(['power', 'contact', 'temp_c']);
  });

  it('문자열은 제어 문자를 지우고 앞뒤 공백을 없앤 뒤 자른다', () => {
    const out = normalizeInterpretation({
      comment: `  해설 ${'가'.repeat(120)}`,
      parts: [knob({ why: `근거‮${'나'.repeat(80)}` })],
    })!;
    expect(out.comment).toBe(`해설${'가'.repeat(88)}`);
    expect(out.parts).toMatchObject([{ why: `근거${'나'.repeat(58)}` }]);
    expect(normalizeInterpretation({ comment: 3, parts: [knob({ why: { text: '근거' } })] })).toMatchObject({ comment: '', parts: [{ why: '' }] });
  });
});

/** 픽스처 evidence에 verdict real인 항목을 더한다 */
function evidenceWith(...ids: MeasuredId[]): EvidenceData {
  const base = fixtureEvidence();
  const extra = ids.map((id) => ({ ...base.items[0], id, verdict: 'real' as const, note: `${id} 메모` }));
  return { ...base, items: [...base.items, ...extra] };
}

describe('normalizeVerdict', () => {
  const evidence = fixtureEvidence();
  const dayGame = evidence.items.find((item) => item.id === 'day_game')!;

  it('객체가 아니면 null', () => {
    for (const raw of [null, undefined, 'real', 1, ['temp_c']]) {
      expect(normalizeVerdict(raw, evidence)).toBeNull();
    }
  });

  it('AI가 real이라 해도 evidence가 useless면 useless (문장도 기록표 문구로)', () => {
    expect(normalizeVerdict({ variables: ['day_game'], verdict: 'real', headline: '진짜 효과예요', body: '낮 경기는 크게 불리해요' }, evidence)).toEqual({
      source: 'ai',
      variables: ['day_game'],
      verdict: 'useless',
      headline: '쓸모없는 변수로 판정됐어요',
      body: dayGame.note,
    });
  });

  it('데이터 판정과 같으면 AI 문장을 40자·220자로 잘라 쓰고, 비면 기록표 문구', () => {
    expect(normalizeVerdict({ variables: ['temp_c'], verdict: 'maybe', headline: `애매${'가'.repeat(60)}`, body: '나'.repeat(300) }, evidence)).toEqual({
      source: 'ai', variables: ['temp_c'], verdict: 'maybe', headline: `애매${'가'.repeat(38)}`, body: '나'.repeat(220),
    });
    expect(normalizeVerdict({ variables: ['temp_c'], verdict: 'maybe' }, evidence)).toMatchObject({
      headline: '있을 수도, 없을 수도 있어요',
      body: evidence.items[0].note,
    });
  });

  it('evidence items에 없는 변수는 지우고 중복 없이 최대 3개, 판정은 첫 변수', () => {
    const many = evidenceWith('wind_ms', 'weekend');
    const out = normalizeVerdict({ variables: ['humidity', 'day_game', 3, 'day_game', 'wind_ms', 'temp_c', 'weekend'], verdict: 'useless', headline: '쓸모없어요', body: '기록상 차이가 없어요' }, many)!;
    expect(out.variables).toEqual(['day_game', 'wind_ms', 'temp_c']);
    expect(out).toMatchObject({ verdict: 'useless', headline: '쓸모없어요', body: '기록상 차이가 없어요' });
    expect(normalizeVerdict({ variables: ['rain_pre3h'], verdict: 'real' }, evidence)!.variables).toEqual([]);
  });

  it('variables가 비면 unmeasurable', () => {
    expect(normalizeVerdict({ variables: ['humidity'], verdict: 'real', headline: '진짜예요', body: '효과가 커요' }, evidence)).toEqual({
      source: 'ai',
      variables: [],
      verdict: 'unmeasurable',
      headline: '기록으로 잴 수 없는 변수예요',
      body: '이런 이야기는 경기 기록에 남지 않아 실제 효과를 잴 수 없어요.',
    });
    expect(normalizeVerdict({ verdict: 'unmeasurable', headline: '잴 수 없는 이야기', body: '기록에 남지 않아요' }, evidence)).toEqual({
      source: 'ai', variables: [], verdict: 'unmeasurable', headline: '잴 수 없는 이야기', body: '기록에 남지 않아요',
    });
  });
});
