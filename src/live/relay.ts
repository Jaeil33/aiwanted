import { PITCH_RESULT_CODE, PITCH_TYPES } from '../domain/events.js';
import type { PitchRow, TeamCode } from '../types/data.js';
import type { EventIndex, GameState } from '../types/domain.js';
import type { GameStatus, GameSummary, LiveGame, PaRecord } from '../types/live.js';

/*
 * 네이버 문자중계를 타석·투구로 읽는다. pipeline/tmi_pipeline/relay.py를 그대로 옮긴 것이고,
 * 두 구현이 어긋나면 파이프라인이 만든 확률과 화면이 보여주는 타석이 서로 다른 경기가 된다.
 * 상수·분기·경계값을 바꾸려면 양쪽을 같이 고쳐라(scripts/check-relay-parity.ts가 지킨다).
 *
 * 순수 모듈이다. api/game.ts가 닿으므로 상대 import에 .js를 붙인다(ADR-028).
 */

type Json = Record<string, unknown>;

// textOption type
const INNING_HEADER = 0;
const PITCH = 1;
const PLAYER_CHANGE = 2;
const BATTER_INTRO = 8;
const RESULT_TYPES = [13, 23];
const NOTE_TYPES = [14, 24];

/** 스트라이크 카운트를 올리는 결과(2스트라이크 파울은 그대로) */
const STRIKE_RESULTS = ['T', 'S', 'V', 'F', 'W'];

/** PitchRow 7~16번째 값(PTS 운동 방정식 계수와 스트라이크존) */
const PTS_FIELDS = ['x0', 'z0', 'vx0', 'vy0', 'vz0', 'ax', 'ay', 'az', 'topSz', 'bottomSz'] as const;

/** 결과 문장 → 사건 인덱스. 먼저 걸리는 키워드를 쓴다 */
const EVENT_KEYWORDS: ReadonlyArray<readonly [string, EventIndex]> = [
  ['삼진', 0], ['볼넷', 1], ['고의4구', 1], ['몸에 맞는', 1],
  ['홈런', 2], ['3루타', 3], ['2루타', 4], ['1루타', 5], ['안타', 5],
];
const STRIKEOUT: EventIndex = 0;
const OUT_EVENT: EventIndex = 6;
const HOME_RUN: EventIndex = 2;
/** 원자료에 "낫 아웃"과 붙여 쓴 "낫아웃"이 섞여 있어 공백을 뺀 문장에서 찾는다 */
const DROPPED_THIRD_STRIKE = '낫아웃';

const PINCH_HITTER = 'pinch_hitter';
const PINCH_RUNNER = 'pinch_runner';
const PITCHER_CHANGE = 'pitcher';
const DEFENSE = 'defense';
const OTHER = 'other';
const KIND_BY_POSITION: Record<string, string> = { 대타: PINCH_HITTER, 대주자: PINCH_RUNNER, 투수: PITCHER_CHANGE };
const DEFENSE_POSITIONS = ['포수', '1루수', '2루수', '3루수', '유격수', '좌익수', '중견수', '우익수', '지명타자'];

const LINEUP_SIZE = 9;

/** fetchedAt 기본값. 부르는 쪽이 시각을 주지 않으면 이 값이 들어간다 */
const EPOCH = '1970-01-01T00:00:00.000Z';

// --- 원자료 읽기 도우미 (원자료는 문자열·숫자가 섞여 있다) ---

const rec = (x: unknown): Json => (typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Json) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');
const num = (x: unknown): number => {
  const n = Number(x ?? 0);
  return Number.isFinite(n) ? n : 0;
};
/**
 * Python `round(x, 3)`과 같은 값을 낸다. 두 가지를 모두 피해야 한다:
 *  - `Math.round(x * 1000)`: 곱셈이 부동소수점 오차를 위로 밀어(28.3065 → 28306.500000000004)
 *    Python이 내리는 값을 올린다.
 *  - `x.toFixed(3)`: 정확히 절반인 값을 0에서 먼 쪽으로 보낸다(-12.0625 → -12.063).
 *    Python은 짝수 쪽으로 보낸다(-12.062).
 * 그래서 toFixed(20)으로 실제 이진값의 소수를 펼친 뒤 절반일 때만 짝수로 맞춘다.
 * scripts/check-relay-parity.ts가 실제 42,854개 투구로 이것을 지킨다.
 */
