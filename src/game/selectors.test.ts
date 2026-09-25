import { describe, expect, it } from 'vitest';
import { startNextHalf, type AfterEvent } from '../engine';
import { fixtureSetup } from '../test/fixtures/appData';
import type { Interpretation, TmiEntry } from '../types/domain';
import { battingWin, butterflyPp, entryChips, expectedSwing, selectTiers, type GaugeLike } from './selectors';

const setup = fixtureSetup();
const SCENE_STATE = setup.situation.state;
/** 9회말이 3아웃으로 끝난 뒤 10회초: 원정 a4 타석, 홈 불펜 투구 */
const TENTH_TOP = startNextHalf({ ...SCENE_STATE, outs: 3, bases: 0 });

const BASE: GaugeLike = { batterWin: 0.35, inningScore: 0.4, expRuns: 1.2, winHome: 0.62, tie: 0.03, winAway: 0.35 };
const TMI: GaugeLike = { batterWin: 0.356, inningScore: 0.4071, expRuns: 1.234, winHome: 0.626, tie: 0.035, winAway: 0.339 };

describe('battingWin', () => {
  it('공격 진영의 승리확률을 고른다', () => {
    expect(battingWin(TMI, 'home')).toBe(0.626);
    expect(battingWin(TMI, 'away')).toBe(0.339);
  });
});

describe('selectTiers', () => {
  it('타석·이닝·경기 세 줄의 라벨·값·차이 문구 (말 공격 장면)', () => {
    const tiers = selectTiers(setup, SCENE_STATE, BASE, TMI);
    expect(tiers.map((t) => t.id)).toEqual(['pa', 'inning', 'game']);
    const [pa, inning, game] = tiers;

    expect(pa).toMatchObject({
      title: '타석 승부',
      leftLabel: '홈타자6 출루',
      leftValue: 0.356,
      rightLabel: '원정투수 아웃',
      extra: null,
      deltaText: '+0.6%p',
    });
    expect(pa.rightValue).toBeCloseTo(0.644, 12);
    expect(pa.delta).toBeCloseTo(0.006, 12);

    expect(inning).toMatchObject({
      title: '이닝 승부',
      leftLabel: '롯데 득점',
      leftValue: 0.4071,
      rightLabel: 'KIA 무실점',
      extra: '기대 득점 1.23점',
      deltaText: '+0.7%p',
    });
    expect(inning.rightValue).toBeCloseTo(0.5929, 12);
    expect(inning.delta).toBeCloseTo(0.0071, 12);

    expect(game).toMatchObject({
      title: '경기 승부',
      leftLabel: '롯데 승리',
      leftValue: 0.626,
      rightLabel: 'KIA 승리',
      rightValue: 0.339,
      extra: '무승부 3.5%',
      deltaText: '+0.6%p',
    });
    expect(game.delta).toBeCloseTo(0.006, 12);
  });

  it('기대 득점이 없으면 이닝 extra는 null, 차이가 없으면 ±0.00%p, 줄어들면 −', () => {
    expect(selectTiers(setup, SCENE_STATE, BASE, { ...TMI, expRuns: undefined })[1].extra).toBeNull();
    expect(selectTiers(setup, SCENE_STATE, BASE, BASE).map((t) => t.deltaText)).toEqual(['±0.00%p', '±0.00%p', '±0.00%p']);
    expect(selectTiers(setup, SCENE_STATE, TMI, BASE).map((t) => t.deltaText)).toEqual(['−0.6%p', '−0.7%p', '−0.6%p']);
  });

  it('반이닝이 바뀌면 그 상태의 공격 팀·타자·불펜 투수 기준으로 쓴다', () => {
    const [pa, inning, game] = selectTiers(setup, TENTH_TOP, BASE, TMI);
    expect(pa).toMatchObject({ leftLabel: '원정타자4 출루', rightLabel: '롯데 불펜 아웃' });
    expect(inning).toMatchObject({ leftLabel: 'KIA 득점', rightLabel: '롯데 무실점' });
    expect(game).toMatchObject({
      leftLabel: 'KIA 승리',
      leftValue: 0.339,
      rightLabel: '롯데 승리',
      rightValue: 0.626,
      deltaText: '−1.1%p',
    });
    expect(game.delta).toBeCloseTo(-0.011, 12);
  });
});

