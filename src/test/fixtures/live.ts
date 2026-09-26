import type { PitchRow, Situation } from '../../types/data';
import type { GameState } from '../../types/domain';
import type { GameSummary, LiveGame, PaRecord } from '../../types/live';

/*
 * 실시간·지난 경기 계약(src/types/live.ts)의 합성 픽스처. 실존 선수 이름은 쓰지 않는다(공개 저장소).
 * 원정 타선 a1~a9(김타자n), 홈 타선 h1~h9(이타자n), 투수 ap1·hp1(박투수·최투수), 대타 ph1(정대타).
 */

const AWAY_LINEUP = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9'];
const HOME_LINEUP = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9'];
/** 대타 정대타가 h2 자리에 들어간 뒤의 홈 타선 */
const HOME_AFTER_PINCH = HOME_LINEUP.map((id) => (id === 'h2' ? 'ph1' : id));

const NAMES: Record<string, string> = {
  ...Object.fromEntries(AWAY_LINEUP.map((id, i) => [id, `김타자${i + 1}`])),
  ...Object.fromEntries(HOME_LINEUP.map((id, i) => [id, `이타자${i + 1}`])),
  ap1: '박투수',
  hp1: '최투수',
  ph1: '정대타',
};

const HANDS: Record<string, { bats?: 'L' | 'R' | 'S'; throws?: 'L' | 'R' }> = {
  a1: { bats: 'L' }, a2: { bats: 'R' }, a3: { bats: 'L' }, a4: { bats: 'R' }, a5: { bats: 'R' },
  a6: { bats: 'S' }, a7: { bats: 'R' }, a8: { bats: 'L' }, a9: { bats: 'R' },
  h1: { bats: 'R' }, h2: { bats: 'L' }, h3: { bats: 'R' }, h4: { bats: 'R' }, h5: { bats: 'L' },
  h6: { bats: 'R' }, h7: { bats: 'S' }, h8: { bats: 'R' }, h9: { bats: 'L' },
  ph1: { bats: 'L' },
  ap1: { throws: 'R' },
  hp1: { throws: 'L' },
};

/** [type, speed, code(0 B,1 T,2 S,3 F,4 X), balls, strikes, stance, x0, z0, vx0, vy0, vz0, ax, ay, az, topSz, bottomSz] */
function row(code: number, balls: number, strikes: number, stance = 1): PitchRow {
  return [0, 145, code, balls, strikes, stance, -1.5, 5.9, 5.2, -130, -4.1, -10.8, 28.4, -14.5, 3.3, 1.6];
}

function state(over: Partial<GameState> & Pick<GameState, 'inning' | 'half'>): GameState {
  return { outs: 0, bases: 0, away: 0, home: 0, slotAway: 0, slotHome: 0, ...over };
}

/** 경기 전·진행 중·끝난 경기 셋 */
export function fixtureGameSummaries(): GameSummary[] {
  return [
    {
      gameId: '20260915HTSK02026',
      date: '2026-09-15', time: '18:30', stadium: '문학',
      away: { code: 'HT', name: 'KIA', score: null },
      home: { code: 'SK', name: 'SSG', score: null },
      status: 'before', inningText: null,
    },
    {
      gameId: '20260915LGOB02026',
      date: '2026-09-15', time: '18:30', stadium: '잠실',
      away: { code: 'LG', name: 'LG', score: 2 },
      home: { code: 'OB', name: '두산', score: 0 },
      status: 'live', inningText: '1회말',
    },
    {
      gameId: '20260914NCKT02026',
      date: '2026-09-14', time: '17:00', stadium: '창원',
      away: { code: 'NC', name: 'NC', score: 4 },
      home: { code: 'KT', name: 'KT', score: 7 },
      status: 'final', inningText: null,
    },
  ];
}

/**
 * 진행 중 경기 하나. 타석 8개에 삼진·볼넷·2점 홈런·1루타·병살·대타 교체·반이닝 전환과
 * 주루사로 끊긴 타석(complete false, event null)이 들어 있고, 진행 중 타석이 하나 있다.
 */
