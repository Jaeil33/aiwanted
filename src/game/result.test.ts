import { describe, expect, it } from 'vitest';
import type { GameState, KnobPart, MeasuredPart } from '../types/domain';
import { deciderLine, effectLabel, splitThousand, tmiShortLabel } from './result';
import type { PlayLogEntry } from './session';

const TOP9: GameState = { inning: 9, half: 0, outs: 2, bases: 7, away: 3, home: 3, slotAway: 2, slotHome: 4 };

function entry(index: number, inning: number, half: 0 | 1, headline: string, away: number, home: number): PlayLogEntry {
  return { index, inning, half, batterName: '김타자', pitcherName: '박투수', headline, score: { away, home }, wpHomeAfter: null, highlight: false };
}

describe('splitThousand', () => {
  it('확률을 합 1,000인 정수로 나눈다(최대 잔여법)', () => {
    expect(splitThousand([0.5426, 0.1341, 0.3233])).toEqual([543, 134, 323]);
    expect(splitThousand([0.547, 0.1327, 0.3203]).reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('잔여가 같으면 앞 칸이 먼저 받는다', () => {
    expect(splitThousand([1, 1, 1])).toEqual([334, 333, 333]);
  });

  it('합이 1이 아니어도 비율로 나누고, 합이 0이거나 숫자가 아니면 모두 0', () => {
    expect(splitThousand([2, 2])).toEqual([500, 500]);
    expect(splitThousand([0, 0, 0])).toEqual([0, 0, 0]);
    expect(splitThousand([0.5, Number.NaN, 0.5])).toEqual([0, 0, 0]);
    expect(splitThousand([0.5, -0.1, 0.6])).toEqual([0, 0, 0]);
  });
});

describe('deciderLine', () => {
  const title = '9회초 2사 만루';

  it('장면 반이닝 득점 + 마지막 반이닝 삼자범퇴 (시안 문장)', () => {
    const log = [
      entry(0, 9, 0, '2타점 적시타', 5, 3),
      entry(1, 9, 0, '뜬공 아웃', 5, 3),
      entry(2, 9, 1, '삼진', 5, 3),
      entry(3, 9, 1, '땅볼 아웃', 5, 3),
      entry(4, 9, 1, '직선타 아웃', 5, 3),
    ];
    const final = { winner: 'away' as const, walkoff: false, state: { ...TOP9, half: 1 as const, outs: 3, bases: 0, away: 5, home: 3 } };
    expect(deciderLine({ title, start: TOP9, log, final })).toBe('9회초 2사 만루에서 2점, 9회말 삼자범퇴');
  });

  it('제목의 쉼표 뒤 설명은 뺀다', () => {
    const log = [entry(0, 9, 0, '삼진', 3, 3), entry(1, 9, 1, '솔로 홈런!', 3, 4)];
    const final = { winner: 'home' as const, walkoff: true, state: { ...TOP9, half: 1 as const, away: 3, home: 4 } };
    expect(deciderLine({ title: '9회초 2사 만루, 대타', start: TOP9, log, final })).toBe('9회초 2사 만루에서 무득점, 9회말 끝내기 솔로 홈런');
  });

  it('장면 반이닝에서 끝내기면 한 문장으로, 헤드라인에 끝내기가 없으면 붙인다', () => {
    const start: GameState = { ...TOP9, half: 1 };
    const walk = [entry(0, 9, 1, '끝내기 만루 홈런!', 3, 7)];
    const final = { winner: 'home' as const, walkoff: true, state: { ...start, away: 3, home: 7 } };
    expect(deciderLine({ title: '9회말 2사 만루', start, log: walk, final })).toBe('9회말 2사 만루에서 끝내기 만루 홈런');
    const dp = [entry(0, 9, 1, '병살타', 3, 4)];
    expect(deciderLine({ title: '9회말 1사 1·3루', start, log: dp, final: { ...final, state: { ...start, home: 4 } } })).toBe('9회말 1사 1·3루에서 끝내기 병살타');
  });

  it('마지막 반이닝이 셋 다 아웃이 아니면 삼자범퇴가 아니라 무득점', () => {
    const log = [
      entry(0, 9, 0, '삼진', 3, 3),
      entry(1, 9, 1, '안타', 3, 3),
      entry(2, 9, 1, '병살타', 3, 3),
      entry(3, 9, 1, '뜬공 아웃', 3, 3),
    ];
    const final = { winner: 'tie' as const, walkoff: false, state: { ...TOP9, inning: 11 } };
    // 무승부는 마지막 문장을 대신하고, 이닝은 끝난 상태의 이닝
    expect(deciderLine({ title, start: TOP9, log, final })).toBe('9회초 2사 만루에서 무득점, 11회 무승부');
    const notOver = { winner: 'away' as const, walkoff: false, state: TOP9 };
    expect(deciderLine({ title, start: TOP9, log, final: notOver })).toBe('9회초 2사 만루에서 무득점, 9회말 무득점');
  });

  it('여러 반이닝을 지나면 마지막 반이닝 득점만 센다', () => {
    const log = [
      entry(0, 9, 0, '삼진', 3, 3),
      entry(1, 9, 1, '땅볼 아웃', 3, 3),
      entry(2, 10, 0, '2점 홈런!', 5, 3),
      entry(3, 10, 0, '뜬공 아웃', 5, 3),
      entry(4, 10, 1, '솔로 홈런!', 5, 4),
      entry(5, 10, 1, '삼진', 5, 4),
    ];
    const final = { winner: 'away' as const, walkoff: false, state: { ...TOP9, inning: 10, half: 1 as const, away: 5, home: 4 } };
    expect(deciderLine({ title, start: TOP9, log, final })).toBe('9회초 2사 만루에서 무득점, 10회말 1점');
    // 팀 이름을 주면 마지막 반이닝 득점에 어느 팀 점수인지 붙인다(이긴 팀이 아닐 수 있다)
    expect(deciderLine({ title, start: TOP9, log, final, teams: { away: 'KIA', home: '롯데' } })).toBe('9회초 2사 만루에서 무득점, 10회말 롯데 1점');
  });

  it('11회 무승부, 기록이 없으면 상황만', () => {
    const start: GameState = { ...TOP9, inning: 11, half: 1, away: 2, home: 1 };
    const log = [entry(0, 11, 1, '땅볼 타점', 2, 2), entry(1, 11, 1, '삼진', 2, 2)];
    const final = { winner: 'tie' as const, walkoff: false, state: { ...start, away: 2, home: 2 } };
    expect(deciderLine({ title: '11회말 1사 1·3루, 마지막 이닝', start, log, final })).toBe('11회말 1사 1·3루에서 1점, 11회 무승부');
    expect(deciderLine({ title, start: TOP9, log: [], final })).toBe('9회초 2사 만루');
  });

  it('제목이 비어 있으면 시작 상태의 이닝을 쓴다', () => {
    const log = [entry(0, 9, 0, '뜬공 아웃', 3, 3)];
    const final = { winner: 'home' as const, walkoff: false, state: TOP9 };
    expect(deciderLine({ title: ' ', start: TOP9, log, final })).toBe('9회초에서 무득점');
  });
});

describe('tmiShortLabel', () => {
  it('앞의 선수 이름과 조사를 떼고 짧게 줄인다', () => {
    expect(tmiShortLabel('박투수가 짜장면 곱빼기', ['김타자', '박투수'])).toBe('짜장면 곱빼기');
    expect(tmiShortLabel('김타자 어젯밤 3시간 잤다', ['김타자'])).toBe('어젯밤 3시간 잤다');
    expect(tmiShortLabel('박투수가 경기 전 짜장면 곱빼기를 먹었다', ['박투수'])).toBe('경기 전 짜장면…');
  });

  it('이름 뒤에 띄어쓰기가 없으면 떼지 않고, 떼고 나서 비면 원문', () => {
    expect(tmiShortLabel('박투수의짜장면', ['박투수'])).toBe('박투수의짜장면');
    // 짧은 이름이 긴 이름의 앞부분이어도 조사가 맞는 이름을 뗀다
    expect(tmiShortLabel('투수왕이 짜장면 곱빼기', ['투수', '투수왕'])).toBe('짜장면 곱빼기');
    expect(tmiShortLabel('박투수', ['박투수'])).toBe('박투수');
    expect(tmiShortLabel('  폭염 경기  ', [])).toBe('폭염 경기');
    expect(tmiShortLabel('오늘 기온 35도, 폭염', [])).toBe('오늘 기온 35도…');
    expect(tmiShortLabel('오늘 기온 35도, 폭염', [], 20)).toBe('오늘 기온 35도, 폭염');
  });
});

describe('effectLabel', () => {
  const knob = (over: Partial<KnobPart>): KnobPart => ({ kind: 'knob', knob: 'stamina', subject: 'pitcher', strength: -1, scope: 'game', evidence: 'fun', why: '', ...over });
  const measured = (over: Partial<MeasuredPart>): MeasuredPart => ({ kind: 'measured', variable: 'temp_c', value: 35, subject: 'everyone', why: '', ...over });

  it('손잡이: 대상 손잡이 화살표', () => {
    expect(effectLabel(knob({}))).toBe('투수 체력 ↓');
    expect(effectLabel(knob({ knob: 'focus', subject: 'batter', strength: 2 }))).toBe('타자 집중력 ↑');
  });

  it('환경·모두는 대상을 빼고, 팀 손잡이는 "팀"을 겹쳐 쓰지 않는다', () => {
    expect(effectLabel(knob({ knob: 'carry', subject: 'everyone', strength: 2 }))).toBe('타구 비거리 ↑');
    expect(effectLabel(knob({ knob: 'mood', subject: 'battingTeam', strength: -1 }))).toBe('공격팀 분위기 ↓');
  });

  it('실측 변수: 값과 단위, 지표 변수는 이름(0이면 아님)', () => {
    expect(effectLabel(measured({}))).toBe('기온 35°C');
    expect(effectLabel(measured({ value: 7.5, variable: 'wind_ms' }))).toBe('바람 세기 7.5m/s');
    expect(effectLabel(measured({ variable: 'day_game', value: 1 }))).toBe('낮 경기');
    expect(effectLabel(measured({ variable: 'day_game', value: 0 }))).toBe('낮 경기 아님');
  });
});