describe('butterflyPp', () => {
  it('공격 팀 승리확률 차이를 %p 숫자로 돌려준다', () => {
    expect(butterflyPp(BASE, TMI, 'home')).toBeCloseTo(0.6, 10);
    expect(butterflyPp(TMI, BASE, 'home')).toBeCloseTo(-0.6, 10);
    expect(butterflyPp(BASE, TMI, 'away')).toBeCloseTo(-1.1, 10);
    expect(butterflyPp(BASE, BASE, 'home')).toBe(0);
  });
});

describe('entryChips', () => {
  const tmiEntry = (over: Partial<Interpretation>): TmiEntry => ({
    id: 'tmi-1',
    text: '테스트 문장',
    interpretation: { source: 'ai', refused: false, reason: '', comment: '', parts: [], ...over },
  });

  it('손잡이는 "대상 손잡이 세기화살표", 근거 등급이 톤이다', () => {
    const chips = entryChips(
      tmiEntry({
        parts: [
          { kind: 'knob', knob: 'stamina', subject: 'pitcher', strength: -2, scope: 'game', evidence: 'plausible', why: '' },
          { kind: 'knob', knob: 'power', subject: 'battingTeam', strength: 3, scope: 'pa', evidence: 'fun', why: '' },
          { kind: 'knob', knob: 'glare', subject: 'everyone', strength: 1, scope: 'game', evidence: 'measured', why: '' },
        ],
      }),
    );
    expect(chips).toEqual([
      { label: '투수 체력 ▼▼', tone: 'plausible' },
      { label: '공격팀 파워 ▲▲▲', tone: 'fun' },
      { label: '모두 시야 방해 ▲', tone: 'measured' },
    ]);
  });

  it('실측 변수는 "변수 라벨 값단위", 켜고 끄는 변수는 라벨(0이면 아님), 톤 measured', () => {
    const chips = entryChips(
      tmiEntry({
        parts: [
          { kind: 'measured', variable: 'temp_c', value: 33, subject: 'everyone', why: '' },
          { kind: 'measured', variable: 'wind_ms', value: 4.5, subject: 'everyone', why: '' },
          { kind: 'measured', variable: 'day_game', value: 1, subject: 'everyone', why: '' },
          { kind: 'measured', variable: 'weekend', value: 0, subject: 'everyone', why: '' },
        ],
      }),
    );
    expect(chips).toEqual([
      { label: '기온 33°C', tone: 'measured' },
      { label: '바람 세기 4.5m/s', tone: 'measured' },
      { label: '낮 경기', tone: 'measured' },
      { label: '주말 경기 아님', tone: 'measured' },
    ]);
  });

  it('거부면 refused 칩 하나, 효과 조각이 없으면 빈 목록', () => {
    const refused = tmiEntry({
      refused: true,
      reason: '실존 선수에게 민감한 내용이라 계산하지 않았어요.',
      parts: [{ kind: 'knob', knob: 'focus', subject: 'batter', strength: -3, scope: 'game', evidence: 'fun', why: '' }],
    });
    expect(entryChips(refused)).toEqual([{ label: '계산 거부', tone: 'refused' }]);
    expect(entryChips(tmiEntry({ parts: [] }))).toEqual([]);
  });
});