function round3(x: number): number {
  if (!Number.isFinite(x)) return x;
  const sign = x < 0 ? -1 : 1;
  const s = Math.abs(x).toFixed(20);
  const dot = s.indexOf('.');
  if (dot === -1) return x;
  const head = Number(s.slice(0, dot) + s.slice(dot + 1, dot + 4));
  const rest = s.slice(dot + 4);
  const tie = rest.startsWith('5') && !/[1-9]/.test(rest.slice(1));
  const n = tie ? (head % 2 === 0 ? head : head + 1) : rest >= '5' ? head + 1 : head;
  return (sign * n) / 1000;
}

// --- 순수 계산 ---

/**
 * 결과 문장의 사건: 삼진 0, 볼넷·고의4구·몸에 맞는 공 1, 홈런 2, 3루타 3, 2루타 4, 안타 5, 나머지 6.
 *
 * 스트라이크 낫 아웃은 타자가 1루에서 잡혔든 폭투·포일·실책으로 출루했든 삼진(0)이다.
 * 한계: 사건 벡터(K, BB, HR, 3B, 2B, 1B, OUT)에 '삼진 뒤 출루'가 없어 낫 아웃 출루도 아웃된 삼진처럼 센다.
 */
export function eventOf(text: string): EventIndex {
  if (text.replace(/\s/g, '').includes(DROPPED_THIRD_STRIKE)) return STRIKEOUT;
  for (const [keyword, event] of EVENT_KEYWORDS) {
    if (text.includes(keyword)) return event;
  }
  return OUT_EVENT;
}

/** currentGameState의 base1..3(빈 루는 "0")을 비트마스크(1루=1, 2루=2, 3루=4)로 */
export function basesOf(state: unknown): number {
  const s = rec(state);
  let bases = 0;
  for (let i = 0; i < 3; i++) {
    const v = s[`base${i + 1}`];
    if (v !== '0' && v !== '' && v !== null && v !== undefined) bases |= 1 << i;
  }
  return bases;
}

/** 네이버 홈 승리확률(0~1). 홈+원정 합이 99~101이 아니면 무효(null) */
export function validHomeWp(metric: unknown): number | null {
  const m = rec(metric);
  const home = m.homeTeamWinRate;
  const away = m.awayTeamWinRate;
  if (typeof home !== 'number' || typeof away !== 'number') return null;
  const sum = home + away;
  if (sum < 99 || sum > 101) return null;
  return home / 100;
}

export interface WalkedPitch {
  option: Json;
  pts: Json | null;
  /** 던지기 전 볼 */
  balls: number;
  /** 던지기 전 스트라이크 */
  strikes: number;
}

/** 한 타석의 투구마다 던지기 전 볼·스트라이크를 붙여 낸다 */
export function walkPitches(opts: readonly unknown[], ptsById: Record<string, unknown>): WalkedPitch[] {
  const out: WalkedPitch[] = [];
  let balls = 0;
  let strikes = 0;
  for (const raw of opts) {
    const t = rec(raw);
    const result = str(t.pitchResult);
    if (num(t.type) !== PITCH || !(result in PITCH_RESULT_CODE)) continue;
    const pts = ptsById[str(t.ptsPitchId)];
    out.push({ option: t, pts: pts === undefined ? null : rec(pts), balls, strikes });
    if (result === 'B') balls = Math.min(balls + 1, 3);
    else if (STRIKE_RESULTS.includes(result)) strikes = Math.min(strikes + 1, 2);
  }
  return out;
}

/** PitchRow: [type, speed, code, balls, strikes, stance, x0, z0, vx0, vy0, vz0, ax, ay, az, topSz, bottomSz] */
export function pitchRow(option: unknown, pts: unknown, balls: number, strikes: number): PitchRow {
  const t = rec(option);
  const p = rec(pts);
  const stuff = str(t.stuff);
  const kind = PITCH_TYPES.indexOf(stuff);
  const values = PTS_FIELDS.map((k) => round3(num(p[k])));
  return [
    kind >= 0 ? kind : PITCH_TYPES.indexOf('기타'),
    Math.trunc(num(t.speed)),
    PITCH_RESULT_CODE[str(t.pitchResult)],
    balls,
    strikes,
    p.stance === 'L' ? 0 : 1,
    ...values,
  ] as PitchRow;
}

// --- relay 순회 ---

/** textOptions가 있는 relay를 첫 seqno 순으로 */
export function chrono(payload: unknown): Json[] {
  const relays = arr(rec(payload).textRelays)
    .map(rec)
    .filter((r) => arr(r.textOptions).length > 0);
  return relays.sort((a, b) => firstSeq(a) - firstSeq(b));
}

