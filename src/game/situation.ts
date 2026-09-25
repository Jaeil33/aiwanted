import { situationText } from '../domain/format';
import { HITTER_KEY_SUFFIX, hitterOf, nameMapOf, pitcherOf } from '../domain/players';
import { TEAMS, isTeamCode } from '../domain/teams';
import { pitcherAt, type LineupSlot, type TeamConfig } from '../engine';
import type { CoreData, PitchRow, PlayerRecord, SceneRecord, Situation, SituationKind } from '../types/data';
import type { EventVector, GameState, KnownPlayer, PitcherPlanEntry, PromptContext, RosterEntry, SceneContext, Side } from '../types/domain';
import type { LiveGame } from '../types/live';

/*
 * 되돌려볼 한 타석(Situation)을 엔진·AI·화면이 함께 쓰는 모양으로 조립한다(ADR-032·033).
 * 2026 시즌의 어떤 타석이든 여기로 들어온다: 지난 경기 타석(situationFromPa)과 골라 둔 장면(situationFromScene).
 *
 * 순수 모듈이다: DOM·fetch·타이머·Math.random·Date를 쓰지 않는다.
 */

/** 선수 손 기록. 없으면 우타·우투로 본다 */
export interface Hands {
  bats?: 'L' | 'R' | 'S';
  throws?: 'L' | 'R';
}

/** 한 타석을 엔진·AI·화면이 함께 쓰는 모양으로 조립한 값 */
export interface SituationSetup {
  situation: Situation;
  /** 화면 제목 한 줄: "9회말 2사 만루" */
  title: string;
  /** 그 경기가 실제로 끝난 점수. 모르면 null */
  actualFinal: { away: number; home: number } | null;
  lg: EventVector;
  countTable: number[][];
  away: TeamConfig;
  home: TeamConfig;
  /** 상황 반이닝을 끝까지 던지는 투수 */
  scenePitcher: LineupSlot;
  /** 그 경기에서 투수가 바뀐 지점(ADR-033). 비어 있으면 다음 반이닝부터 팀 불펜이 던진다 */
  pitcherPlan: PitcherPlanEntry[];
  /** 차례에 나오는 투수 id → 엔진 슬롯(rel). pitcherFor는 core를 다시 찾지 않는다 */
  pitcherSlots: Record<string, LineupSlot>;
  /** 투수 id → 그 경기에서 던진 투구 행. 연출이 리그 표본보다 이것을 먼저 쓴다 */
  gameRows: Record<string, PitchRow[]>;
  /** 상황 시점의 공격·수비 진영 */
  batSide: Side;
  fieldSide: Side;
  /** TMI 대상 확정 기준(상황 타자·투수·진영) */
  sceneContext: SceneContext;
  promptContext: PromptContext;
  /** 선수 id·불펜 id → 화면 이름 */
  names: Record<string, string>;
  /** 선수 id → 손 기록 (스위치 타자 타석 방향과 스테이지 투수 손) */
  hands: Record<string, Hands>;
  teamColors: { away: string; home: string };
}

/** core에 기록이 없는 선수를 채우는 값. 중계(LiveGame)에서 온다 */
export interface SituationExtra {
  names?: Record<string, string>;
  hands?: Record<string, Hands>;
  actualFinal?: { away: number; home: number } | null;
  /** 교체 기록까지 아는 쪽이 만든 제목(예: ", 대타"). 없으면 상황에서 만든다 */
  title?: string;
  /** 그 경기의 실제 투수 차례(`pitcherPlanOf`) */
  pitcherPlan?: PitcherPlanEntry[];
  /** 그 경기의 투구 표본(`gameRowsOf`) */
  gameRows?: Record<string, PitchRow[]>;
}

/** 기록이 없는 선수·불펜의 rel: 리그 평균 */
const ONE: EventVector = Object.freeze([1, 1, 1, 1, 1, 1, 1]);
/** 팀 코드가 틀렸을 때의 색 (UI_GUIDE --chalk) */
const FALLBACK_COLOR = '#EEF2E9';
/** 이 시각 전에 시작하면 낮 경기 */
const DAY_GAME_BEFORE = '17:00';
/** 지붕이 있는 구장 */
const DOME_STADIUM = '고척';
/** 연장 마지막 이닝 */
const LAST_INNING = 11;

