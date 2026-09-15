import { describe, expect, it } from 'vitest';
import { TMI_CORPUS, type CorpusCase, type Expectation, type ExpectedSubject } from '../test/fixtures/tmiCorpus';
import type { EvidenceData } from '../types/data';
import type { EffectPart, Interpretation, KnobPart, PromptContext, RosterEntry, Subject } from '../types/domain';
import { normalizeInterpretation } from './normalize';
import { FALLBACK_WHY, ruleInterpret, rulesVerdict } from './rules';
import { fixtureContext, fixtureEvidence } from './test-helpers';

const on = { measuredAvailable: true };
const off = { measuredAvailable: false };

// ---------- 말뭉치 맥락: 가상 이름만 쓴다 ----------

const roster = (names: readonly string[]): RosterEntry[] => names.map((name, i) => ({ id: `r${name}`, name, slot: i + 1 }));
const HOME_BATS = ['가나원', '다라투', '마바삼', '사아넷', '자차오', '김타자', '카파칠', '하거팔', '너더구'];
const AWAY_BATS = ['도레미', '레미파', '미파솔', '파솔라', '솔라시', '라시도', '시도레', '고요요', '구름빵'];

/** 9회말 홈 롯데 공격(김타자) 대 원정 KIA 수비(박투수) */
const homeBatting: PromptContext = fixtureContext({
  batter: { id: 'h6', name: '김타자', team: '롯데', bats: 'L' },
  pitcher: { id: 'ap', name: '박투수', team: 'KIA', throws: 'R' },
  battingTeam: '롯데',
  fieldingTeam: 'KIA',
  lineupNames: [...AWAY_BATS, ...HOME_BATS],
  battingLineup: roster(HOME_BATS),
  fieldingLineup: roster(AWAY_BATS),
  otherPlayers: [{ name: '나다른', team: '삼성', kind: 'H' }],
});
/** 같은 사람들로 원정 KIA가 공격하는 맥락 */
const awayBatting: PromptContext = {
  ...homeBatting,
  batter: { ...homeBatting.batter, team: 'KIA' },
  pitcher: { ...homeBatting.pitcher, team: '롯데' },
  battingTeam: 'KIA',
  fieldingTeam: '롯데',
};
const CONTEXTS = [
  { name: '홈 공격', ctx: homeBatting },
  { name: '원정 공격', ctx: awayBatting },
] as const;

function expectedSubject(s: ExpectedSubject, ctx: PromptContext): Subject {
  if (s === 'home') return ctx.battingTeam === ctx.homeName ? 'battingTeam' : 'fieldingTeam';
  if (s === 'away') return ctx.battingTeam === ctx.awayName ? 'battingTeam' : 'fieldingTeam';
  return s;
}

function matches(part: EffectPart, exp: Expectation, ctx: PromptContext): boolean {
  if (exp.knobs || exp.sign) {
    if (part.kind !== 'knob') return false;
    if (exp.knobs && !exp.knobs.includes(part.knob)) return false;
    if (exp.sign && Math.sign(part.strength) !== exp.sign) return false;
  }
  return !exp.subjects || exp.subjects.some((s) => expectedSubject(s, ctx) === part.subject);
}

function caseOk(c: CorpusCase, out: Interpretation, ctx: PromptContext, measured: boolean): boolean {
  if (c.all) return c.all.every((exp) => out.parts.some((part) => matches(part, exp, ctx)));
  if (measured && c.measured && !out.parts.some((part) => part.kind === 'measured' && part.variable === c.measured)) return false;
  return out.parts.some((part) => matches(part, c, ctx));
}

function show(out: Interpretation): string {
  if (out.refused) return '거부';
  return out.parts.map((p) => (p.kind === 'knob' ? `${p.subject}:${p.knob}${p.strength > 0 ? '+' : ''}${p.strength}` : `${p.subject}:${p.variable}=${p.value}`)).join(', ') || '효과 없음';
}