describe('expectedSwing', () => {
  type SwingInput = Parameters<typeof expectedSwing>[0];
  const after = (winHome: number, tie: number, winAway: number): AfterEvent => ({ winHome, tie, winAway, inningScore: 0.5 });
  /** 사건 순서 [K, BB, HR, 3B, 2B, 1B, OUT], 합 1 */
  const PA = new Float64Array([0.2, 0.1, 0.03, 0.01, 0.05, 0.16, 0.45]);
  /** 홈 공격, 지금 B = 0.55 + 0.06 / 2 = 0.58 */
  const HOME_AT_BAT: SwingInput = {
    batSide: 'home',
    pa: PA,
    winHome: 0.55,
    tie: 0.06,
    winAway: 0.39,
    after: [
      after(0.5, 0.06, 0.44), // K   B 0.53   |ΔB| 0.05
      after(0.61, 0.07, 0.32), // BB  B 0.645  |ΔB| 0.065
      after(0.8, 0.04, 0.16), // HR  B 0.82   |ΔB| 0.24
      after(0.72, 0.05, 0.23), // 3B  B 0.745  |ΔB| 0.165
      after(0.68, 0.06, 0.26), // 2B  B 0.71   |ΔB| 0.13
      after(0.63, 0.06, 0.31), // 1B  B 0.66   |ΔB| 0.08
      after(0.51, 0.05, 0.44), // OUT B 0.535  |ΔB| 0.045
    ],
  };

  it('after가 모두 지금과 같으면 0', () => {
    const still: SwingInput = { ...HOME_AT_BAT, after: HOME_AT_BAT.after.map(() => after(0.55, 0.06, 0.39)) };
    expect(expectedSwing(still)).toBe(0);
  });

  it('손으로 계산한 사건 7개 합성 평가와 1e-12 이내로 같다', () => {
    // 100 × (0.2×0.05 + 0.1×0.065 + 0.03×0.24 + 0.01×0.165 + 0.05×0.13 + 0.16×0.08 + 0.45×0.045) = 100 × 0.0649
    const swing = expectedSwing(HOME_AT_BAT);
    expect(swing).not.toBeNull();
    expect(Math.abs((swing as number) - 6.49)).toBeLessThan(1e-12);
  });

  it('원정 공격과 홈 공격이 대칭이다', () => {
    const mirror = (ev: SwingInput): SwingInput => ({
      ...ev,
      batSide: ev.batSide === 'home' ? 'away' : 'home',
      winHome: ev.winAway,
      winAway: ev.winHome,
      after: ev.after.map((a) => ({ ...a, winHome: a.winAway, winAway: a.winHome })),
    });
    expect(Math.abs((expectedSwing(mirror(HOME_AT_BAT)) as number) - 6.49)).toBeLessThan(1e-12);
    // 공격 진영의 값을 쓴다: 원정 승리만 움직인 인위 입력이면 원정 공격일 때만 움직임이 있다
    const awayMoves: SwingInput = { ...HOME_AT_BAT, after: HOME_AT_BAT.after.map(() => after(0.55, 0.06, 0.49)) };
    expect(expectedSwing({ ...awayMoves, batSide: 'away' })).toBeCloseTo(10, 12);
    expect(expectedSwing(awayMoves)).toBe(0);
  });

  it('무승부는 절반으로 센다', () => {
    // 지금 B = 0.5, 뒤 B = 0.5 + 0.2 / 2 = 0.6. 무승부를 통째로 세면 20, 빼면 0
    const even: SwingInput = {
      batSide: 'home',
      pa: PA,
      winHome: 0.5,
      tie: 0,
      winAway: 0.5,
      after: Array.from({ length: 7 }, () => after(0.5, 0.2, 0.3)),
    };
    expect(expectedSwing(even)).toBeCloseTo(10, 12);
  });

  it('반올림하지 않은 유한한 0 이상의 수다', () => {
    const one: SwingInput = {
      batSide: 'away',
      pa: PA,
      winHome: 0.5,
      tie: 0,
      winAway: 0.5,
      after: [after(0.4876544, 0, 0.5123456), ...Array.from({ length: 6 }, () => after(0.5, 0, 0.5))],
    };
    const swing = expectedSwing(one) as number;
    // 100 × 0.2 × 0.0123456
    expect(swing).toBeCloseTo(0.246912, 12);
    expect(Number.isFinite(swing) && swing >= 0).toBe(true);
  });

  it('after가 비면(detail: false 평가) null', () => {
    expect(expectedSwing({ ...HOME_AT_BAT, after: [] })).toBeNull();
  });
});