const firstSeq = (relay: Json): number =>
  Math.min(...arr(relay.textOptions).map((t) => num(rec(t).seqno)));

/** 한 relay의 textOptions를 seqno 순으로 */
export function sortedOptions(relay: unknown): Json[] {
  return arr(rec(relay).textOptions)
    .map(rec)
    .sort((a, b) => num(a.seqno) - num(b.seqno));
}

/** 타석 하나. PaRecord로 바뀌기 전의 중간 모양이다 */
export interface RawPa {
  index: number;
  inning: number;
  half: 0 | 1;
  side: 'away' | 'home';
  batterId: string;
  batterName: string;
  batOrder: number;
  hitType: string;
  state: GameState;
  pitcherId: string;
  options: Json[];
  ptsById: Record<string, unknown>;
  resultText: string;
  complete: boolean;
  runs: number;
  event: EventIndex;
  wpHomeAfter: number | null;
  wpHomeBefore: number | null;
  startedAt: string | null;
  /** 첫 투구(없으면 첫 결과)의 seqno. 이보다 앞선 교체만 이 타석에 반영한다 */
  playSeq: number;
}

/** 투구 옵션마다의 투수 id를 시간순으로, 연속 중복 없이 */
function pitcherIdsOf(opts: readonly Json[]): string[] {
  const ids: string[] = [];
  for (const t of opts) {
    if (num(t.type) !== PITCH) continue;
    const pitcher = str(rec(t.currentGameState).pitcher);
    if (pitcher && ids[ids.length - 1] !== pitcher) ids.push(pitcher);
  }
  return ids;
}

/**
 * 타자 소개(type 8 + batterRecord)가 있는 relay를 시간순으로 타석으로 읽는다.
 *
 * 투구도 결과도 없는 relay(타자 소개 뒤 대타 교체만 적힌 빈 타석 등)는 건너뛰고 번호를 매기지 않는다.
 * 결과 없이 투구만 있는 타석(주루사로 이닝이 끝났거나 타석 도중 대타가 들어온 경우)은 complete false로 남긴다.
 */
export function plateAppearances(payload: unknown): RawPa[] {
  const out: RawPa[] = [];
  for (const relay of chrono(payload)) {
    const opts = sortedOptions(relay);
    const head = opts.find((t) => num(t.type) === BATTER_INTRO && rec(t.batterRecord).pcode !== undefined);
    if (!head) continue;
    const hasPitch = opts.some((t) => num(t.type) === PITCH);
    const complete = opts.some((t) => RESULT_TYPES.includes(num(t.type)));
    if (!hasPitch && !complete) continue;

    const record = rec(head.batterRecord);
    const gs = rec(head.currentGameState);
    const introPitcher = str(gs.pitcher);
    const pitcherIds = pitcherIdsOf(opts);
    if (pitcherIds.length === 0 && introPitcher) pitcherIds.push(introPitcher);
    const half: 0 | 1 = str(relay.homeOrAway) === '1' ? 1 : 0;
    const inning = Math.trunc(num(relay.inn));
    const resultText = str(opts.find((t) => RESULT_TYPES.includes(num(t.type)))?.text);
    const event = eventOf(resultText);
    const homeIns = opts.filter((t) => NOTE_TYPES.includes(num(t.type)) && str(t.text).includes('홈인')).length;
    const wp = validHomeWp(relay.metricOption);
    const playSeqs = opts
      .filter((t) => num(t.type) === PITCH || RESULT_TYPES.includes(num(t.type)))
      .map((t) => num(t.seqno));

    out.push({
      index: out.length,
      inning,
      half,
      side: half ? 'home' : 'away',
      batterId: str(record.pcode),
      batterName: str(record.name),
      batOrder: Math.trunc(num(record.batOrder)),
      hitType: str(record.hitType),
      state: {
        inning,
        half,
        outs: Math.trunc(num(gs.out)),
        bases: basesOf(gs),
        away: Math.trunc(num(gs.awayScore)),
        home: Math.trunc(num(gs.homeScore)),
        slotAway: 0,
        slotHome: 0,
      },
      pitcherId: pitcherIds[0] ?? '',
      options: opts,
      ptsById: Object.fromEntries(arr(relay.ptsOptions).map((p) => [str(rec(p).pitchId), p])),
      resultText,
      complete,
      runs: homeIns + (event === HOME_RUN ? 1 : 0),
      event,
      wpHomeAfter: wp,
      wpHomeBefore: null,
      startedAt: null,
      playSeq: playSeqs.length > 0 ? Math.min(...playSeqs) : firstSeq(relay),
    });
  }
  // 이전 타석이 끝난 뒤의 승리확률이 이번 타석 직전 값이다
  for (let i = 1; i < out.length; i++) out[i].wpHomeBefore = out[i - 1].wpHomeAfter;
  return out;
}

