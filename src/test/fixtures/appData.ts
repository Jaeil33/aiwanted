import { PITCH_TYPES } from '../../domain/events';
import { buildSituationSetup, type SituationSetup } from '../../game';
import type {
  AppData,
  BullpenRecord,
  PitchRow,
  PlayerRecord,
  Situation,
  TeamCode,
} from '../../types/data';

/*
 * 테스트 전용 합성 데이터. 실존 선수 이름이나 실제 기록을 넣지 않는다(ADR-005).
 * 원정 HT(원정타자1~9, 원정투수 ap 우투) 대 홈 LT(홈타자1~9, 홈투수 hp 좌투),
 * 장면 1개: 9회말 2사 만루 4:4, 홈타자6(h6) 대 원정투수(ap), 실제 결과 끝내기 만루 홈런.
 */

const ONE = [1, 1, 1, 1, 1, 1, 1];

type HitterLine = [pa: number, avg: number, obp: number, slg: number, hr: number, k: number, bb: number];

function hitter(id: string, name: string, team: TeamCode, bats: 'L' | 'R' | 'S', rel: number[], stats: HitterLine): PlayerRecord {
  const [pa, avg, obp, slg, hr, k, bb] = stats;
  return { id, name, team, kind: 'H', bats, rel: [...rel], line: { pa, avg, obp, slg, hr, k, bb } };
}

function pitcher(id: string, name: string, team: TeamCode, throws: 'L' | 'R', rel: number[], line: PlayerRecord['line']): PlayerRecord {
  return { id, name, team, kind: 'P', throws, rel: [...rel], line };
}

const AWAY_HITTERS: PlayerRecord[] = [
  hitter('a1', '원정타자1', 'HT', 'R', ONE, [412, 0.281, 0.352, 0.402, 6, 71, 38]),
  hitter('a2', '원정타자2', 'HT', 'L', ONE, [398, 0.296, 0.371, 0.418, 4, 58, 45]),
  hitter('a3', '원정타자3', 'HT', 'R', [0.8, 1, 0.9, 1, 1, 1.15, 0.97], [430, 0.312, 0.366, 0.455, 9, 49, 31]),
  hitter('a4', '원정타자4', 'HT', 'R', [1.1, 1, 1.4, 1, 1.1, 0.95, 0.98], [445, 0.268, 0.349, 0.512, 22, 98, 47]),
  hitter('a5', '원정타자5', 'HT', 'S', [0.9, 1.3, 1, 1, 1, 1, 0.98], [401, 0.274, 0.388, 0.431, 11, 77, 64]),
  hitter('a6', '원정타자6', 'HT', 'L', ONE, [376, 0.259, 0.331, 0.384, 7, 82, 33]),
  hitter('a7', '원정타자7', 'HT', 'R', ONE, [352, 0.247, 0.318, 0.366, 5, 79, 29]),
  hitter('a8', '원정타자8', 'HT', 'R', ONE, [318, 0.238, 0.301, 0.342, 3, 74, 24]),
  hitter('a9', '원정타자9', 'HT', 'L', ONE, [287, 0.251, 0.322, 0.33, 1, 52, 27]),
];

const HOME_HITTERS: PlayerRecord[] = [
  hitter('h1', '홈타자1', 'LT', 'L', ONE, [421, 0.289, 0.361, 0.397, 3, 55, 44]),
  hitter('h2', '홈타자2', 'LT', 'R', [1.05, 0.95, 1, 1.2, 1, 1.05, 0.98], [405, 0.277, 0.34, 0.409, 5, 68, 35]),
  hitter('h3', '홈타자3', 'LT', 'R', ONE, [438, 0.301, 0.372, 0.468, 14, 72, 46]),
  hitter('h4', '홈타자4', 'LT', 'L', ONE, [441, 0.283, 0.365, 0.497, 19, 91, 51]),
  hitter('h5', '홈타자5', 'LT', 'R', ONE, [399, 0.266, 0.338, 0.421, 10, 84, 36]),
  hitter('h6', '홈타자6', 'LT', 'L', [0.9, 1, 1.6, 1, 1.2, 1, 0.95], [383, 0.262, 0.344, 0.521, 24, 101, 42]),
  hitter('h7', '홈타자7', 'LT', 'S', ONE, [349, 0.255, 0.327, 0.371, 6, 70, 30]),
  hitter('h8', '홈타자8', 'LT', 'R', ONE, [312, 0.241, 0.305, 0.349, 4, 66, 22]),
  hitter('h9', '홈타자9', 'LT', 'R', ONE, [276, 0.236, 0.298, 0.321, 2, 57, 20]),
];

const PITCHERS: PlayerRecord[] = [
  pitcher('ap', '원정투수', 'HT', 'R', [1.15, 0.9, 0.85, 1, 0.95, 0.95, 1], {
    era: 3.12, ip: 72, k: 81, bb: 22, whip: 1.14, sv: 28, hold: 2, g: 61,
  }),
  pitcher('hp', '홈투수', 'LT', 'L', [1, 1.05, 1.1, 1, 1, 1, 1], {
    era: 4.05, ip: 133, k: 112, bb: 48, whip: 1.36, sv: 0, hold: 0, g: 24,
  }),
];

