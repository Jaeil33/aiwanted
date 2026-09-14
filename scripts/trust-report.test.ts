import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGame, type LineupSlot } from '../src/engine';
import type { TrustData } from '../src/types/data';
import type { GameState } from '../src/types/domain';
import {
  TRUST_NOTE,
  computeTrust,
  evaluateTrust,
  parseCli,
  startingLineup,
  summaryLines,
  type TrustGame,
  type TrustPlateAppearance,
  type TrustStates,
} from './trust-report';

/** createGame은 경기마다 수백 ms가 걸린다 */
const SLOW = { timeout: 60_000 };

const LEAGUE = [0.2, 0.09, 0.025, 0.004, 0.045, 0.16, 0.476];
const ONES = [1, 1, 1, 1, 1, 1, 1];
const clip = (p: number) => Math.min(Math.max(p, 1e-6), 1 - 1e-6);
const AWAY = Array.from({ length: 9 }, (_, i) => `a${i + 1}`);
const HOME = Array.from({ length: 9 }, (_, i) => `h${i + 1}`);
const EMPTY: (string | null)[] = Array(9).fill(null);
const withSlots = (known: string[]) => [...known, ...EMPTY.slice(known.length)];

/** 2025 기록이 있는 선수만 담는다 (a2·h2 등은 기록 없음) */
const PLAYERS: Record<string, number[]> = {
  a1: [0.8, 1.2, 1.6, 1, 1.3, 1.15, 0.9],
  h1: [1.2, 0.9, 0.7, 1, 0.9, 0.95, 1.02],
  hp: [1.3, 0.8, 0.7, 1, 0.9, 0.9, 1],
  ap: [0.9, 1.1, 1.2, 1, 1.1, 1.05, 1],
};
/** LT 불펜은 기록이 없다 */
const BULLPENS: Record<string, number[]> = { HT: [1.3, 0.8, 0.7, 1, 0.9, 0.9, 1] };

function pa(over: Partial<TrustPlateAppearance> = {}): TrustPlateAppearance {
  return {
    inning: 1,
    half: 0,
    outs: 0,
    bases: 0,
    away: 0,
    home: 0,
    slotAway: 0,
    slotHome: 0,
    lineupAway: [...AWAY],
    lineupHome: [...HOME],
    pitcher: 'hp',
    naverHomeWp: 0.5,
    ...over,
  };
}

function game(gameId: string, homeWin: 0 | 1 | null, pas: TrustPlateAppearance[], away = 'HT', home = 'LT'): TrustGame {
  return { gameId, date: `2026-08-${gameId.slice(6, 8)}`, away, home, homeWin, pas };
}

function states(games: TrustGame[]): TrustStates {
  return { season: 2025, league: LEAGUE, players: PLAYERS, bullpens: BULLPENS, games };
}

const stateOf = ({ inning, half, outs, bases, away, home, slotAway, slotHome }: TrustPlateAppearance): GameState => ({
  inning,
  half,
  outs,
  bases,
  away,
  home,
  slotAway,
  slotHome,
});

