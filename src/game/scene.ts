import { situationText } from '../domain/format';
import { TEAMS, isTeamCode } from '../domain/teams';
import type { LineupSlot, TeamConfig } from '../engine';
import type { AppData, PlayerRecord, SceneRecord } from '../types/data';
import type { EventVector, GameState, KnownPlayer, PromptContext, RosterEntry, SceneContext, Side } from '../types/domain';

/** 선수 손 기록. 없으면 우타·우투로 본다 */
export interface Hands {
  bats?: 'L' | 'R' | 'S';
  throws?: 'L' | 'R';
}

/** 장면 하나를 엔진·AI·화면이 함께 쓰는 모양으로 조립한 값 */
export interface SceneSetup {
  scene: SceneRecord;
  lg: EventVector;
  countTable: number[][];
  away: TeamConfig;
  home: TeamConfig;
  /** 장면 반이닝을 끝까지 던지는 투수 */
  scenePitcher: LineupSlot;
  /** 장면 시점의 공격·수비 진영 */
  batSide: Side;
  fieldSide: Side;
  /** TMI 대상 확정 기준(장면 타자·투수·진영) */
  sceneContext: SceneContext;
  promptContext: PromptContext;
  /** 선수 id·불펜 id → 화면 이름 */
  names: Record<string, string>;
  /** 선수 id → 손 기록 (스위치 타자 타석 방향과 스테이지 투수 손) */
  hands: Record<string, Hands>;
  teamColors: { away: string; home: string };
}

/** 기록이 없는 선수·불펜의 rel: 리그 평균 */
const ONE: EventVector = Object.freeze([1, 1, 1, 1, 1, 1, 1]);
/** 팀 코드가 틀렸을 때의 색 (UI_GUIDE --chalk) */
const FALLBACK_COLOR = '#EEF2E9';

const batSideOf = (state: Pick<GameState, 'half'>): Side => (state.half === 0 ? 'away' : 'home');
const otherSide = (side: Side): Side => (side === 'away' ? 'home' : 'away');

function handsOf(p: PlayerRecord): Hands {
  const hands: Hands = {};
  if (p.bats) hands.bats = p.bats;
  if (p.throws) hands.throws = p.throws;
  return hands;
}

/**
 * 장면 id로 SceneSetup을 만든다. 모르는 id면 Error.
 * 타선은 lineups id → core.players rel(없으면 rel 1), 불펜은 core.bullpens[팀 코드](없으면 `<팀>-pen`·rel 1).
 */