const batSideOf = (state: Pick<GameState, 'half'>): Side => (state.half === 0 ? 'away' : 'home');
const otherSide = (side: Side): Side => (side === 'away' ? 'home' : 'away');

function handsOf(p: PlayerRecord): Hands {
  const hands: Hands = {};
  if (p.bats) hands.bats = p.bats;
  if (p.throws) hands.throws = p.throws;
  return hands;
}

/**
 * 화면 제목 한 줄: "9회말 2사 만루", 11회면 ", 마지막 이닝".
 * 기록으로 확인되는 꼬리표만 붙인다(ADR-014). 대타 여부처럼 교체 기록이 있어야 아는 것은 여기서 짐작하지 않고,
 * 아는 쪽(파이프라인이 만든 장면)이 `extra.title`로 넘긴다.
 */
export function situationTitle(situation: Situation): string {
  const title = situationText(situation.state);
  return situation.state.inning === LAST_INNING ? `${title}, 마지막 이닝` : title;
}

/**
 * 경기의 타석 하나를 상황으로 바꾼다. 없는 번호면 null.
 * 되돌려보기는 언제나 0-0부터다(ADR-016). 실제 결과는 끝난 타석(complete이고 7사건으로 읽힌 것)에만 담는다.
 */
export function situationFromPa(game: LiveGame, no: number, kind: SituationKind): Situation | null {
  const pa = game.plateAppearances.find((x) => x.no === no);
  if (!pa) return null;
  const s = game.summary;
  return {
    id: `${s.gameId}-${no}`,
    kind,
    gameId: s.gameId,
    paNo: no,
    date: s.date,
    stadium: s.stadium || null,
    away: { code: s.away.code, name: s.away.name },
    home: { code: s.home.code, name: s.home.name },
    state: pa.before,
    count: { balls: 0, strikes: 0 },
    batter: pa.batter,
    pitcher: pa.pitcher,
    lineups: pa.lineups,
    actual:
      pa.complete && pa.event !== null
        ? { result: pa.result, event: pa.event, runs: pa.runs, pitches: pa.pitches, wpAfterHome: pa.wpAfterHome }
        : null,
    naverWpBeforeHome: pa.wpBeforeHome,
    context: { tempC: null, windMs: null, dayGame: s.time < DAY_GAME_BEFORE, dome: s.stadium === DOME_STADIUM },
  };
}

/**
 * 골라 둔 장면을 상황 계약으로 옮긴다(step 10에서 장면 경로가 사라질 때까지 쓰는 다리).
 * 장면 id는 경기 id와 타석 번호를 그대로 가리키지 않으므로 gameId·paNo는 비운다.
 */
export function situationFromScene(scene: SceneRecord): Situation {
  return {
    id: scene.id,
    kind: 'past',
    gameId: null,
    paNo: null,
    date: scene.date,
    stadium: scene.stadium || null,
    away: { code: scene.away.code, name: scene.away.name },
    home: { code: scene.home.code, name: scene.home.name },
    state: scene.state,
    count: { balls: 0, strikes: 0 },
    batter: scene.batter,
    pitcher: scene.pitcher,
    lineups: scene.lineups,
    actual: {
      result: scene.actual.result,
      event: scene.actual.event,
      runs: scene.actual.runs,
      pitches: scene.actual.pitches,
      wpAfterHome: scene.actual.wpAfterHome,
    },
    naverWpBeforeHome: scene.naverWpBeforeHome,
    context: scene.context,
  };
}

/** 볼카운트 한 마디. 0-0이면 빈 문자열 */
function countText(count: { balls: number; strikes: number }): string {
  if (count.balls === 0 && count.strikes === 0) return '';
  return ` ${count.balls}볼 ${count.strikes}스트라이크`;
}

/**
 * 상황 하나로 SituationSetup을 만든다.
 * 타선 칸은 타자 기록(`hitterOf`), 상황 투수는 투수 기록(`pitcherOf`)으로 찾는다. 같은 id가 둘 다일 수 있다(ADR-035).
 * 기록이 없으면 rel 1(리그 평균), 불펜은 `core.bullpens[팀 코드]`(없으면 `<팀>-pen`·rel 1).
 */
