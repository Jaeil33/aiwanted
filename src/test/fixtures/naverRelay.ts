/*
 * 네이버 원자료 모양의 합성 중계·일정. 실존 선수 이름은 쓰지 않는다(공개 저장소).
 * 원정 a1~a9(김타자n), 홈 h1~h9(이타자n), 투수 ap1·hp1, 대타 ph1(정대타).
 *
 * 1회초·1회말에 양 팀 타선 아홉 명이 모두 한 번씩 서고(타선 복원에 18칸이 다 필요하다),
 * 2회초에 대타 교체와 결과 없이 끝난 타석이 하나씩 있다.
 */

const AWAY = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9'];
const HOME = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9'];
/** 1번 좌타, 2번 우타, 3번 양타, 나머지 우타 */
const HIT_TYPES = ['좌투좌타', '우투우타', '우투양타', '우투우타', '우투우타', '우투우타', '우투우타', '우투우타', '우투우타'];

interface PaSpec {
  no: number;
  inn: number;
  half: 0 | 1;
  batter: string;
  order: number;
  pitcher: string;
  outs: number;
  /** 결과 문장. 없으면 결과 옵션이 없는(끊긴) 타석이다 */
  result?: string;
}

let seq = 0;
const next = () => (seq += 1);

function gameState(spec: PaSpec) {
  return {
    pitcher: spec.pitcher,
    batter: spec.batter,
    strike: '0',
    ball: '0',
    out: String(spec.outs),
    base1: '0',
    base2: '0',
    base3: '0',
    awayScore: '0',
    homeScore: '0',
  };
}

function paRelay(spec: PaSpec): Record<string, unknown> {
  const gs = gameState(spec);
  const pitchId = `pt${spec.no}`;
  const options: Record<string, unknown>[] = [
    {
      type: 8,
      seqno: next(),
      text: `${spec.batter} 타석`,
      currentGameState: gs,
      batterRecord: {
        pcode: spec.batter,
        name: spec.half === 1 ? `이타자${spec.order}` : `김타자${spec.order}`,
        batOrder: spec.order,
        hitType: HIT_TYPES[spec.order - 1],
      },
    },
    {
      type: 1,
      seqno: next(),
      pitchResult: 'S',
      stuff: '직구',
      speed: 145,
      ptsPitchId: pitchId,
      currentGameState: gs,
    },
  ];
  if (spec.result !== undefined) {
    options.push({ type: 13, seqno: next(), text: spec.result, currentGameState: gs });
  }
  return {
    no: spec.no,
    inn: spec.inn,
    homeOrAway: String(spec.half),
    statusCode: 'RESULT',
    metricOption: { homeTeamWinRate: 50, awayTeamWinRate: 50, wpaByPlate: 0 },
    ptsOptions: [{
      pitchId,
      stance: HIT_TYPES[spec.order - 1].includes('좌타') ? 'L' : 'R',
      x0: 1.1, z0: 5.9, vx0: 5.2, vy0: -130, vz0: -4.1, ax: -10.8, ay: 28.4, az: -14.5, topSz: 3.3, bottomSz: 1.6,
    }],
    textOptions: options,
  };
}

/** 대타 교체 relay: 홈 2번 자리에 정대타가 들어간다 */
function pinchHitterRelay(no: number, inn: number): Record<string, unknown> {
  return {
    no,
    inn,
    homeOrAway: '1',
    statusCode: 'RESULT',
    ptsOptions: [],
    textOptions: [{
      type: 2,
      seqno: next(),
      text: '이타자2 : 대타 정대타(으)로 교체',
      playerChange: {
        inPlayer: { playerId: 'ph1', playerPos: '대타', outPlayerTurn: 2 },
        outPlayer: { playerId: 'h2', playerPos: '2루수' },
      },
    }],
  };
}