const harmless = TMI_CORPUS.filter((c) => !c.refused);
const sensitive = TMI_CORPUS.filter((c) => c.refused);
const runsWith = (opts: { measuredAvailable: boolean }) =>
  CONTEXTS.flatMap(({ name, ctx }) => TMI_CORPUS.map((c) => ({ c, name, ctx, out: ruleInterpret(c.text, ctx, opts) })));

describe('ruleInterpret — 말뭉치', () => {
  const runs = runsWith(on);

  it('말뭉치 규모: 220개 이상, 민감 40개 이상, 무해한 경계 30개 이상, 가상 이름만', () => {
    expect(TMI_CORPUS.length).toBeGreaterThanOrEqual(220);
    expect(sensitive.length).toBeGreaterThanOrEqual(40);
    expect(TMI_CORPUS.filter((c) => c.group === 'boundary').length).toBeGreaterThanOrEqual(30);
    expect(new Set(TMI_CORPUS.map((c) => c.text)).size).toBe(TMI_CORPUS.length);
  });

  it('무해한 입력은 거부 0건, 모두 효과가 1개 이상(사전에 없는 말도 반영)', () => {
    const refused = runs.filter((r) => !r.c.refused && r.out.refused).map((r) => `${r.name} | ${r.c.text}`);
    const empty = runs.filter((r) => !r.c.refused && !r.out.refused && r.out.parts.length === 0).map((r) => `${r.name} | ${r.c.text}`);
    expect(refused).toEqual([]);
    expect(empty).toEqual([]);
  });

  it('민감 입력은 모두 거부한다', () => {
    const missed = runs.filter((r) => r.c.refused && !r.out.refused).map((r) => `${r.name} | ${r.c.text} → ${show(r.out)}`);
    expect(missed).toEqual([]);
  });

  it('기대(대상·손잡이·부호) 일치 90% 이상 — 어긋난 사례는 목록으로 남긴다', () => {
    const judged = runs.filter((r) => !r.c.refused);
    const misses = judged.filter((r) => !caseOk(r.c, r.out, r.ctx, true)).map((r) => `${r.name} | ${r.c.text} → ${show(r.out)}`);
    const rate = 1 - misses.length / judged.length;
    if (misses.length > 0) console.info(`규칙 해석 일치 ${(rate * 100).toFixed(1)}% (${judged.length - misses.length}/${judged.length})\n${misses.join('\n')}`);
    expect(rate).toBeGreaterThanOrEqual(0.9);
  });

  it('여러 TMI 문장은 절마다 대상이 맞다', () => {
    const multi = runs.filter((r) => r.c.group === 'multi' && r.c.all);
    const misses = multi.filter((r) => !caseOk(r.c, r.out, r.ctx, true)).map((r) => `${r.name} | ${r.c.text} → ${show(r.out)}`);
    expect(misses.length).toBeLessThanOrEqual(1);
  });

  it('결정적: 같은 입력은 같은 결과', () => {
    for (const { c, ctx, out } of runs.slice(0, 120)) expect(ruleInterpret(c.text, ctx, on)).toEqual(out);
  });

  it('모든 결과는 normalizeInterpretation을 그대로 통과한다(최대 3개, 손잡이·대상 조합, 정수 세기, 해설 90자)', () => {
    for (const { out } of runs) {
      expect(out.source).toBe('rules');
      if (out.refused) continue;
      expect(out.parts.length).toBeLessThanOrEqual(3);
      const normalized = normalizeInterpretation(JSON.parse(JSON.stringify(out)));
      expect(normalized?.parts).toEqual(out.parts);
      expect(Array.from(out.comment).length).toBeLessThanOrEqual(90);
      expect(out.comment).not.toBe('');
    }
  });

  it('해설 다양성: 무해한 입력의 서로 다른 해설 문장이 60% 이상', () => {
    const comments = runs.filter((r) => r.name === '홈 공격' && !r.c.refused).map((r) => r.out.comment);
    expect(new Set(comments).size / harmless.length).toBeGreaterThanOrEqual(0.6);
  });

  it('실측 변수를 쓸 수 없으면 손잡이만 낸다', () => {
    for (const { out } of runsWith(off)) expect(out.parts.every((part) => part.kind === 'knob')).toBe(true);
  });
});