const bullpens: Record<string, BullpenRecord> = {
  HT: { id: 'HT-pen', team: 'HT', name: '원정 불펜', rel: [...ONE], n: 7 },
  LT: { id: 'LT-pen', team: 'LT', name: '홈 불펜', rel: [...ONE], n: 6 },
};

// [type, speed, code, balls, strikes, stance, x0, z0, vx0, vy0, vz0, ax, ay, az, topSz, bottomSz]

/** 원정투수 ap(우투, x0 < 0): code 0~4와 좌타(0)·우타(1)가 모두 들어 있다 */
/** 우투 원정투수의 합성 투구 표본. 리그 풀(pools.R)의 원본이다 */
export const AP_ROWS: PitchRow[] = [
  [0, 148, 0, 0, 0, 1, -1.52, 5.81, 5.1, -131.2, -5.3, -8.1, 28.4, -14.8, 3.42, 1.61],
  [3, 134, 1, 1, 0, 1, -1.48, 5.77, 4.2, -121.5, -3.9, 2.4, 25.1, -30.2, 3.42, 1.61],
  [0, 149, 3, 1, 1, 1, -1.55, 5.84, 5.4, -132, -5.6, -8.6, 28.9, -13.9, 3.42, 1.61],
  [6, 128, 2, 1, 2, 1, -1.5, 5.72, 3.9, -115.8, -2.8, -10.2, 23.5, -25.6, 3.42, 1.61],
  [0, 147, 0, 0, 0, 0, -1.47, 5.79, 4.8, -130.1, -4.9, -7.7, 28, -15.3, 3.38, 1.58],
  [5, 121, 0, 1, 0, 0, -1.58, 5.9, 3.1, -110.4, 1.2, 4.1, 21.9, -38.4, 3.38, 1.58],
  [1, 145, 1, 2, 0, 0, -1.53, 5.76, 5.6, -128.7, -5.8, -12.3, 27.6, -18.1, 3.38, 1.58],
  [0, 150, 3, 2, 1, 0, -1.49, 5.83, 5, -132.6, -5.1, -8.3, 29.2, -14.2, 3.38, 1.58],
  [3, 135, 4, 2, 2, 0, -1.51, 5.78, 4.4, -122.3, -4.2, 2.8, 25.4, -29.7, 3.38, 1.58],
  [7, 131, 2, 0, 1, 1, -1.46, 5.74, 4, -118.9, -3.4, -6.5, 24.2, -27.9, 3.45, 1.63],
  [0, 151, 4, 3, 2, 1, -1.54, 5.86, 5.3, -133.4, -5.4, -8.8, 29.5, -13.5, 3.45, 1.63],
  [2, 140, 3, 0, 2, 1, -1.5, 5.8, 4.9, -126.8, -4.7, -1.2, 26.8, -20.4, 3.45, 1.63],
];

/** 홈투수 hp(좌투, x0 > 0) */
/** 좌투 홈투수의 합성 투구 표본. 리그 풀(pools.L)의 원본이다 */
export const HP_ROWS: PitchRow[] = [
  [0, 142, 0, 0, 0, 1, 1.62, 5.95, -6.1, -127.4, -4.8, 7.9, 27.1, -16.2, 3.41, 1.62],
  [6, 125, 2, 0, 1, 1, 1.58, 5.9, -4.8, -113.6, -2.9, 11.4, 22.8, -27.3, 3.41, 1.62],
  [5, 118, 1, 1, 1, 0, 1.66, 6.02, -3.9, -107.9, 1.8, -5.2, 20.6, -39.5, 3.36, 1.57],
  [0, 143, 4, 2, 2, 0, 1.6, 5.93, -5.9, -128.3, -5, 8.3, 27.5, -15.7, 3.36, 1.57],
];

/** 장면의 실제 타석: 볼 → 헛스윙 → 인플레이(만루 홈런), 좌타 h6 */
const ACTUAL_ROWS: PitchRow[] = [
  [0, 148, 0, 0, 0, 0, -1.51, 5.8, 5, -131, -5.2, -8, 28.3, -14.9, 3.4, 1.6],
  [3, 134, 2, 1, 0, 0, -1.49, 5.76, 4.3, -121.8, -4, 2.5, 25.2, -30, 3.4, 1.6],
  [0, 149, 4, 1, 1, 0, -1.53, 5.82, 5.2, -132.1, -5.5, -8.4, 28.8, -14.1, 3.4, 1.6],
];

