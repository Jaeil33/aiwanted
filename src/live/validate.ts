import type { GameSummary, LiveGame, PaRecord } from '../types/live.js';

/*
 * 서버(api/games.ts·api/game.ts)가 돌려준 값의 모양 검사. 여기서 막지 못하면 잘못된 모양이
 * 엔진까지 흘러가 화면이 조용히 틀린 경기를 보여준다. 순수 모듈이다(ADR-028: .js 확장자).
 */

type Json = Record<string, unknown>;

const MAX_INNING = 11;
const PITCH_ROW_LENGTH = 16;
const LINEUP_SIZE = 9;
const GAME_ID = /^\d{8}[A-Z]{4}\d{5}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^\d{2}:\d{2}$/;
const HH_MM_SS = /^\d{2}:\d{2}:\d{2}$/;
const STATUSES = ['before', 'live', 'final', 'cancelled', 'suspended'];

const isRecord = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const isString = (x: unknown): x is string => typeof x === 'string';
const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isNumberOrNull = (x: unknown) => x === null || isNumber(x);
const isStringOrNull = (x: unknown) => x === null || isString(x);
const isIntegerIn = (x: unknown, lo: number, hi: number) =>
  typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;

const isTeamLine = (x: unknown) =>
  isRecord(x) && isString(x.code) && isString(x.name) && isNumberOrNull(x.score);

export function isGameSummary(x: unknown): x is GameSummary {
  return (
    isRecord(x)
    && isString(x.gameId) && GAME_ID.test(x.gameId)
    && isString(x.date) && ISO_DATE.test(x.date)
    && isString(x.time) && HH_MM.test(x.time)
    && isString(x.stadium)
    && isTeamLine(x.away) && isTeamLine(x.home)
    && isString(x.status) && STATUSES.includes(x.status)
    && isStringOrNull(x.inningText)
  );
}

export function isGameSummaryList(x: unknown): x is GameSummary[] {
  return Array.isArray(x) && x.every(isGameSummary);
}

const isState = (x: unknown) =>
  isRecord(x)
  && isIntegerIn(x.inning, 1, MAX_INNING)
  && (x.half === 0 || x.half === 1)
  && isIntegerIn(x.outs, 0, 2)
  && isIntegerIn(x.bases, 0, 7)
  && isIntegerIn(x.away, 0, Number.MAX_SAFE_INTEGER)
  && isIntegerIn(x.home, 0, Number.MAX_SAFE_INTEGER)
  && isIntegerIn(x.slotAway, 0, 8)
  && isIntegerIn(x.slotHome, 0, 8);

const isLineup = (x: unknown) => Array.isArray(x) && x.length === LINEUP_SIZE && x.every(isString);
const isPitchRows = (x: unknown) =>
  Array.isArray(x) && x.every((row) => Array.isArray(row) && row.length === PITCH_ROW_LENGTH && row.every(isNumber));

function isPaRecord(x: unknown): x is PaRecord {
  return (
    isRecord(x)
    && isIntegerIn(x.no, 1, Number.MAX_SAFE_INTEGER)
    && isState(x.before)
    && isString(x.batter) && isString(x.pitcher)
    && isRecord(x.lineups) && isLineup(x.lineups.away) && isLineup(x.lineups.home)
    && isString(x.result)
    && (x.event === null || isIntegerIn(x.event, 0, 6))
    && isNumber(x.runs)
    && isPitchRows(x.pitches)
    && typeof x.complete === 'boolean'
    && isNumberOrNull(x.wpBeforeHome) && isNumberOrNull(x.wpAfterHome)
    && (x.startedAt === null || (isString(x.startedAt) && HH_MM_SS.test(x.startedAt)))
  );
}

const isCurrent = (x: unknown) =>
  x === null
  || (isRecord(x)
    && isState(x.state)
    && isIntegerIn(x.balls, 0, 3)
    && isIntegerIn(x.strikes, 0, 2)
    && isString(x.batter) && isString(x.pitcher));

const isStringMap = (x: unknown) => isRecord(x) && Object.values(x).every(isString);
const isHandsMap = (x: unknown) =>
  isRecord(x)
  && Object.values(x).every(
    (v) =>
      isRecord(v)
      && (v.bats === undefined || v.bats === 'L' || v.bats === 'R' || v.bats === 'S')
      && (v.throws === undefined || v.throws === 'L' || v.throws === 'R'),
  );

export function isLiveGame(x: unknown): x is LiveGame {
  if (
    !isRecord(x)
    || !isGameSummary(x.summary)
    || !isStringMap(x.names)
    || !isHandsMap(x.hands)
    || !Array.isArray(x.plateAppearances)
    || !x.plateAppearances.every(isPaRecord)
    || !isCurrent(x.current)
    || !isString(x.fetchedAt)
  ) {
    return false;
  }
  // no는 1부터 오름차순이어야 한다. 어긋나면 타석을 가리키는 Situation id가 다른 타석을 연다
  return (x.plateAppearances as PaRecord[]).every((pa, i) => pa.no === i + 1);
}