// ---------- 규칙 단위 ----------

const ctx = homeBatting;
const partsOf = (text: string, c: PromptContext = ctx, opts = on) => ruleInterpret(text, c, opts).parts;
const knobsOf = (text: string, c: PromptContext = ctx, opts = on) => partsOf(text, c, opts).filter((p): p is KnobPart => p.kind === 'knob');

describe('ruleInterpret — 규칙', () => {
  it('세기: 기본은 사전 세기보다 한 단계 크게, "너무"는 한 단계 더, "살짝"은 사전 세기 그대로(최대 3)', () => {
    expect(knobsOf('김타자 피곤하다')).toMatchObject([{ knob: 'focus', subject: 'batter', strength: -2 }]);
    expect(knobsOf('김타자 너무 피곤하다')).toMatchObject([{ knob: 'focus', subject: 'batter', strength: -3 }]);
    expect(knobsOf('김타자 살짝 피곤하다')).toMatchObject([{ knob: 'focus', subject: 'batter', strength: -1 }]);
  });

  it('부정: 상태는 방향을 뒤집고(flip), 사건은 효과를 없앤다(cancel)', () => {
    expect(knobsOf('박투수 전혀 피곤하지 않다')).toMatchObject([{ knob: 'stamina', subject: 'pitcher', strength: 2 }]);
    expect(knobsOf('김타자 새 배트 안 샀다').every((p) => p.why === FALLBACK_WHY)).toBe(true);
    // 과식 같은 상태 개념은 부정하면 방향이 뒤집힌다
    expect(knobsOf('김타자 짜장면 안 먹었다')).toMatchObject([{ knob: 'focus', subject: 'batter', strength: 2 }]);
  });

  it('같은 표현도 대상에 맞는 손잡이로: 타자는 집중력, 투수는 체력', () => {
    expect(knobsOf('김타자 짜장면 곱빼기 먹었다')).toMatchObject([{ knob: 'focus', subject: 'batter', strength: -2, evidence: 'fun', scope: 'game' }]);
    expect(knobsOf('박투수 짜장면 곱빼기 먹었다')).toMatchObject([{ knob: 'stamina', subject: 'pitcher', strength: -2 }]);
    // 대상 말이 없으면 지금 타자
    expect(knobsOf('짜장면 곱빼기 먹었다')).toMatchObject([{ knob: 'focus', subject: 'batter' }]);
  });

  it('투수 쪽 개념은 대상 말이 없어도 투수에게, 타자에게 걸린 투수 손잡이는 타자 손잡이로 옮긴다', () => {
    expect(knobsOf('제구 난조')).toMatchObject([{ knob: 'control', subject: 'pitcher', strength: -2 }]);
    expect(knobsOf('김타자 제구 난조')).toMatchObject([{ subject: 'batter', strength: -2 }]);
    expect(knobsOf('박투수 불방망이')).toMatchObject([{ knob: 'stuff', subject: 'pitcher', strength: 2 }]);
  });

  it('팀 대상: 공격 팀 선수는 공격 팀, 수비 팀 선수는 수비 팀으로 옮긴다', () => {
    expect(knobsOf('가나원이 늦잠 잤다')[0]).toMatchObject({ subject: 'battingTeam', strength: -2 });
    expect(knobsOf('도레미가 늦잠 잤다')[0]).toMatchObject({ subject: 'fieldingTeam', strength: -2 });
    expect(knobsOf('롯데 팬들 함성')).toMatchObject([{ knob: 'mood', subject: 'battingTeam', strength: 2 }]);
    expect(knobsOf('롯데 팬들 함성', awayBatting)).toMatchObject([{ knob: 'mood', subject: 'fieldingTeam', strength: 2 }]);
  });

  it('환경 손잡이는 누구 이야기든 모두에게', () => {
    expect(knobsOf('박투수 쪽으로 비가 온다')).toMatchObject([{ knob: 'slick', subject: 'everyone', strength: 2 }]);
  });

  it('실측 변수: 숫자가 있으면 그 값, 없으면 기본값이고, 효과 손잡이도 함께 낸다', () => {
    expect(partsOf('오늘 기온 35도')).toEqual([
      expect.objectContaining({ kind: 'measured', variable: 'temp_c', value: 35, subject: 'everyone' }),
      expect.objectContaining({ kind: 'knob', knob: 'carry', subject: 'everyone', strength: 2 }),
    ]);
    expect(partsOf('영하 3도 한파')).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'measured', variable: 'temp_c', value: -3 }),
      expect.objectContaining({ kind: 'knob', knob: 'carry', strength: -2 }),
    ]));
    expect(partsOf('폭염')).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'measured', variable: 'temp_c', value: 32 })]));
    expect(partsOf('원정팀이 버스로 5시간 이동했다')).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'measured', variable: 'travel_km', value: 400, subject: 'fieldingTeam' }),
      expect.objectContaining({ kind: 'knob', knob: 'mood', subject: 'fieldingTeam', strength: -2 }),
    ]));
    expect(partsOf('폭염', ctx, off)).toEqual([expect.objectContaining({ kind: 'knob', knob: 'carry', strength: 2 })]);
  });

  it('여러 절의 같은 손잡이·대상은 더해 ±3에서 자르고, 반대면 지운다', () => {
    expect(knobsOf('박투수 피곤하고 너무 졸리다')).toMatchObject([{ knob: 'stamina', subject: 'pitcher', strength: -3 }]);
    const mixed = knobsOf('박투수 푹 잤는데 늦잠 잤다');
    expect(mixed.some((p) => p.knob === 'stamina' && p.subject === 'pitcher' && p.why !== FALLBACK_WHY)).toBe(false);
  });

  it('최대 3개, 실측이 먼저 그다음 세기가 큰 순서', () => {
    const out = partsOf('박투수 짜장면 먹고 너무 늦잠 자고 로또 당첨, 폭염에 비까지 왔다');
    expect(out).toHaveLength(3);
    expect(out[0].kind).toBe('measured');
    const strengths = out.filter((p): p is KnobPart => p.kind === 'knob').map((p) => Math.abs(p.strength));
    expect([...strengths].sort((a, b) => b - a)).toEqual(strengths);
  });

  it('사전에 없는 말: 문장 분위기(없으면 해시)로 사람은 개인 손잡이, 팀은 mood ±, 이번 타석·상상', () => {
    const plain = ruleInterpret('김타자 오늘 외계인을 만났다', ctx, on);
    expect(plain.parts).toHaveLength(1);
    expect(plain.parts[0]).toMatchObject({ kind: 'knob', subject: 'batter', scope: 'pa', evidence: 'fun', why: FALLBACK_WHY });
    expect(['focus', 'contact', 'eye', 'power']).toContain((plain.parts[0] as KnobPart).knob);
    expect(knobsOf('박투수가 외계인에게 감사 인사')[0]).toMatchObject({ subject: 'pitcher', why: FALLBACK_WHY });
    expect(knobsOf('박투수가 외계인에게 감사 인사')[0].strength).toBeGreaterThan(0);
    expect(knobsOf('롯데 더그아웃이 외계인 때문에 한숨')[0]).toMatchObject({ knob: 'mood', subject: 'battingTeam', why: FALLBACK_WHY });
    expect(knobsOf('롯데 더그아웃이 외계인 때문에 한숨')[0].strength).toBeLessThan(0);
  });

  it('해설: 찾은 표현과 대상 이름을 넣고, 같은 문장은 같은 해설', () => {
    const out = ruleInterpret('박투수가 경기 전 짜장면 곱빼기를 먹었다', ctx, on);
    expect(out.comment).toContain('박투수');
    expect(out.comment).toMatch(/짜장면|곱빼기/);
    expect(ruleInterpret('박투수가 경기 전 짜장면 곱빼기를 먹었다', ctx, on).comment).toBe(out.comment);
  });

  it('거부: 사람에게 걸린 민감 주제와 주체를 모르는 민감 주제(AI 없는 경로)는 refused, 넘겨받은 안전 판정을 따른다', () => {
    expect(ruleInterpret('김타자가 술을 마셨다', ctx, on)).toMatchObject({ source: 'rules', refused: true, parts: [], comment: '' });
    expect(ruleInterpret('어제 술 마셨다', ctx, on)).toMatchObject({ refused: true });
    expect(ruleInterpret('관중이 맥주를 마신다', ctx, on).refused).toBe(false);
    const allow = { level: 'allow', category: null, reason: '', matched: null } as const;
    expect(ruleInterpret('김타자가 술을 마셨다', ctx, { ...on, safety: allow }).refused).toBe(false);
  });
});