export interface Substitution {
  seq: number;
  inning: number;
  half: 0 | 1;
  side: 'away' | 'home';
  /** 1~9, 타순 밖이면 null */
  slot: number | null;
  inId: string;
  outId: string;
  kind: string;
}

/** inPlayer.outPlayerTurn % 10이 타순(1~9). 0(투수 교체 등)이거나 값이 없으면 null */
function slotOf(turn: unknown): number | null {
  const n = Number(turn);
  if (!Number.isFinite(n)) return null;
  const slot = Math.trunc(n) % 10;
  return slot >= 1 && slot <= LINEUP_SIZE ? slot : null;
}

/** 교체 문장에서 들어온 선수 쪽(":" 뒤) 첫 단어로 종류를 정한다. ":"가 없으면 inPlayer.playerPos */
function changeKind(text: string, inPosition: string): string {
  const at = text.indexOf(':');
  const words = at === -1 ? [] : text.slice(at + 1).trim().split(/\s+/).filter(Boolean);
  const position = words.length > 0 ? words[0].split('(')[0] : inPosition;
  if (position in KIND_BY_POSITION) return KIND_BY_POSITION[position];
  return DEFENSE_POSITIONS.includes(position) ? DEFENSE : OTHER;
}

/** 교체 옵션(type 2) 중 들어온·나간 선수 id가 모두 있는 선수 교체를 시간순으로 */
export function substitutions(payload: unknown): Substitution[] {
  const out: Substitution[] = [];
  for (const relay of chrono(payload)) {
    const half: 0 | 1 = str(relay.homeOrAway) === '1' ? 1 : 0;
    const batting: 'away' | 'home' = half ? 'home' : 'away';
    const fielding: 'away' | 'home' = half ? 'away' : 'home';
    for (const t of sortedOptions(relay)) {
      const change = rec(t.playerChange);
      const inPlayer = rec(change.inPlayer);
      const outPlayer = rec(change.outPlayer);
      if (num(t.type) !== PLAYER_CHANGE || !inPlayer.playerId || !outPlayer.playerId) continue;
      const kind = changeKind(str(t.text) || str(change.liveText), str(inPlayer.playerPos));
      out.push({
        seq: num(t.seqno),
        inning: Math.trunc(num(relay.inn)),
        half,
        side: kind === PINCH_HITTER || kind === PINCH_RUNNER ? batting : fielding,
        slot: slotOf(inPlayer.outPlayerTurn),
        inId: str(inPlayer.playerId),
        outId: str(outPlayer.playerId),
        kind,
      });
    }
  }
  return out.sort((a, b) => a.seq - b.seq);
}

/**
 * 대상 타석 첫 공 시점에 양 팀 타순 1~9번에 있던 선수(ADR-014).
 *
 * 선발 타순: 슬롯마다 그 슬롯 첫 타석의 타자. 그 첫 타석보다 먼저 그 슬롯의 교체가 있었으면 가장 이른 교체의 나간 선수.
 * 여기에 첫 공 전의 교체를 시간순으로 적용한다. 끝까지 모르는 칸은 null.
 */
export function lineupsAt(
  pas: readonly RawPa[],
  subs: readonly Substitution[],
  target: RawPa,
): { away: (string | null)[]; home: (string | null)[] } {
  const firstPa = new Map<string, RawPa>();
  for (const pa of pas) {
    const key = `${pa.side}:${pa.batOrder}`;
    if (pa.batOrder >= 1 && pa.batOrder <= LINEUP_SIZE && !firstPa.has(key)) firstPa.set(key, pa);
  }
  const ordered = [...subs].sort((a, b) => a.seq - b.seq);
  const firstSub = new Map<string, Substitution>();
  for (const sub of ordered) {
    if (sub.slot === null) continue;
    const key = `${sub.side}:${sub.slot}`;
    if (!firstSub.has(key)) firstSub.set(key, sub);
  }

  const lineups: { away: (string | null)[]; home: (string | null)[] } = { away: [], home: [] };
  for (const side of ['away', 'home'] as const) {
    for (let slot = 1; slot <= LINEUP_SIZE; slot++) {
      const pa = firstPa.get(`${side}:${slot}`);
      const sub = firstSub.get(`${side}:${slot}`);
      if (sub !== undefined && (pa === undefined || sub.seq < pa.playSeq)) lineups[side].push(sub.outId);
      else lineups[side].push(pa !== undefined ? pa.batterId : null);
    }
  }

  for (const sub of ordered) {
    if (sub.slot !== null && sub.seq < target.playSeq) lineups[sub.side][sub.slot - 1] = sub.inId;
  }
  if (target.batOrder >= 1 && target.batOrder <= LINEUP_SIZE) {
    lineups[target.side][target.batOrder - 1] = target.batterId;
  }
  return lineups;
}