export function buildSceneSetup(data: AppData, sceneId: string): SceneSetup {
  const scene = data.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new Error(`buildSceneSetup: 모르는 장면 id "${sceneId}"`);
  const { core } = data;
  const playerOf = (id: string): PlayerRecord | undefined => (Object.hasOwn(core.players, id) ? core.players[id] : undefined);
  const slotOf = (id: string): LineupSlot => ({ id, rel: playerOf(id)?.rel ?? ONE });
  const bullpenOf = (side: Side): LineupSlot => {
    const code = scene[side].code;
    const pen = Object.hasOwn(core.bullpens, code) ? core.bullpens[code] : undefined;
    return pen ? { id: pen.id, rel: pen.rel } : { id: `${code}-pen`, rel: ONE };
  };
  const teamOf = (side: Side): TeamConfig => ({ lineup: scene.lineups[side].map(slotOf), bullpen: bullpenOf(side) });
  const away = teamOf('away');
  const home = teamOf('home');

  const names: Record<string, string> = {};
  const hands: Record<string, Hands> = {};
  for (const [id, p] of Object.entries(core.players)) {
    names[id] = p.name;
    hands[id] = handsOf(p);
  }
  const nameFallback = (id: string) => {
    if (!Object.hasOwn(names, id)) names[id] = id;
  };
  for (const [side, team] of [['away', away], ['home', home]] as const) {
    names[team.bullpen.id] = `${scene[side].name} 불펜`;
    team.lineup.forEach((slot) => nameFallback(slot.id));
  }
  nameFallback(scene.batter);
  nameFallback(scene.pitcher);

  const batSide = batSideOf(scene.state);
  const fieldSide = otherSide(batSide);
  /** 장면 시점 타순: slot 1~9, 이름은 names(기록이 없으면 id) */
  const rosterOf = (side: Side): RosterEntry[] => scene.lineups[side].map((id, i) => ({ id, name: names[id], slot: i + 1 }));
  /** 팀 코드 → 장면 팀 이름 표기. 장면 두 팀이 아니면 teams.ts 이름, 모르는 코드면 코드 그대로 */
  const teamNameOf = (code: string): string => {
    if (code === scene.away.code) return scene.away.name;
    if (code === scene.home.code) return scene.home.name;
    return isTeamCode(code) ? TEAMS[code].name : code;
  };
  const inScene = new Set([...scene.lineups.away, ...scene.lineups.home, scene.pitcher]);
  const otherPlayers: KnownPlayer[] = Object.entries(core.players)
    .filter(([id]) => !inScene.has(id))
    .map(([, p]) => ({ name: p.name, team: teamNameOf(p.team), kind: p.kind }));
  const promptContext: PromptContext = {
    date: scene.date,
    stadium: scene.stadium,
    awayName: scene.away.name,
    homeName: scene.home.name,
    awayScore: scene.state.away,
    homeScore: scene.state.home,
    situation: situationText(scene.state),
    batter: { id: scene.batter, name: names[scene.batter], team: scene[batSide].name, bats: playerOf(scene.batter)?.bats ?? 'R' },
    pitcher: {
      id: scene.pitcher,
      name: names[scene.pitcher],
      team: scene[fieldSide].name,
      throws: playerOf(scene.pitcher)?.throws ?? 'R',
    },
    battingTeam: scene[batSide].name,
    fieldingTeam: scene[fieldSide].name,
    lineupNames: [...away.lineup, ...home.lineup].map((slot) => names[slot.id]),
    battingLineup: rosterOf(batSide),
    fieldingLineup: rosterOf(fieldSide),
    otherPlayers,
    weather: { ...scene.context },
  };
  const colorOf = (side: Side) => {
    const code = scene[side].code;
    return isTeamCode(code) ? TEAMS[code].color : FALLBACK_COLOR;
  };

  return {
    scene,
    lg: core.league,
    countTable: core.countTable,
    away,
    home,
    scenePitcher: slotOf(scene.pitcher),
    batSide,
    fieldSide,
    sceneContext: { batterId: scene.batter, pitcherId: scene.pitcher, batSide },
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

/** (모듈 내부용) id의 화면 이름. 없으면 id */
export function nameOf(setup: SceneSetup, id: string): string {
  return Object.hasOwn(setup.names, id) ? setup.names[id] : id;
}

/** (모듈 내부용) 투수 손. 기록이 없으면(불펜 합성 선수 포함) 우투 */
export function throwsOf(setup: SceneSetup, pitcherId: string): 'L' | 'R' {
  return (Object.hasOwn(setup.hands, pitcherId) ? setup.hands[pitcherId].throws : undefined) ?? 'R';
}

/** 그 상태에서 던지는 투수: 장면과 같은 이닝·초말이면 장면 투수, 아니면 수비 팀 불펜 (engine playout과 같은 규칙) */
export function pitcherFor(setup: SceneSetup, state: GameState): LineupSlot {
  const { inning, half } = setup.scene.state;
  if (state.inning === inning && state.half === half) return setup.scenePitcher;
  return state.half === 0 ? setup.home.bullpen : setup.away.bullpen;
}

/** 그 상태 공격 팀 타순의 타자와 이름·타석 방향(그 상태 투수 손 기준) */
export function batterFor(setup: SceneSetup, state: GameState): LineupSlot & { name: string; stance: 'L' | 'R' } {
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