describe('rulesVerdict', () => {
  const evidence = fixtureEvidence();
  const knobOnly = (text: string): Interpretation => ruleInterpret(text, ctx, off);

  it('evidence가 null이면 unmeasurable', () => {
    expect(rulesVerdict('폭염', knobOnly('폭염'), null)).toMatchObject({
      source: 'rules', variables: [], verdict: 'unmeasurable', headline: '판정 데이터가 아직 없어요',
    });
  });

  it('후보가 없으면 기록으로 잴 수 없는 변수', () => {
    expect(rulesVerdict('짜장면을 먹었다', knobOnly('짜장면을 먹었다'), evidence)).toEqual({
      source: 'rules',
      variables: [],
      verdict: 'unmeasurable',
      headline: '기록으로 잴 수 없는 변수예요',
      body: '이런 이야기는 경기 기록에 남지 않아 실제 효과를 잴 수 없어요.',
    });
    // evidence에 항목이 없는 변수(wind_ms)도 잴 수 없다
    expect(rulesVerdict('강풍', ruleInterpret('강풍', ctx, on), evidence)).toMatchObject({ variables: [], verdict: 'unmeasurable' });
  });

  it('해석의 실측 변수 먼저, 그다음 키워드 변수. 판정·문구는 첫 변수 item', () => {
    const ai: Interpretation = {
      source: 'ai', refused: false, reason: '', comment: '',
      parts: [{ kind: 'measured', variable: 'temp_c', value: 33, subject: 'everyone', why: '' }],
    };
    expect(rulesVerdict('땡볕 낮 경기', ai, evidence)).toEqual({
      source: 'rules',
      variables: ['temp_c', 'day_game'],
      verdict: 'maybe',
      headline: '있을 수도, 없을 수도 있어요',
      body: evidence.items[0].note,
    });
    expect(rulesVerdict('땡볕 낮 경기', knobOnly('땡볕 낮 경기'), evidence)).toEqual({
      source: 'rules',
      variables: ['day_game'],
      verdict: 'useless',
      headline: '쓸모없는 변수로 판정됐어요',
      body: evidence.items[1].note,
    });
  });

  it('real 판정 문구', () => {
    const realEvidence: EvidenceData = { ...evidence, items: evidence.items.map((item) => ({ ...item, verdict: 'real' as const })) };
    expect(rulesVerdict('폭염', knobOnly('폭염'), realEvidence)).toMatchObject({ verdict: 'real', headline: '기록으로 확인된 효과예요' });
  });
});