export function buildSituationSetup(core: CoreData, situation: Situation, extra: SituationExtra = {}): SituationSetup {
  const slotOf = (id: string): LineupSlot => ({ id, rel: hitterOf(core, id)?.rel ?? ONE });
  const pitcherSlotOf = (id: string): LineupSlot => ({ id, rel: pitcherOf(core, id)?.rel ?? ONE });
  const bullpenOf = (side: Side): LineupSlot => {
    const code = situation[side].code;
    const pen = Object.hasOwn(core.bullpens, code) ? core.bullpens[code] : undefined;
    return pen ? { id: pen.id, rel: pen.rel } : { id: `${code}-pen`, rel: ONE };
  };
  const teamOf = (side: Side): TeamConfig => ({ lineup: situation.lineups[side].map(slotOf), bullpen: bullpenOf(side) });
  const away = teamOf('away');
  const home = teamOf('home');

  // core.players의 키는 투수 <id>, 겸업 타자 <id>:H다. 화면은 꼬리 없는 id로만 찾으므로 둘을 합친다(ADR-035)
  const names: Record<string, string> = { ...nameMapOf(core) };
  const hands: Record<string, Hands> = {};
  for (const [key, p] of Object.entries(core.players)) {
    const id = key.endsWith(HITTER_KEY_SUFFIX) ? key.slice(0, -HITTER_KEY_SUFFIX.length) : key;
    hands[id] = { ...hands[id], ...handsOf(p) };
  }
  // 2026 기록이 없는 선수(신인·군 복귀·외국인 교체)는 중계에서 모은 이름·손으로 채운다
  for (const [id, name] of Object.entries(extra.names ?? {})) {
    if (!Object.hasOwn(names, id)) names[id] = name;
  }
  for (const [id, hand] of Object.entries(extra.hands ?? {})) {
    hands[id] = { ...hand, ...hands[id] };
  }
  const nameFallback = (id: string) => {
    if (!Object.hasOwn(names, id)) names[id] = id;
  };
  for (const [side, team] of [['away', away], ['home', home]] as const) {
    names[team.bullpen.id] = `${situation[side].name} 불펜`;
    team.lineup.forEach((slot) => nameFallback(slot.id));
  }
  nameFallback(situation.batter);
  nameFallback(situation.pitcher);

  const batSide = batSideOf(situation.state);
  const fieldSide = otherSide(batSide);
  /** 상황 시점 타순: slot 1~9, 이름은 names(기록이 없으면 id) */
  const rosterOf = (side: Side): RosterEntry[] => situation.lineups[side].map((id, i) => ({ id, name: names[id], slot: i + 1 }));
  /** 팀 코드 → 상황 팀 이름 표기. 두 팀이 아니면 teams.ts 이름, 모르는 코드면 코드 그대로 */
  const teamNameOf = (code: string): string => {
    if (code === situation.away.code) return situation.away.name;
    if (code === situation.home.code) return situation.home.name;
    return isTeamCode(code) ? TEAMS[code].name : code;
  };
  const inSituation = new Set([...situation.lineups.away, ...situation.lineups.home, situation.pitcher]);
  const otherPlayers: KnownPlayer[] = Object.entries(core.players)
    .filter(([key]) => !inSituation.has(key.endsWith(HITTER_KEY_SUFFIX) ? key.slice(0, -HITTER_KEY_SUFFIX.length) : key))
    .map(([, p]) => ({ name: p.name, team: teamNameOf(p.team), kind: p.kind }));
  const promptContext: PromptContext = {
    date: situation.date,
    stadium: situation.stadium ?? '',
    awayName: situation.away.name,
    homeName: situation.home.name,
    awayScore: situation.state.away,
    homeScore: situation.state.home,
    situation: `${situationText(situation.state)}${countText(situation.count)}`,
    batter: {
      id: situation.batter,
      name: names[situation.batter],
      team: situation[batSide].name,
      bats: hitterOf(core, situation.batter)?.bats ?? 'R',
    },
    pitcher: {
      id: situation.pitcher,
      name: names[situation.pitcher],
      team: situation[fieldSide].name,
      throws: pitcherOf(core, situation.pitcher)?.throws ?? 'R',
    },
    battingTeam: situation[batSide].name,
    fieldingTeam: situation[fieldSide].name,
    lineupNames: [...away.lineup, ...home.lineup].map((slot) => names[slot.id]),
    battingLineup: rosterOf(batSide),
    fieldingLineup: rosterOf(fieldSide),
    otherPlayers,
    weather: { ...situation.context },
  };
  const colorOf = (side: Side) => {
    const code = situation[side].code;
    return isTeamCode(code) ? TEAMS[code].color : FALLBACK_COLOR;
  };

  const pitcherPlan = extra.pitcherPlan ?? [];
  const pitcherSlots: Record<string, LineupSlot> = {};
  for (const entry of pitcherPlan) pitcherSlots[entry.pitcher] ??= pitcherSlotOf(entry.pitcher);

  return {
    situation,
    title: extra.title ?? situationTitle(situation),
    actualFinal: extra.actualFinal ?? null,
    lg: core.league,
    countTable: core.countTable,
    away,
    home,
    scenePitcher: pitcherSlotOf(situation.pitcher),
    pitcherPlan,
    pitcherSlots,
    gameRows: extra.gameRows ?? {},
    batSide,
    fieldSide,
    sceneContext: { batterId: situation.batter, pitcherId: situation.pitcher, batSide },
    promptContext,
    names,
    hands,
    teamColors: { away: colorOf('away'), home: colorOf('home') },
  };
}

