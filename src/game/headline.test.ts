import { describe, expect, it } from 'vitest';
import { EV } from '../domain/events';
import { createRng } from '../engine';
import type { TmiEntry } from '../types/domain';
import { actualResultText, eventValue, gradeOf, oddsHeadline, statLine, thousandSplit, winLine } from './headline';

describe('actualResultText', () => {
  it('"이름 : 결과"에서 결과만, 괄호 설명은 뺀다', () => {
    expect(actualResultText('김타자 : 우익수 앞 1루타')).toBe('우익수 앞 1루타');
    expect(actualResultText('김타자 : 좌중간 뒤 홈런 (홈런거리:130M)')).toBe('좌중간 뒤 홈런');
    expect(actualResultText('볼넷')).toBe('볼넷');
  });
});

describe('statLine', () => {
  it('타자는 타율·OPS, 투수는 ERA·WHIP', () => {
    expect(statLine({ kind: 'H', line: { avg: 0.265, obp: 0.344, slg: 0.338 } }, 'H')).toBe('타율 .265 · OPS .682');
    expect(statLine({ kind: 'H', line: { avg: 0.312, obp: 0.41, slg: 0.62 } }, 'H')).toBe('타율 .312 · OPS 1.030');
    expect(statLine({ kind: 'P', line: { era: 7.37888, whip: 1.8599999 } }, 'P')).toBe('ERA 7.38 · WHIP 1.86');
  });

  it('기록이 없거나 숫자가 아니면 "2026 기록 없음"', () => {
    expect(statLine(undefined, 'H')).toBe('2026 기록 없음');
    expect(statLine({ kind: 'P', line: { era: '-' } }, 'P')).toBe('2026 기록 없음');
    expect(statLine({ kind: 'P', line: { era: 3.1 } }, 'H')).toBe('2026 기록 없음');
  });
});

const BASE = [0.23, 0.09, 0.03, 0.005, 0.045, 0.14, 0.46];
const TMI = [0.31, 0.08, 0.025, 0.004, 0.04, 0.12, 0.421];

const knob = (evidence: 'measured' | 'plausible' | 'fun') => ({
  kind: 'knob' as const,
  knob: 'stamina' as const,
  subject: 'pitcher' as const,
  strength: -1,
  scope: 'game' as const,
  evidence,
  why: '',
});

const entry = (id: string, parts: TmiEntry['interpretation']['parts'], refused = false): TmiEntry => ({
  id,
  text: id,
  interpretation: { source: 'rules', refused, reason: '', comment: '', parts },
});

describe('eventValue', () => {
  it('사건이 있으면 그 사건 확률, null이면 출루(1 − 삼진 − 범타)', () => {
    expect(eventValue(BASE, EV.K)).toBeCloseTo(0.23, 10);
    expect(eventValue(BASE, EV.HR)).toBeCloseTo(0.03, 10);
    expect(eventValue(BASE, null)).toBeCloseTo(1 - 0.23 - 0.46, 10);
  });
});

describe('oddsHeadline', () => {
  it('실제 결과가 있으면 "<타자> <사건> 확률"과 TMI 없음 → TMI 값, %p 변화', () => {
    const h = oddsHeadline({ batterName: '김타자', actualEvent: EV.K, base: BASE, tmi: TMI });
    expect(h).toEqual({ kind: 'actual', event: EV.K, label: '김타자 삼진 확률', base: 0.23, tmi: 0.31, deltaPp: expect.closeTo(8, 8) });
  });

  it('사건 이름은 삼진·볼넷·홈런·3루타·2루타·안타·범타', () => {
    const labels = [EV.K, EV.BB, EV.HR, EV.T3, EV.D2, EV.S1, EV.OUT].map(
      (event) => oddsHeadline({ batterName: '김타자', actualEvent: event, base: BASE, tmi: BASE }).label,
    );
    expect(labels).toEqual([
      '김타자 삼진 확률',
      '김타자 볼넷 확률',
      '김타자 홈런 확률',
      '김타자 3루타 확률',
      '김타자 2루타 확률',
      '김타자 안타 확률',
      '김타자 범타 확률',
    ]);
  });

  it('실제 결과가 없으면 출루 확률', () => {
    const h = oddsHeadline({ batterName: '박타자', actualEvent: null, base: BASE, tmi: TMI });
    expect(h.kind).toBe('onBase');
    expect(h.event).toBeNull();
    expect(h.label).toBe('박타자 출루 확률');
    expect(h.base).toBeCloseTo(0.31, 10);
    expect(h.tmi).toBeCloseTo(1 - 0.31 - 0.421, 10);
  });
});