// --- 바깥 계약으로 ---

/** 일정 API의 경기 하나 → GameSummary. reversedHomeAway는 무시한다(id가 원정-홈 순서를 담는다) */
export function summaryFromSchedule(game: unknown): GameSummary {
  const g = rec(game);
  const dateTime = str(g.gameDateTime);
  const date = str(g.gameDate) || dateTime.slice(0, 10);
  const status = statusOf(g);
  const scored = status !== 'before' && status !== 'cancelled';
  return {
    gameId: str(g.gameId),
    date,
    time: dateTime.slice(11, 16),
    stadium: str(g.stadium),
    away: { code: str(g.awayTeamCode) as TeamCode, name: str(g.awayTeamName), score: scored ? Math.trunc(num(g.awayTeamScore)) : null },
    home: { code: str(g.homeTeamCode) as TeamCode, name: str(g.homeTeamName), score: scored ? Math.trunc(num(g.homeTeamScore)) : null },
    status,
    inningText: status === 'live' ? str(g.statusInfo) || null : null,
  };
}

function statusOf(g: Json): GameStatus {
  if (g.cancel === true) return 'cancelled';
  if (g.suspended === true) return 'suspended';
  const code = str(g.statusCode);
  if (code === 'BEFORE') return 'before';
  if (code === 'RESULT') return 'final';
  return 'live';
}

/** 중계 응답의 현재 이닝. 경기 전이면 0 */
export function latestInning(payload: unknown): number {
  return Math.trunc(num(rec(payload).inn));
}

/** 로컬 원자료 `{ game, textRelays }`를 parseRelay가 받는 payload 하나로 */
export function localRelayPayloads(raw: unknown): Json[] {
  const r = rec(raw);
  return [{ inn: 0, textRelays: arr(r.textRelays), currentGameState: {} }];
}

export interface ParseRelayInput {
  summary: GameSummary;
  /** 이닝별로 받은 중계 응답들. textRelays는 no로 합친다 */
  payloads: readonly unknown[];
  /** 선수 id → 이름. 없으면 중계에 적힌 이름만 쓴다 */
  names?: Record<string, string>;
  /** 받아 온 시각(ISO 8601). 순수 모듈이라 시계는 부르는 쪽이 준다 */
  fetchedAt?: string;
}

/** 중계 응답들을 앱 계약 LiveGame으로 줄인다(ADR-017) */
export function parseRelay({ summary, payloads, names = {}, fetchedAt = EPOCH }: ParseRelayInput): LiveGame {
  const merged = new Map<number, unknown>();
  for (const payload of payloads) {
    for (const relay of arr(rec(payload).textRelays)) merged.set(num(rec(relay).no), relay);
  }
  const combined = { textRelays: [...merged.values()] };
  const pas = plateAppearances(combined);
  const subs = substitutions(combined);

  const foundNames: Record<string, string> = { ...names };
  const hands: Record<string, { bats?: 'L' | 'R' | 'S'; throws?: 'L' | 'R' }> = {};
  for (const pa of pas) {
    if (pa.batterName) foundNames[pa.batterId] ??= pa.batterName;
    const bats = batsOf(pa.hitType);
    if (bats) hands[pa.batterId] = { ...hands[pa.batterId], bats };
  }
  for (const sub of subs) {
    const name = names[sub.inId];
    if (name) foundNames[sub.inId] ??= name;
  }

  const plateAppearanceRecords: PaRecord[] = [];
  // 끝낸 타석만 다음 타순을 민다(타석 도중 이닝이 끝난 타자는 다음 이닝에 다시 선다). snapshot.py와 같은 규칙이다
  const lastOrder = { away: 0, home: 0 };
  for (const pa of pas) {
    const lineups = lineupsAt(pas, subs, pa);
    const slots = slotsOf(lastOrder, pa);
    if (pa.complete) lastOrder[pa.side] = pa.batOrder;
    // 타순 아홉 칸이 다 확정된 타석만 되돌려볼 수 있다
    if (lineups.away.some((x) => x === null) || lineups.home.some((x) => x === null)) continue;
    plateAppearanceRecords.push({
      no: plateAppearanceRecords.length + 1,
      before: { ...pa.state, ...slots },
      batter: pa.batterId,
      pitcher: pa.pitcherId,
      lineups: { away: lineups.away as string[], home: lineups.home as string[] },
      result: pa.resultText,
      event: pa.complete ? pa.event : null,
      runs: pa.runs,
      pitches: walkPitches(pa.options, pa.ptsById)
        .filter((p) => p.pts !== null)
        .map((p) => pitchRow(p.option, p.pts, p.balls, p.strikes)),
      complete: pa.complete,
      wpBeforeHome: pa.wpHomeBefore,
      wpAfterHome: pa.wpHomeAfter,
      startedAt: pa.startedAt,
    });
  }

  return {
    summary,
    names: foundNames,
    hands,
    plateAppearances: plateAppearanceRecords,
    current: currentOf(payloads, summary, pas, lastOrder),
    fetchedAt,
  };
}