/** 타석 방향: 스위치 타자는 투수와 반대 손, 기록이 없으면 우타 */
export function batterStanceFor(bats: 'L' | 'R' | 'S' | undefined, throws: 'L' | 'R'): 'L' | 'R' {
  if (bats === 'S') return throws === 'R' ? 'L' : 'R';
  return bats === 'L' ? 'L' : 'R';
}

/** id의 화면 이름. 없으면 id */
export function nameOf(setup: SituationSetup, id: string): string {
  return Object.hasOwn(setup.names, id) ? setup.names[id] : id;
}

/** 투수 손. 기록이 없으면(불펜 합성 선수 포함) 우투 */
export function throwsOf(setup: SituationSetup, pitcherId: string): 'L' | 'R' {
  return (Object.hasOwn(setup.hands, pitcherId) ? setup.hands[pitcherId].throws : undefined) ?? 'R';
}

/**
 * 그 상태에서 던지는 투수. 상황 반이닝은 상황 투수가 끝까지 던지고(engine playout과 같은 규칙),
 * 그 뒤 반이닝은 그 경기에서 실제로 던진 투수(ADR-033), 차례를 모르면 수비 팀 불펜이다.
 */
export function pitcherFor(setup: SituationSetup, state: GameState): LineupSlot {
  const { inning, half } = setup.situation.state;
  if (state.inning === inning && state.half === half) return setup.scenePitcher;
  const id = pitcherAt(setup.pitcherPlan, state);
  if (id !== null && Object.hasOwn(setup.pitcherSlots, id)) return setup.pitcherSlots[id];
  return state.half === 0 ? setup.home.bullpen : setup.away.bullpen;
}

/** 그 상태 공격 팀 타순의 타자와 이름·타석 방향(그 상태 투수 손 기준) */
export function batterFor(setup: SituationSetup, state: GameState): LineupSlot & { name: string; stance: 'L' | 'R' } {
  const batSide = batSideOf(state);
  const slotIndex = batSide === 'away' ? state.slotAway : state.slotHome;
  const slot = setup[batSide].lineup[slotIndex];
  if (!slot) throw new RangeError(`batterFor: 타순은 0~8이어야 한다 (${batSide} ${slotIndex})`);
  const bats = Object.hasOwn(setup.hands, slot.id) ? setup.hands[slot.id].bats : undefined;
  return {
    id: slot.id,
    rel: slot.rel,
    name: nameOf(setup, slot.id),
    stance: batterStanceFor(bats, throwsOf(setup, pitcherFor(setup, state).id)),
  };
}
/**
 * 지금 치르고 있는 타석의 상황(ADR-033). 이어서 치는 동안 TMI 대상·AI 프롬프트 맥락이 여기서 나온다.
 * 상황 자체(타선·경기·날씨)는 그대로 두고 상태·타자·투수만 지금 것으로 바꾼다. 실제 결과는 없다(갈라진 경기다).
 */
export function currentSituation(setup: SituationSetup, state: GameState): Situation {
  const base = setup.situation;
  if (state === base.state) return base;
  const batSide = batSideOf(state);
  const slot = batSide === 'away' ? state.slotAway : state.slotHome;
  return {
    ...base,
    id: `${base.id}@${state.inning}-${state.half}-${slot}`,
    paNo: null,
    state,
    count: { balls: 0, strikes: 0 },
    batter: batterFor(setup, state).id,
    pitcher: pitcherFor(setup, state).id,
    actual: null,
    naverWpBeforeHome: null,
  };
}
