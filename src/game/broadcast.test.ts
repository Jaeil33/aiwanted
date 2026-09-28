import { describe, expect, it } from 'vitest';
import { fixtureSetup } from '../test/fixtures/appData';
import type { GameState, TmiEntry } from '../types/domain';
import type { PlayLogEntry } from './session';
import { callFactsOf, deltaText, sparkSeries, tierReadout, tmiPill, type SparkPoint } from './broadcast';
import type { GaugeLike } from './selectors';

const setup = fixtureSetup(); // 9회말 2사 만루, 홈 롯데 공격, 홈타자6 vs 원정투수
const START = setup.situation.state;
const BASE: GaugeLike = { batterWin: 0.4, inningScore: 0.35, expRuns: 0.9, winHome: 0.6, tie: 0.1, winAway: 0.3 };
const TMI: GaugeLike = { batterWin: 0.42, inningScore: 0.37, expRuns: 0.95, winHome: 0.62, tie: 0.09, winAway: 0.29 };

const entry = (parts: TmiEntry['interpretation']['parts'], refused = false): TmiEntry => ({
  id: 'tmi-1',
  text: '원정투수가 경기 전 짜장면 곱빼기를 먹었다',
  interpretation: { source: 'rules', refused, reason: refused ? '민감한 내용' : '', comment: '', parts },
});

describe('tierReadout', () => {
  it('경기: 장면 공격 팀 승리확률(무승부를 더하지 않는다), 막대는 공격 승·무승부·수비 승, 기준선은 TMI 없음', () => {
    const r = tierReadout({ tier: 'game', setup, state: START, base: BASE, tmi: TMI });
    expect(r.label).toBe('롯데 승리확률');
    expect(r.rightLabel).toBe('KIA');
    expect(r.value).toBe(0.62);
    expect(r.base).toBe(0.6);
    expect(r.deltaPp).toBeCloseTo(2, 10);
    expect(r.bar).toEqual({ left: 0.62, tie: 0.09, right: 0.29, ghost: 0.6, leftColor: setup.teamColors.home, rightColor: setup.teamColors.away });
    expect(r.sub).toEqual(['무승부 9.0%', 'KIA 29.0%']);
  });

  it('이닝: 지금 공격 팀의 이번 이닝 득점확률과 기대 득점 변화', () => {
    const r = tierReadout({ tier: 'inning', setup, state: START, base: BASE, tmi: TMI });
    expect(r.label).toBe('롯데 이번 이닝 득점확률');
    expect(r.rightLabel).toBe('KIA 무실점');
    expect(r.value).toBe(0.37);
    expect(r.base).toBe(0.35);
    expect(r.bar.tie).toBe(0);
    expect(r.bar.right).toBeCloseTo(0.63, 10);
    expect(r.sub).toEqual(['기대 득점 0.90→0.95점']);
  });

  it('타석: 지금 타자 출루확률과 투수 아웃 확률', () => {
    const r = tierReadout({ tier: 'pa', setup, state: START, base: BASE, tmi: TMI });
    expect(r.label).toBe('홈타자6 출루확률');
    expect(r.rightLabel).toBe('원정투수 아웃');
    expect(r.value).toBe(0.42);
    expect(r.sub).toEqual(['원정투수 아웃 58.0%']);
  });

  it('반이닝이 바뀌어도 경기 줄은 장면 공격 팀, 이닝·타석 줄은 지금 공격 팀·타자', () => {
    const top10: GameState = { ...START, inning: 10, half: 0, outs: 0, bases: 0, slotAway: 0 };
    expect(tierReadout({ tier: 'game', setup, state: top10, base: BASE, tmi: TMI }).label).toBe('롯데 승리확률');
    const inning = tierReadout({ tier: 'inning', setup, state: top10, base: BASE, tmi: TMI });
    expect(inning.label).toBe('KIA 이번 이닝 득점확률');
    expect(inning.rightLabel).toBe('롯데 무실점');
    expect(inning.bar.leftColor).toBe(setup.teamColors.away);
    expect(tierReadout({ tier: 'pa', setup, state: top10, base: BASE, tmi: TMI }).label).toBe('원정타자1 출루확률');
  });

  it('기대 득점이 없으면 이닝 보조 줄을 비운다', () => {
    const noRuns = { ...TMI, expRuns: undefined };
    expect(tierReadout({ tier: 'inning', setup, state: START, base: BASE, tmi: noRuns }).sub).toEqual([]);
  });
});

describe('deltaText', () => {
  it('시안 표기: 1%p 미만은 소수 둘째 자리, 이상은 첫째 자리, 0.005 미만·숫자 아님은 ±0.00', () => {
    expect(deltaText(0.41)).toBe('+0.41%p');
    expect(deltaText(-1.234)).toBe('−1.2%p');
    expect(deltaText(0.004)).toBe('±0.00%p');
    expect(deltaText(Number.NaN)).toBe('±0.00%p');
  });
});