/** 홈 승 4타석 (마지막 네이버 값 1) */
const HOME_WIN = game('20260801HTLT02026', 1, [
  pa({ outs: 1, slotAway: 1, lineupAway: withSlots(['a1', 'a2']), lineupHome: [...EMPTY], naverHomeWp: 0.52 }),
  pa({ inning: 3, half: 1, bases: 1, away: 1, slotAway: 3, slotHome: 4, pitcher: 'ap', naverHomeWp: 0.45 }),
  pa({ inning: 6, outs: 2, bases: 3, away: 1, home: 3, slotAway: 6, slotHome: 8, pitcher: 'hp2', naverHomeWp: 0.78 }),
  pa({ inning: 9, outs: 2, away: 1, home: 5, slotAway: 8, slotHome: 2, pitcher: 'hp3', naverHomeWp: 1 }),
]);
/** 무승부: 계산에서 뺀다 */
const TIE = game('20260802HTLT02026', null, [
  pa({ naverHomeWp: 0.5 }),
  pa({ inning: 11, half: 1, outs: 2, away: 3, home: 3, naverHomeWp: 0.5 }),
]);
/** 원정 승 3타석 (마지막 네이버 값 1은 틀린 확신이라 로그 손실에서 잘라야 유한하다) */
const AWAY_WIN = game(
  '20260803LTHT02026',
  0,
  [
    pa({ inning: 2, half: 1, outs: 1, bases: 2, away: 2, slotAway: 5, slotHome: 3, pitcher: 'ap', naverHomeWp: 0.31 }),
    pa({ inning: 8, half: 1, bases: 7, away: 4, home: 2, slotAway: 1, slotHome: 6, pitcher: 'ap', naverHomeWp: 0.2 }),
    pa({ inning: 10, away: 5, home: 5, slotAway: 2, slotHome: 7, naverHomeWp: 1 }),
  ],
  'LT',
  'HT',
);
const STATES = states([HOME_WIN, TIE, AWAY_WIN]);
const DECIDED = [HOME_WIN, AWAY_WIN];

let cached: ReturnType<typeof evaluateTrust> | null = null;
/** 합성 states 전체 결과 (createGame 두 번이라 한 번만 계산) */
const full = () => (cached ??= evaluateTrust(STATES));

describe('startingLineup', () => {
  it('타순마다 처음 알려진 타자를 고르고 대타가 나와도 바꾸지 않는다', () => {
    const pas = [
      pa({ lineupAway: withSlots(['a1']), lineupHome: [...EMPTY] }),
      pa({ lineupAway: withSlots(['a1', 'a2', 'a3']), lineupHome: withSlots(['h1']) }),
      pa({ lineupAway: withSlots(['a1', 'a2b', 'a3', 'a4']), lineupHome: withSlots(['h1b', 'h2']) }),
    ];
    expect(startingLineup(pas, 'away')).toEqual(withSlots(['a1', 'a2', 'a3', 'a4']));
    expect(startingLineup(pas, 'home')).toEqual(withSlots(['h1', 'h2']));
  });

  it('끝까지 모르는 타순은 null이고 타석이 없으면 9칸 모두 null', () => {
    expect(startingLineup([pa({ lineupHome: withSlots(['h1']) })], 'home')).toEqual(withSlots(['h1']));
    expect(startingLineup([], 'away')).toEqual(EMPTY);
  });
});

