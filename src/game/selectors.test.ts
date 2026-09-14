import { describe, expect, it } from 'vitest';
import { startNextHalf } from '../engine';
import { fixtureAppData } from '../test/fixtures/appData';
import type { Interpretation, TmiEntry } from '../types/domain';
import { buildSceneSetup } from './scene';
import { battingWin, butterflyPp, entryChips, selectTiers, type GaugeLike } from './selectors';

const setup = buildSceneSetup(fixtureAppData, 'fixture-walkoff');
const SCENE_STATE = setup.scene.state;
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