/**
 * 타순 칸: 공격 쪽은 지금 타자의 자리(batOrder − 1), 수비 쪽은 다음 차례(마지막 타순 % 9).
 * 중계 원문에는 이 값이 없다. 이어서 플레이할 때 다음 타자를 여기서 안다(ADR-033).
 */
function slotsOf(lastOrder: { away: number; home: number }, pa: RawPa): { slotAway: number; slotHome: number } {
  const field = pa.side === 'away' ? 'home' : 'away';
  const mine = pa.batOrder >= 1 && pa.batOrder <= LINEUP_SIZE ? pa.batOrder - 1 : lastOrder[pa.side] % LINEUP_SIZE;
  const theirs = lastOrder[field] % LINEUP_SIZE;
  return pa.side === 'away' ? { slotAway: mine, slotHome: theirs } : { slotAway: theirs, slotHome: mine };
}

function batsOf(hitType: string): 'L' | 'R' | 'S' | undefined {
  if (!hitType) return undefined;
  if (hitType.includes('양타')) return 'S';
  return hitType.includes('좌타') ? 'L' : 'R';
}

/** 진행 중 타석. 머리 필드 currentGameState는 이닝 인자와 무관하게 언제나 현재다 */
function currentOf(
  payloads: readonly unknown[],
  summary: GameSummary,
  pas: readonly RawPa[],
  lastOrder: { away: number; home: number },
): LiveGame['current'] {
  if (summary.status !== 'live') return null;
  const last = payloads[payloads.length - 1];
  const gs = rec(rec(last).currentGameState);
  const batter = str(gs.batter);
  const pitcher = str(gs.pitcher);
  if (!batter || !pitcher) return null;
  const inning = latestInning(last);
  const half: 0 | 1 = str(rec(last).homeOrAway) === '1' ? 1 : 0;
  const side = half ? 'home' : 'away';
  // 지금 타석이 이미 중계에 적혀 있으면(투구는 있고 결과가 없는 타석) 그 타순을, 아니면 다음 차례를 쓴다
  const started = [...pas].reverse().find((pa) => pa.side === side && pa.batterId === batter && !pa.complete);
  const batting = started && started.batOrder >= 1 && started.batOrder <= LINEUP_SIZE
    ? started.batOrder - 1
    : lastOrder[side] % LINEUP_SIZE;
  const fielding = lastOrder[side === 'away' ? 'home' : 'away'] % LINEUP_SIZE;
  return {
    state: {
      inning,
      half,
      outs: Math.trunc(num(gs.out)),
      bases: basesOf(gs),
      away: Math.trunc(num(gs.awayScore)),
      home: Math.trunc(num(gs.homeScore)),
      slotAway: side === 'away' ? batting : fielding,
      slotHome: side === 'home' ? batting : fielding,
    },
    balls: Math.min(Math.trunc(num(gs.ball)), 3),
    strikes: Math.min(Math.trunc(num(gs.strike)), 2),
    batter,
    pitcher,
  };
}

export { INNING_HEADER, LINEUP_SIZE, PINCH_HITTER, PINCH_RUNNER, PITCHER_CHANGE, DEFENSE, OTHER };