describe('computeTrust', SLOW, () => {
  it('무승부 경기는 빼고 나머지 경기의 타석을 모두 센다', () => {
    const { trust, skipped } = full();
    expect(trust.games).toBe(2);
    expect(trust.plateAppearances).toBe(7);
    expect(skipped).toBe(0);
    expect(trust.note).toBe(TRUST_NOTE);
    expect(TRUST_NOTE).toBe(
      '2025 시즌 기록만으로 만든 엔진을 2026 중계 타석에 적용했어요. 선수 교체는 시작 라인업으로 고정했어요.',
    );
  });

  it('항상 0.5의 Brier는 평균((0.5 − y)²)과 정확히 같고 로그 손실은 ln 2', () => {
    const ys = DECIDED.flatMap((g) => g.pas.map(() => Number(g.homeWin)));
    const expected = ys.reduce((s, y) => s + (0.5 - y) ** 2, 0) / ys.length;
    expect(full().trust.brier.constant).toBe(expected);
    expect(full().trust.logLoss.constant).toBeCloseTo(Math.LN2, 12);
  });

  it('네이버 Brier·로그 손실은 naverHomeWp를 [1e-6, 1 − 1e-6]로 잘라 직접 계산한 값과 같다', () => {
    const rows = DECIDED.flatMap((g) => g.pas.map((p) => [clip(p.naverHomeWp), Number(g.homeWin)] as const));
    const brier = rows.reduce((s, [p, y]) => s + (p - y) ** 2, 0) / rows.length;
    const logLoss = -rows.reduce((s, [p, y]) => s + (y === 1 ? Math.log(p) : Math.log(1 - p)), 0) / rows.length;
    const { trust } = full();
    expect(trust.brier.naver).toBeCloseTo(brier, 12);
    expect(trust.logLoss.naver).toBeCloseTo(logLoss, 12);
    expect(Number.isFinite(trust.logLoss.naver)).toBe(true);
  });

  it('보정 구간: n이 0인 구간은 빼고, n 합은 타석 수, 홈 승 타석 수는 구간과 상관없이 보존', () => {
    const { calibration, plateAppearances } = full().trust;
    expect(calibration.length).toBeGreaterThan(0);
    expect(calibration.reduce((s, b) => s + b.n, 0)).toBe(plateAppearances);
    expect(calibration.reduce((s, b) => s + b.actual * b.n, 0)).toBeCloseTo(HOME_WIN.pas.length, 9);
    calibration.forEach((b, i) => {
      expect(b.n).toBeGreaterThan(0);
      expect(Number.isInteger(b.n)).toBe(true);
      expect(b.lo * 10).toBeCloseTo(Math.round(b.lo * 10), 9);
      expect(b.hi - b.lo).toBeCloseTo(0.1, 9);
      expect(b.predicted).toBeGreaterThanOrEqual(b.lo);
      expect(b.predicted).toBeLessThanOrEqual(b.hi);
      if (i > 0) expect(b.lo).toBeGreaterThan(calibration[i - 1].lo);
    });
  });

  it('모든 확률 값은 0~1이고 결과는 JSON으로 그대로 오간다', () => {
    const { trust } = full();
    const probabilities = [
      trust.brier.engine,
      trust.brier.naver,
      trust.brier.constant,
      ...trust.calibration.flatMap((b) => [b.lo, b.hi, b.predicted, b.actual]),
    ];
    for (const p of probabilities) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(trust.logLoss.engine).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(trust))).toEqual(trust);
  });

  it('엔진 예측 = 시작 라인업·2025 rel(없으면 1 벡터)·팀 불펜·리그로 한 번 만든 경기의 winHome + tie / 2', () => {
    const pas = [
      pa({ inning: 4, outs: 1, bases: 1, away: 1, home: 2, slotHome: 5, lineupAway: withSlots(['a1']), naverHomeWp: 0.6 }),
      pa({
        inning: 7,
        half: 1,
        bases: 2,
        away: 3,
        home: 2,
        slotAway: 4,
        lineupAway: withSlots(['a1b', 'a2', 'a3', 'a4', 'a5']),
        pitcher: 'nobody',
        naverHomeWp: 0.4,
      }),
    ];
    const relOf = (id: string | null) => (id !== null && id in PLAYERS ? PLAYERS[id] : ONES);
    const lineup = (ids: (string | null)[]): LineupSlot[] => ids.map((id, i) => ({ id: id ?? `unknown-${i}`, rel: relOf(id) }));
    const engine = createGame({
      lg: LEAGUE,
      away: { lineup: lineup(withSlots(['a1', 'a2', 'a3', 'a4', 'a5'])), bullpen: { id: 'HT-pen', rel: BULLPENS.HT } },
      home: { lineup: lineup(HOME), bullpen: { id: 'LT-pen', rel: ONES } },
      effects: [],
      mode: 'real',
      countTable: null,
    });
    const probs = [
      engine.evaluate(stateOf(pas[0]), { id: 'hp', rel: PLAYERS.hp }, { detail: false }),
      engine.evaluate(stateOf(pas[1]), { id: 'nobody', rel: ONES }, { detail: false }),
    ].map((ev) => ev.winHome + ev.tie / 2);

    const trust = computeTrust(states([game('20260805HTLT02026', 1, pas)]));
    expect(trust.plateAppearances).toBe(2);
    expect(trust.brier.engine).toBeCloseTo(probs.reduce((s, p) => s + (clip(p) - 1) ** 2, 0) / 2, 12);
    expect(trust.logLoss.engine).toBeCloseTo(-probs.reduce((s, p) => s + Math.log(clip(p)), 0) / 2, 12);
    expect(trust.calibration.reduce((s, b) => s + b.predicted * b.n, 0)).toBeCloseTo(probs[0] + probs[1], 12);
  });

  it('maxGames는 무승부를 뺀 경기를 앞에서부터 센다', () => {
    const one = computeTrust(states([TIE, HOME_WIN, AWAY_WIN]), { maxGames: 1 });
    expect([one.games, one.plateAppearances]).toEqual([1, HOME_WIN.pas.length]);
    expect(one.brier.constant).toBe(0.25);
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => computeTrust(STATES, { maxGames: bad })).toThrow(RangeError);
    }
  });

  it('엔진이 받지 않는 상태(RangeError)의 타석은 세 예측 모두에서 빼고 note 끝에 개수를 붙인다', () => {
    const g = game('20260806HTLT02026', 0, [
      pa({ inning: 12, away: 4, home: 4 }),
      pa({ inning: 5, naverHomeWp: 0.4 }),
      pa({ inning: 12, half: 1, away: 4, home: 4, naverHomeWp: 0.9 }),
    ]);
    const { trust, skipped } = evaluateTrust(states([g]));
    expect(skipped).toBe(2);
    expect(trust.plateAppearances).toBe(1);
    expect(trust.calibration.reduce((s, b) => s + b.n, 0)).toBe(1);
    expect(trust.brier.naver).toBeCloseTo(0.16, 12);
    expect(trust.note).toBe(`${TRUST_NOTE} 엔진 범위 밖 타석 2개는 뺐어요.`);
  });

  it('RangeError가 아닌 오류는 그대로 던진다', () => {
    const broken = pa({ inning: 5 });
    Object.defineProperty(broken, 'outs', {
      get: () => {
        throw new TypeError('망가진 타석');
      },
    });
    expect(() => computeTrust(states([game('20260807HTLT02026', 1, [broken])]))).toThrow(TypeError);
  });

  it('평가할 타석이 없으면 오류', () => {
    expect(() => computeTrust(states([TIE]))).toThrow(/타석/);
  });
});