export function fixtureLiveGame(): LiveGame {
  const lineups = { away: AWAY_LINEUP, home: HOME_LINEUP };
  const pinched = { away: AWAY_LINEUP, home: HOME_AFTER_PINCH };
  const plateAppearances: PaRecord[] = [
    {
      no: 1, before: state({ inning: 1, half: 0 }), batter: 'a1', pitcher: 'hp1', lineups,
      result: '김타자1 : 삼진', event: 0, runs: 0,
      pitches: [row(2, 0, 0), row(3, 0, 1), row(2, 0, 2)],
      complete: true, wpBeforeHome: 0.5, wpAfterHome: 0.52, startedAt: '18:31:10',
    },
    {
      no: 2, before: state({ inning: 1, half: 0, outs: 1, slotAway: 1 }), batter: 'a2', pitcher: 'hp1', lineups,
      result: '김타자2 : 볼넷', event: 1, runs: 0,
      pitches: [row(0, 0, 0), row(0, 1, 0), row(2, 2, 0), row(0, 2, 1)],
      complete: true, wpBeforeHome: 0.52, wpAfterHome: 0.49, startedAt: '18:33:02',
    },
    {
      no: 3, before: state({ inning: 1, half: 0, outs: 1, bases: 1, slotAway: 2 }), batter: 'a3', pitcher: 'hp1', lineups,
      result: '김타자3 : 좌월 2점 홈런', event: 2, runs: 2,
      pitches: [row(2, 0, 0), row(4, 0, 1)],
      complete: true, wpBeforeHome: 0.49, wpAfterHome: 0.27, startedAt: '18:35:40',
    },
    {
      no: 4, before: state({ inning: 1, half: 0, outs: 1, away: 2, slotAway: 3 }), batter: 'a4', pitcher: 'hp1', lineups,
      result: '김타자4 : 중전 1루타', event: 5, runs: 0,
      pitches: [row(3, 0, 0), row(4, 0, 1)],
      complete: true, wpBeforeHome: 0.27, wpAfterHome: 0.25, startedAt: '18:38:15',
    },
    {
      no: 5, before: state({ inning: 1, half: 0, outs: 1, bases: 1, away: 2, slotAway: 4 }), batter: 'a5', pitcher: 'hp1', lineups,
      result: '김타자5 : 유격수 앞 병살타', event: 6, runs: 0,
      pitches: [row(2, 0, 0), row(4, 0, 1)],
      complete: true, wpBeforeHome: 0.25, wpAfterHome: 0.35, startedAt: '18:40:05',
    },
    {
      no: 6, before: state({ inning: 1, half: 1, away: 2 }), batter: 'h1', pitcher: 'ap1', lineups,
      result: '이타자1 : 우전 1루타', event: 5, runs: 0,
      pitches: [row(0, 0, 0), row(4, 1, 0)],
      complete: true, wpBeforeHome: 0.35, wpAfterHome: 0.41, startedAt: '18:44:20',
    },
    {
      no: 7, before: state({ inning: 1, half: 1, bases: 1, away: 2, slotHome: 1 }), batter: 'ph1', pitcher: 'ap1', lineups: pinched,
      result: '대타 정대타 : 좌익수 뜬공', event: 6, runs: 0,
      pitches: [row(2, 0, 0), row(3, 0, 1), row(4, 0, 2)],
      complete: true, wpBeforeHome: 0.41, wpAfterHome: 0.36, startedAt: '18:47:55',
    },
    {
      // 1루주자가 도루 실패로 아웃돼 타석이 끊겼다. 되돌려볼 수 없다(event null)
      no: 8, before: state({ inning: 1, half: 1, outs: 1, bases: 1, away: 2, slotHome: 2 }), batter: 'h3', pitcher: 'ap1', lineups: pinched,
      result: '1루주자 이타자1 : 도루 실패 (포수→2루수)', event: null, runs: 0,
      pitches: [row(2, 0, 0), row(0, 0, 1), row(0, 1, 1)],
      complete: false, wpBeforeHome: 0.36, wpAfterHome: 0.31, startedAt: '18:50:30',
    },
  ];

  return {
    summary: fixtureGameSummaries()[1],
    names: NAMES,
    hands: HANDS,
    plateAppearances,
    // 끊긴 타석의 타자가 같은 볼카운트로 이어서 선다
    current: {
      state: state({ inning: 1, half: 1, outs: 2, away: 2, slotHome: 2 }),
      balls: 1, strikes: 1, batter: 'h3', pitcher: 'ap1',
    },
    fetchedAt: '2026-09-15T09:51:00Z',
  };
}

/** 실시간(되돌려보기 불가)·지난 경기(실제 결과 있음) 상황 하나씩. custom은 범위 밖(ADR-032) */
export function fixtureSituations(): Situation[] {
  const game = fixtureLiveGame();
  const broken = game.plateAppearances[7];
  const homer = game.plateAppearances[2];
  const teams = {
    away: { code: 'LG', name: 'LG' },
    home: { code: 'OB', name: '두산' },
  } as const;
  const context = { tempC: 24.5, windMs: 2.1, dayGame: false, dome: false, startTime: '18:30' };

  return [
    {
      id: `${game.summary.gameId}-${broken.no}`,
      kind: 'live',
      gameId: game.summary.gameId,
      paNo: broken.no,
      date: game.summary.date,
      stadium: game.summary.stadium,
      ...teams,
      state: broken.before,
      count: { balls: 0, strikes: 0 },
      batter: broken.batter,
      pitcher: broken.pitcher,
      lineups: broken.lineups,
      actual: null,
      naverWpBeforeHome: broken.wpBeforeHome,
      context,
    },
    {
      id: `${game.summary.gameId}-${homer.no}`,
      kind: 'past',
      gameId: game.summary.gameId,
      paNo: homer.no,
      date: game.summary.date,
      stadium: game.summary.stadium,
      ...teams,
      state: homer.before,
      count: { balls: 0, strikes: 0 },
      batter: homer.batter,
      pitcher: homer.pitcher,
      lineups: homer.lineups,
      actual: { result: homer.result, event: 2, runs: homer.runs, pitches: homer.pitches, wpAfterHome: homer.wpAfterHome },
      naverWpBeforeHome: homer.wpBeforeHome,
      context,
    },
  ];
}