/** 중계 원자료 `{ game, textRelays }` */
export function fixtureNaverRelay(): { game: Record<string, unknown>; textRelays: Record<string, unknown>[] } {
  seq = 0;
  const relays: Record<string, unknown>[] = [];
  let no = 1;

  // 1회초: 원정 아홉 명
  for (let i = 0; i < AWAY.length; i++) {
    relays.push(paRelay({
      no: no++, inn: 1, half: 0, batter: AWAY[i], order: i + 1, pitcher: 'hp1',
      outs: Math.min(i % 3, 2), result: `김타자${i + 1} : 유격수 앞 땅볼`,
    }));
  }
  // 1회말: 홈 아홉 명
  for (let i = 0; i < HOME.length; i++) {
    relays.push(paRelay({
      no: no++, inn: 1, half: 1, batter: HOME[i], order: i + 1, pitcher: 'ap1',
      outs: Math.min(i % 3, 2), result: `이타자${i + 1} : 좌익수 뜬공`,
    }));
  }
  // 2회초: 원정 1번이 다시 선다
  relays.push(paRelay({
    no: no++, inn: 2, half: 0, batter: 'a1', order: 1, pitcher: 'hp1', outs: 0,
    result: '김타자1 : 좌월 솔로 홈런',
  }));
  // 2회말 대타 교체 뒤 그 자리 타석. 결과 없이 끊긴다
  relays.push(pinchHitterRelay(no++, 2));
  relays.push(paRelay({ no, inn: 2, half: 1, batter: 'ph1', order: 2, pitcher: 'ap1', outs: 1 }));

  return {
    game: {
      gameId: '20260915LGOB02026',
      statusCode: 'RESULT',
      homeTeamCode: 'OB',
      awayTeamCode: 'LG',
    },
    textRelays: relays,
  };
}

/**
 * 실시간 중계 응답 모양. 로컬 파일과 달리 머리 필드에 currentGameState가 있고,
 * 그 값은 이닝 인자와 무관하게 언제나 "지금"이다(phases/14-live-data/step0.md 조사분).
 */
export function fixtureNaverLivePayload(): Record<string, unknown> {
  const raw = fixtureNaverRelay();
  return {
    inn: 2,
    homeOrAway: '1',
    currentGameState: {
      pitcher: 'ap1', batter: 'h2', ball: '2', strike: '1', out: '1',
      base1: '0', base2: '0', base3: '0', awayScore: '1', homeScore: '0',
    },
    textRelays: raw.textRelays,
  };
}

/** 일정 API 모양: 경기 전·진행 중·끝남·취소 */
export function fixtureNaverSchedule(): Record<string, unknown>[] {
  const base = {
    stadium: '잠실',
    awayTeamCode: 'LG', awayTeamName: 'LG',
    homeTeamCode: 'OB', homeTeamName: '두산',
    cancel: false, suspended: false,
  };
  return [
    { ...base, gameId: '20260916LGOB02026', gameDate: '2026-09-16', gameDateTime: '2026-09-16T18:30:00', statusCode: 'BEFORE', awayTeamScore: 0, homeTeamScore: 0, statusInfo: '' },
    { ...base, gameId: '20260915LGOB02026', gameDate: '2026-09-15', gameDateTime: '2026-09-15T18:30:00', statusCode: 'STARTED', awayTeamScore: 1, homeTeamScore: 0, statusInfo: '3회초' },
    { ...base, gameId: '20260914LGOB02026', gameDate: '2026-09-14', gameDateTime: '2026-09-14T17:00:00', statusCode: 'RESULT', awayTeamScore: 4, homeTeamScore: 7, statusInfo: '경기 종료' },
    { ...base, gameId: '20260913LGOB02026', gameDate: '2026-09-13', gameDateTime: '2026-09-13T18:30:00', statusCode: 'BEFORE', cancel: true, awayTeamScore: 0, homeTeamScore: 0, statusInfo: '우천 취소' },
  ];
}