describe('parseCli', () => {
  const root = path.join('repo', 'tmi');
  const cwd = path.join('elsewhere', 'work');

  it('기본 입력·출력은 저장소 data/build 아래이고 경기 수 제한은 없다', () => {
    expect(parseCli([], root, cwd)).toEqual({
      inPath: path.join(root, 'data', 'build', 'trust', 'states.json'),
      outPath: path.join(root, 'data', 'build', 'app', 'trust.json'),
      maxGames: undefined,
    });
  });

  it('--in·--out은 현재 폴더 기준 경로, --max-games는 양의 정수', () => {
    expect(parseCli(['--in', 'a/states.json', '--out=b/trust.json', '--max-games', '40'], root, cwd)).toEqual({
      inPath: path.resolve(cwd, 'a/states.json'),
      outPath: path.resolve(cwd, 'b/trust.json'),
      maxGames: 40,
    });
  });

  it('잘못된 --max-games·모르는 인자·위치 인자는 오류', () => {
    for (const bad of ['0', '-1', '1.5', 'abc', '']) {
      expect(() => parseCli([`--max-games=${bad}`], root, cwd)).toThrow(RangeError);
    }
    expect(() => parseCli(['--nope'], root, cwd)).toThrow();
    expect(() => parseCli(['states.json'], root, cwd)).toThrow();
  });
});

describe('summaryLines', () => {
  it('경기·타석 수, 세 Brier, 건너뛴 타석 수를 보여준다', () => {
    const trust: TrustData = {
      games: 40,
      plateAppearances: 3210,
      brier: { engine: 0.18123, naver: 0.17444, constant: 0.25 },
      logLoss: { engine: 0.5412, naver: 0.5233, constant: Math.LN2 },
      calibration: [],
      note: TRUST_NOTE,
    };
    const text = summaryLines(trust, 3).join('\n');
    for (const part of ['경기 40', '타석 3210', '건너뛴 타석 3', '0.1812', '0.1744', '0.2500']) {
      expect(text).toContain(part);
    }
  });
});