/** 픽스처 상황: 9회말 2사 만루 4:4, 홈 롯데 공격, 홈타자6(좌타) 대 원정투수(우투). 실제 결과는 끝내기 만루 홈런 */
export const fixtureSituation: Situation = {
  id: '20260815HTLT02026-71',
  kind: 'past',
  gameId: '20260815HTLT02026',
  paNo: 71,
  date: '2026-08-15',
  stadium: '픽스처 구장',
  away: { code: 'HT', name: 'KIA' },
  home: { code: 'LT', name: '롯데' },
  state: { inning: 9, half: 1, outs: 2, bases: 7, away: 4, home: 4, slotAway: 3, slotHome: 5 },
  count: { balls: 0, strikes: 0 },
  batter: 'h6',
  pitcher: 'ap',
  lineups: { away: AWAY_HITTERS.map((p) => p.id), home: HOME_HITTERS.map((p) => p.id) },
  actual: {
    result: '홈타자6 : 우익수 뒤 만루 홈런',
    event: 2,
    runs: 4,
    pitches: ACTUAL_ROWS,
    wpAfterHome: 1,
  },
  naverWpBeforeHome: 0.62,
  context: { tempC: 27.5, windMs: 2.1, dayGame: false, dome: false },
};

/** 그 경기가 실제로 끝난 점수 */
export const FIXTURE_FINAL = { away: 4, home: 8 } as const;
/** 화면 제목(상황에서 만든 값과 같다) */
export const FIXTURE_TITLE = '9회말 2사 만루';

/** 픽스처 상황의 조립 결과. 테스트가 buildSceneSetup 대신 이것을 쓴다 */
export function fixtureSetup(): SituationSetup {
  return buildSituationSetup(fixtureAppData.core, fixtureSituation, { actualFinal: { ...FIXTURE_FINAL } });
}

export const fixtureAppData: AppData = {
  core: {
    meta: {
      season: 2026,
      relayRange: ['2026-08-01', '2026-09-13'],
      relayGames: 1,
      generatedAt: '2026-09-14T00:00:00+09:00',
      sources: ['합성 테스트 픽스처'],
    },
    league: [0.2, 0.09, 0.025, 0.004, 0.045, 0.15, 0.486],
    // 행: balls*3+strikes, 열: [B, T, S, F, X]
    countTable: [
      [0.37, 0.18, 0.06, 0.17, 0.22],
      [0.35, 0.1, 0.1, 0.22, 0.23],
      [0.4, 0.04, 0.13, 0.24, 0.19],
      [0.37, 0.14, 0.07, 0.18, 0.24],
      [0.35, 0.09, 0.11, 0.21, 0.24],
      [0.38, 0.04, 0.13, 0.25, 0.2],
      [0.36, 0.13, 0.07, 0.18, 0.26],
      [0.34, 0.09, 0.1, 0.22, 0.25],
      [0.35, 0.04, 0.13, 0.26, 0.22],
      [0.45, 0.28, 0.02, 0.12, 0.13],
      [0.36, 0.12, 0.08, 0.2, 0.24],
      [0.3, 0.05, 0.12, 0.27, 0.26],
    ],
    players: Object.fromEntries([...AWAY_HITTERS, ...HOME_HITTERS, ...PITCHERS].map((p) => [p.id, p])),
    bullpens,
  },
  pitches: {
    pitchTypes: [...PITCH_TYPES],
    pools: { L: HP_ROWS.slice(), R: AP_ROWS.slice(0, 4) },
  },
  evidence: {
    method: '팀-경기 포아송 GLM (합성 픽스처)',
    trainSeasons: [2021, 2022, 2023, 2024, 2025],
    testSeason: 2026,
    games: { train: 3600, test: 620 },
    joint: { devianceGainPerGame: 0.0012, ciLow: -0.0004, ciHigh: 0.0029 },
    items: [
      {
        id: 'temp_c',
        beta: 0.021,
        se: 0.009,
        ciLow: 0.0034,
        ciHigh: 0.0386,
        runsPctPerUnit: 2.1222,
        n: 7000,
        test: { devianceGainPerGame: 0.0003, ciLow: -0.0002, ciHigh: 0.0009, games: 620 },
        verdict: 'maybe',
        note: '학습 구간은 0을 벗어났지만 2026 검증 개선 구간이 0을 포함한다.',
      },
      {
        id: 'day_game',
        beta: -0.004,
        se: 0.015,
        ciLow: -0.0334,
        ciHigh: 0.0254,
        runsPctPerUnit: -0.3992,
        n: 1500,
        test: { devianceGainPerGame: -0.0001, ciLow: -0.0006, ciHigh: 0.0004, games: 620 },
        verdict: 'useless',
        note: '학습·검증 구간 모두 0을 포함한다.',
      },
    ],
  },
  trust: {
    games: 12,
    plateAppearances: 890,
    brier: { engine: 0.0412, naver: 0.0398, constant: 0.0615 },
    logLoss: { engine: 0.162, naver: 0.157, constant: 0.231 },
    calibration: [
      { lo: 0, hi: 0.5, predicted: 0.24, actual: 0.22, n: 410 },
      { lo: 0.5, hi: 1, predicted: 0.76, actual: 0.79, n: 480 },
    ],
    note: '합성 픽스처 값',
  },
};