describe('tmiPill', () => {
  it('손잡이: "투수 체력 ↓"와 근거 등급', () => {
    const pill = tmiPill(entry([{ kind: 'knob', knob: 'stamina', subject: 'pitcher', strength: -1, scope: 'game', evidence: 'fun', why: '' }]));
    expect(pill).toEqual({ id: 'tmi-1', text: '원정투수가 경기 전 짜장면 곱빼기를 먹었다', effect: '투수 체력 ↓', tone: 'fun' });
  });

  it('실측 변수는 값과 단위, 해당 여부 변수는 이름, 둘 이상이면 "외 N"', () => {
    expect(tmiPill(entry([{ kind: 'measured', variable: 'temp_c', value: 35, subject: 'everyone', why: '' }]))).toMatchObject({ effect: '기온 35°C', tone: 'measured' });
    const two = tmiPill(
      entry([
        { kind: 'measured', variable: 'day_game', value: 1, subject: 'everyone', why: '' },
        { kind: 'knob', knob: 'focus', subject: 'batter', strength: 2, scope: 'pa', evidence: 'plausible', why: '' },
      ]),
    );
    expect(two).toMatchObject({ effect: '낮 경기 외 1', tone: 'plausible' });
  });

  it('효과가 없으면 "효과 없음", 거부면 "계산 안 함"', () => {
    expect(tmiPill(entry([]))).toMatchObject({ effect: '효과 없음', tone: 'none' });
    expect(tmiPill(entry([], true))).toMatchObject({ effect: '계산 안 함', tone: 'refused' });
  });
});

describe('sparkSeries', () => {
  const at = (paIndex: number, inning: number, half: 0 | 1, winHome: number, inningScore: number, batterWin: number): SparkPoint => ({
    paIndex,
    inning,
    half,
    tmi: { ...TMI, winHome, inningScore, batterWin },
  });
  const points = [at(0, 9, 1, 0.6, 0.3, 0.4), at(0, 9, 1, 0.65, 0.33, 0.45), at(1, 10, 0, 0.5, 0.2, 0.3), at(2, 10, 0, 0.45, 0.18, 0.28)];

  it('경기는 판 전체의 장면 공격 팀 승리확률, 이닝은 같은 반이닝, 타석은 같은 타석만', () => {
    expect(sparkSeries(points, 'game', setup, { paIndex: 2, inning: 10, half: 0 })).toEqual([0.6, 0.65, 0.5, 0.45]);
    expect(sparkSeries(points, 'inning', setup, { paIndex: 2, inning: 10, half: 0 })).toEqual([0.2, 0.18]);
    expect(sparkSeries(points, 'pa', setup, { paIndex: 0, inning: 9, half: 1 })).toEqual([0.4, 0.45]);
  });
});


/*
 * 23-commentary step 2: 끝난 타석 하나를 자막 재료로 옮긴다.
 * 확률은 담지 않는다 — 자막은 숫자를 말하지 않는다(CLAUDE.md CRITICAL).
 */
describe('callFactsOf', () => {
  const log = (over: Partial<PlayLogEntry> = {}): PlayLogEntry => ({
    index: 0,
    inning: 9,
    half: 1,
    batterName: '홈타자6',
    pitcherName: '원정투수',
    headline: '2타점 적시 2루타',
    score: { away: START.away, home: START.home + 2 },
    wpHomeAfter: 0.9,
    highlight: true,
    ...over,
  });
  const stamina = entry([{ kind: 'knob', knob: 'stamina', subject: 'pitcher', strength: -1, scope: 'game', evidence: 'fun', why: '' }]);

  it('마지막 타석의 이닝·타자·투수·결과·점수를 옮긴다', () => {
    const facts = callFactsOf(setup, [log()], [stamina])!;
    expect(facts).toMatchObject({
      inningText: '9회말',
      batter: '홈타자6',
      pitcher: '원정투수',
      battingTeam: '롯데',
      fieldingTeam: 'KIA',
      result: '2타점 적시 2루타',
      runs: 2,
      score: { away: START.away, home: START.home + 2 },
      awayName: 'KIA',
      homeName: '롯데',
    });
  });

  it('점수는 직전 타석과의 차이다. 첫 타석은 장면 시작 점수와 견준다', () => {
    const first = log({ index: 0, score: { away: START.away, home: START.home } });
    expect(callFactsOf(setup, [first], [])!.runs).toBe(0);
    const second = log({ index: 1, score: { away: START.away, home: START.home + 3 } });
    expect(callFactsOf(setup, [first, second], [])!.runs).toBe(3);
  });

  it('확률을 담지 않는다', () => {
    expect(Object.keys(callFactsOf(setup, [log()], [stamina])!)).not.toContain('wpHomeAfter');
    expect(JSON.stringify(callFactsOf(setup, [log()], [stamina]))).not.toContain('0.9');
  });

  it('걸린 TMI는 문장과 효과 한 줄로 싣는다', () => {
    expect(callFactsOf(setup, [log()], [stamina])!.tmis).toEqual([
      { text: '원정투수가 경기 전 짜장면 곱빼기를 먹었다', effect: '투수 체력 ↓', favors: 'batter' },
    ]);
  });

  it('거부된 TMI는 빼고, 그 타석에 안 걸린 타석 한정 TMI도 뺀다', () => {
    const refused = { ...entry([], true), id: 'tmi-2' };
    const paOnly: TmiEntry = {
      ...entry([{ kind: 'knob', knob: 'focus', subject: 'batter', strength: -1, scope: 'pa', evidence: 'fun', why: '' }]),
      id: 'tmi-3',
      paIndex: 5,
    };
    const facts = callFactsOf(setup, [log()], [stamina, refused, paOnly])!;
    expect(facts.tmis.map((t: { effect: string }) => t.effect)).toEqual(['투수 체력 ↓']);
  });

  it('경기 내내 가는 TMI는 어느 타석에서 걸었든 함께 부른다', () => {
    const earlier: TmiEntry = { ...stamina, id: 'tmi-9', paIndex: 3 };
    expect(callFactsOf(setup, [log({ index: 7 })], [earlier])!.tmis).toHaveLength(1);
  });

  it('끝난 타석이 없으면 null', () => {
    expect(callFactsOf(setup, [], [stamina])).toBeNull();
  });
});
