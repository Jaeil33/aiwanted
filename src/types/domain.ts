/** 사건 순서: [K, BB(+HBP), HR, 3B, 2B, 1B, OUT(인플레이 아웃)] */
export type EventIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** 길이 7, EventIndex 순서 */
export type EventVector = readonly number[];

export type Side = 'away' | 'home';
/** 0 = 초(원정 공격), 1 = 말(홈 공격) */
export type Half = 0 | 1;
/** 1루=1, 2루=2, 3루=4 비트마스크 */
export type Bases = number;

export interface GameState {
  inning: number;
  half: Half;
  outs: number;
  bases: Bases;
  away: number;
  home: number;
  slotAway: number;
  slotHome: number;
}

/**
 * 그 경기에서 투수가 바뀐 지점 하나(ADR-033). 실제 중계에서 읽어 둔다.
 * `outs`는 그 투수가 그 반이닝에서 처음 던진 타석의 아웃 수다: 되돌려보다가 갈라진 경기에서도
 * 같은 이닝·같은 아웃에 같은 투수가 올라온다.
 */
export interface PitcherPlanEntry {
  inning: number;
  half: Half;
  outs: number;
  /** 선수 id */
  pitcher: string;
}

export type Play = 'K' | 'BB' | 'HR' | '3B' | '2B' | '1B' | 'DP' | 'GB' | 'FB' | 'SF' | 'LD';
/** [출발, 도착]: 출발 0=타자, 1~3=루 / 도착 1~3=루, 4=득점, -1=아웃 */
export type RunnerMove = readonly [from: number, to: number];

export interface Transition {
  p: number;
  bases: Bases;
  outs: number;
  runs: number;
  play: Play;
  moves: readonly RunnerMove[];
}

export type GameOver = { kind: 'half' } | { kind: 'game'; winner: Side | 'tie'; walkoff: boolean };

/** 공 하나의 결과: 볼, 루킹 스트라이크, 헛스윙, 파울, 인플레이 */
export type PitchCode = 'B' | 'T' | 'S' | 'F' | 'X';
export interface PitchSample {
  balls: number;
  strikes: number;
  code: PitchCode;
}

export type KnobId =
  | 'contact' | 'power' | 'eye' | 'focus' | 'speed'
  | 'stuff' | 'control' | 'stamina' | 'nerve'
  | 'defense' | 'carry' | 'slick' | 'glare' | 'mood';
export type KnobWho = 'batter' | 'pitcher' | 'field' | 'env' | 'team';
export type Subject = 'batter' | 'pitcher' | 'battingTeam' | 'fieldingTeam' | 'everyone';
export type Scope = 'pa' | 'game';
export type Evidence = 'measured' | 'plausible' | 'fun';
export type Mode = 'real' | 'toon';

export type MeasuredId =
  | 'temp_c' | 'wind_ms' | 'rain_pre3h' | 'day_game' | 'weekend'
  | 'travel_km' | 'after_off_day' | 'starter_short_rest' | 'starter_long_rest' | 'home';
export type MeasuredWho = 'env' | 'team' | 'opponentStarter';

export type MeasuredTransform =
  | { kind: 'linear'; center: number; per: number; min?: number; max?: number }
  | { kind: 'indicator' };

export interface MeasuredDef {
  id: MeasuredId;
  label: string;
  unit: string;
  who: MeasuredWho;
  transform: MeasuredTransform;
  perLabel: string;
  applicable: boolean;
  examples: string[];
}

export interface KnobPart {
  kind: 'knob';
  knob: KnobId;
  subject: Subject;
  /** -3..3 정수, 0 제외 */
  strength: number;
  scope: Scope;
  evidence: Evidence;
  why: string;
}

export interface MeasuredPart {
  kind: 'measured';
  variable: MeasuredId;
  /** measured.json 단위의 원래 값 (예: 기온 33, 낮 경기 1) */
  value: number;
  subject: Subject;
  why: string;
}

export type EffectPart = KnobPart | MeasuredPart;

export interface Interpretation {
  source: 'ai' | 'rules';
  refused: boolean;
  reason: string;
  comment: string;
  parts: EffectPart[];
}

export interface TmiEntry {
  id: string;
  text: string;
  interpretation: Interpretation;
  /** 건 순간의 타석 번호(0이 개입한 타석). scope 'pa' 효과는 그 타석에만 걸린다(ADR-033) */
  paIndex?: number;
  /** 건 순간의 타자·투수·진영. 없으면 상황 기준으로 본다 */
  context?: SceneContext;
}

/** TMI를 넣은 순간의 장면 기준: Subject를 선수 id·진영으로 확정할 때 쓴다 */
export interface SceneContext {
  batterId: string;
  pitcherId: string;
  batSide: Side;
}

export type EffectApplies =
  | { on: 'all' }
  | { on: 'batter'; id: string }
  | { on: 'pitcher'; id: string }
  | { on: 'batting'; side: Side }
  | { on: 'fielding'; side: Side };

export interface EngineEffect {
  applies: EffectApplies;
  /** 현실 모드 기준 로그 오즈 변화, 길이 7 */
  logOdds: EventVector;
  scope: Scope;
  /** 어떤 TMI에서 왔는지 (TmiEntry.id) */
  sourceId: string;
}

/** 장면 시점 타순의 한 칸 */
export interface RosterEntry {
  id: string;
  name: string;
  /** 타순 1~9 */
  slot: number;
}

/** 장면 두 팀 타순·장면 투수 밖의 데이터 선수(이름 인식용) */
export interface KnownPlayer {
  name: string;
  /** 팀 이름(PromptContext.battingTeam/fieldingTeam과 같은 표기) */
  team: string;
  kind: 'H' | 'P';
}

/** AI 프롬프트에 넣는 장면 설명 */
export interface PromptContext {
  date: string;
  stadium: string;
  awayName: string;
  homeName: string;
  awayScore: number;
  homeScore: number;
  /** 예: "9회말 2사 만루" */
  situation: string;
  batter: { id: string; name: string; team: string; bats: 'L' | 'R' | 'S' };
  pitcher: { id: string; name: string; team: string; throws: 'L' | 'R' };
  battingTeam: string;
  fieldingTeam: string;
  /** 두 팀 타자 이름 (대상 판별용, 호환 필드: 팀 구분은 battingLineup·fieldingLineup) */
  lineupNames: string[];
  /** 장면 시점 공격 팀 타순 */
  battingLineup: RosterEntry[];
  /** 장면 시점 수비 팀 타순 */
  fieldingLineup: RosterEntry[];
  /** 장면 두 팀 타순·투수 밖의 데이터 선수(이름 인식용) */
  otherPlayers: KnownPlayer[];
  weather: { tempC: number | null; windMs: number | null; dayGame: boolean; dome: boolean };
}

export type Verdict = 'real' | 'maybe' | 'useless';

export interface VerdictResult {
  source: 'ai' | 'rules';
  variables: MeasuredId[];
  verdict: Verdict | 'unmeasurable';
  headline: string;
  body: string;
}