describe('thousandSplit', () => {
  it('합이 1,000인 정수 7개(최대 잔여법)', () => {
    const split = thousandSplit(BASE);
    expect(split).toEqual([230, 90, 30, 5, 45, 140, 460]);
  });

  it('잔여가 같으면 사건 순서가 앞선 쪽이 먼저 1을 받는다', () => {
    const third = 1 / 3;
    expect(thousandSplit([third, third, third, 0, 0, 0, 0])).toEqual([334, 333, 333, 0, 0, 0, 0]);
  });

  it('무작위 분포 500개에서 항상 합 1,000이고 각 값은 내림·올림 중 하나', () => {
    const r = createRng(20260915);
    for (let n = 0; n < 500; n++) {
      const raw = Array.from({ length: 7 }, () => r());
      const sum = raw.reduce((a, b) => a + b, 0);
      const dist = raw.map((v) => v / sum);
      const split = thousandSplit(dist);
      expect(split.reduce((a, b) => a + b, 0)).toBe(1000);
      split.forEach((value, i) => {
        expect(value === Math.floor(dist[i] * 1000) || value === Math.floor(dist[i] * 1000) + 1).toBe(true);
      });
    }
  });

  it('합이 0이거나 숫자가 아니면 모두 0', () => {
    expect(thousandSplit([0, 0, 0, 0, 0, 0, 0])).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(thousandSplit([Number.NaN, 0, 0, 0, 0, 0, 0])).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('winLine', () => {
  it('공격 팀 승리 + 무승부/2, 원정·홈 공격 모두', () => {
    const base = { winHome: 0.5, tie: 0.1, winAway: 0.4 };
    const tmi = { winHome: 0.46, tie: 0.1, winAway: 0.44 };
    const away = winLine({ teamName: 'KIA', batSide: 'away', base, tmi });
    expect(away.team).toBe('KIA');
    expect(away.base).toBeCloseTo(0.45, 10);
    expect(away.tmi).toBeCloseTo(0.49, 10);
    expect(away.deltaPp).toBeCloseTo(4, 8);
    const home = winLine({ teamName: '롯데', batSide: 'home', base, tmi });
    expect(home.base).toBeCloseTo(0.55, 10);
    expect(home.tmi).toBeCloseTo(0.51, 10);
    expect(home.deltaPp).toBeCloseTo(-4, 8);
  });
});

describe('gradeOf', () => {
  it('TMI가 없거나 모두 거부면 null', () => {
    expect(gradeOf([])).toBeNull();
    expect(gradeOf([entry('a', [], true)])).toBeNull();
  });

  it('여러 TMI면 가장 약한 등급(상상 < 그럴듯함 < 실측), 실측 변수는 실측', () => {
    const measured = { kind: 'measured' as const, variable: 'temp_c' as const, value: 33, subject: 'everyone' as const, why: '' };
    expect(gradeOf([entry('a', [measured])])).toBe('measured');
    expect(gradeOf([entry('a', [measured]), entry('b', [knob('plausible')])])).toBe('plausible');
    expect(gradeOf([entry('a', [knob('plausible')]), entry('b', [knob('fun')]), entry('c', [measured])])).toBe('fun');
  });
});
