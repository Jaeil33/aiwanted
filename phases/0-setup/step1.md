# Step 1: core-contracts

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` (특히 "핵심 계약")
- `/docs/ADR.md` (ADR-002, 003, 004, 005, 009)
- `/docs/UI_GUIDE.md` (팀 컬러, 문구 형식)
- Step 0 산출물: `package.json`, `tsconfig.app.json`, `vitest.config.ts`, `src/main.tsx`, `src/test/setup.ts`, `scripts/run-python.ts`, `pytest.ini`, `pipeline/tmi_pipeline/__init__.py`
- 참고 원본(읽기만): `reference/tmi-prototype/engine.js`(EV, EVENT_LABEL, KNOBS), `reference/tmi-prototype/app.js`(josa, formatDelta, basesText, situationText, TEAM_COLOR, KNOB_HINT), `reference/tmi-prototype/build_data.py`(CODES, TYPES)

이 step의 산출물은 **공용 계약**이다. 다음 네 phase(1-engine, 2-data, 3-stage, 4-ai)가 서로의 코드를 보지 않고 이 파일들만 공유한 채 동시에 진행된다. 아래에 코드로 적힌 부분은 글자 그대로 옮긴다.

## 작업

### 1. `src/types/domain.ts` (그대로 작성)

```ts
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
  /** 두 팀 타자 이름 (대상 판별용) */
  lineupNames: string[];
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
```

### 2. `src/types/data.ts` (그대로 작성)

```ts
import type { EventIndex, GameState, MeasuredId, Verdict } from './domain';

export type TeamCode = 'HT' | 'LT' | 'NC' | 'HH' | 'LG' | 'OB' | 'SS' | 'SK' | 'KT' | 'WO';

export interface PlayerRecord {
  id: string;
  name: string;
  team: TeamCode;
  kind: 'H' | 'P';
  bats?: 'L' | 'R' | 'S';
  throws?: 'L' | 'R';
  /** 리그 대비 상대값, 길이 7 */
  rel: number[];
  /** 화면 표시용 시즌 기록. 타자: pa avg obp slg hr k bb / 투수: era ip k bb whip sv hold g */
  line: Record<string, number | string>;
}

export interface BullpenRecord {
  /** `${team}-pen` */
  id: string;
  team: TeamCode;
  name: string;
  rel: number[];
  /** 합친 구원투수 수 */
  n: number;
}

/** [type, speed, code(0 B,1 T,2 S,3 F,4 X), balls, strikes, stance(0 좌타,1 우타), x0, z0, vx0, vy0, vz0, ax, ay, az, topSz, bottomSz] — y0 = 55ft */
export type PitchRow = [
  number, number, number, number, number, number,
  number, number, number, number, number, number, number, number,
  number, number,
];

export interface SceneTeam {
  code: TeamCode;
  name: string;
  final: number;
}

export interface SceneRecord {
  id: string;
  source: 'curated' | 'auto';
  title: string;
  /** YYYY-MM-DD */
  date: string;
  stadium: string;
  away: SceneTeam;
  home: SceneTeam;
  state: GameState;
  batter: string;
  pitcher: string;
  /** 타순 0~8의 player id */
  lineups: { away: string[]; home: string[] };
  /** 네이버 wpaByPlate 절댓값(%p) */
  leverage: number;
  /** 0~1 */
  naverWpBeforeHome: number | null;
  actual: {
    result: string;
    event: EventIndex;
    runs: number;
    notes: string[];
    pitches: PitchRow[];
    /** 0~1 */
    wpAfterHome: number | null;
  };
  context: { tempC: number | null; windMs: number | null; dayGame: boolean; dome: boolean };
}

export interface CoreData {
  meta: { season: number; relayRange: [string, string]; relayGames: number; generatedAt: string; sources: string[] };
  /** 길이 7 리그 타석 결과 비율 */
  league: number[];
  /** 12행(볼 0~3 × 스트라이크 0~2, 인덱스 balls*3+strikes) × 5열(B,T,S,F,X), 행 합 1 */
  countTable: number[][];
  players: Record<string, PlayerRecord>;
  /** key: TeamCode */
  bullpens: Record<string, BullpenRecord>;
}

export interface PitchData {
  pitchTypes: string[];
  byPitcher: Record<string, PitchRow[]>;
  /** 투수 손 기준 리그 투구 표본 */
  pools: { L: PitchRow[]; R: PitchRow[] };
}

export interface EvidenceItem {
  id: MeasuredId;
  /** transform 한 단위당 log 득점 배수 */
  beta: number;
  se: number;
  /** beta 95% 구간 */
  ciLow: number;
  ciHigh: number;
  /** (exp(beta)-1)*100 */
  runsPctPerUnit: number;
  /** 학습 행 중 변수가 0이 아닌 팀-경기 수 */
  n: number;
  test: { devianceGainPerGame: number; ciLow: number; ciHigh: number; games: number };
  verdict: Verdict;
  note: string;
}

export interface EvidenceData {
  method: string;
  trainSeasons: number[];
  testSeason: number;
  games: { train: number; test: number };
  joint: { devianceGainPerGame: number; ciLow: number; ciHigh: number };
  items: EvidenceItem[];
}

export interface TrustData {
  games: number;
  plateAppearances: number;
  brier: { engine: number; naver: number; constant: number };
  logLoss: { engine: number; naver: number; constant: number };
  calibration: Array<{ lo: number; hi: number; predicted: number; actual: number; n: number }>;
  note: string;
}

export interface AppData {
  core: CoreData;
  pitches: PitchData;
  scenes: SceneRecord[];
  evidence: EvidenceData | null;
  trust: TrustData | null;
}
```

### 3. `src/domain/measured.json` (그대로 작성)

```json
[
  {"id": "temp_c", "label": "기온", "unit": "°C", "who": "env", "transform": {"kind": "linear", "center": 20, "per": 10, "min": -10, "max": 40}, "perLabel": "10°C 오를 때", "applicable": true, "examples": ["더워", "폭염", "추워", "쌀쌀"]},
  {"id": "wind_ms", "label": "바람 세기", "unit": "m/s", "who": "env", "transform": {"kind": "linear", "center": 0, "per": 5, "min": 0, "max": 20}, "perLabel": "바람이 5m/s 강해질 때", "applicable": true, "examples": ["바람", "강풍"]},
  {"id": "rain_pre3h", "label": "경기 전 3시간 강수", "unit": "mm", "who": "env", "transform": {"kind": "linear", "center": 0, "per": 1, "min": 0, "max": 10}, "perLabel": "비가 1mm 더 왔을 때", "applicable": true, "examples": ["비 온 뒤", "그라운드가 젖"]},
  {"id": "day_game", "label": "낮 경기", "unit": "", "who": "env", "transform": {"kind": "indicator"}, "perLabel": "오후 5시 전에 시작할 때", "applicable": true, "examples": ["낮 경기", "땡볕"]},
  {"id": "weekend", "label": "주말 경기", "unit": "", "who": "env", "transform": {"kind": "indicator"}, "perLabel": "토·일요일일 때", "applicable": true, "examples": ["주말", "일요일"]},
  {"id": "travel_km", "label": "원정 이동 거리", "unit": "km", "who": "team", "transform": {"kind": "linear", "center": 0, "per": 300, "min": 0, "max": 450}, "perLabel": "300km 더 이동했을 때", "applicable": true, "examples": ["버스로 이동", "원정길"]},
  {"id": "after_off_day", "label": "휴식일 다음 경기", "unit": "", "who": "team", "transform": {"kind": "indicator"}, "perLabel": "하루 이상 쉬고 왔을 때", "applicable": true, "examples": ["푹 쉬고", "휴식일"]},
  {"id": "starter_short_rest", "label": "상대 선발 짧은 휴식", "unit": "", "who": "opponentStarter", "transform": {"kind": "indicator"}, "perLabel": "상대 선발이 4일 이하 쉬고 나왔을 때", "applicable": true, "examples": ["짧게 쉬고", "당겨서 등판"]},
  {"id": "starter_long_rest", "label": "상대 선발 긴 휴식", "unit": "", "who": "opponentStarter", "transform": {"kind": "indicator"}, "perLabel": "상대 선발이 8일 이상 쉬고 나왔을 때", "applicable": true, "examples": ["오래 쉬", "실전 감각"]},
  {"id": "home", "label": "홈 경기", "unit": "", "who": "team", "transform": {"kind": "indicator"}, "perLabel": "홈에서 할 때", "applicable": false, "examples": ["홈 경기"]}
]
```

### 4. 런타임 상수 (`src/domain/`, 각 파일마다 테스트 먼저)
- `events.ts`: `EV = { K: 0, BB: 1, HR: 2, T3: 3, D2: 4, S1: 5, OUT: 6 } as const`, `EVENT_LABEL = ['삼진', '볼넷', '홈런', '3루타', '2루타', '안타', '범타']`, `PITCH_CODES: readonly PitchCode[] = ['B', 'T', 'S', 'F', 'X']`, `PITCH_CODE_LABEL: Record<PitchCode, string>` = 볼·스트라이크·헛스윙·파울·타격, `PITCH_TYPES = ['직구', '투심', '커터', '슬라이더', '스위퍼', '커브', '체인지업', '포크', '기타']`.
- `knobs.ts`: `KNOB_IDS: readonly KnobId[]`(engine.js KNOBS 순서 14개), `KNOB_META: Record<KnobId, { label: string; who: KnobWho; hint: string }>`(라벨은 engine.js, hint는 app.js KNOB_HINT), `SUBJECTS_FOR: Record<KnobWho, readonly Subject[]>` = batter → `batter, battingTeam, everyone` / pitcher → `pitcher, fieldingTeam, everyone` / field → `fieldingTeam, everyone` / env → `everyone` / team → `battingTeam, fieldingTeam`, `SUBJECT_LABEL: Record<Subject, string>` = 타자·투수·공격팀·수비팀·모두.
- `teams.ts`: `TEAMS: Record<TeamCode, { name: string; color: string }>` — 이름 KIA·롯데·NC·한화·LG·두산·삼성·SSG·KT·키움, 색은 UI_GUIDE 팀 컬러. `isTeamCode(x: string): x is TeamCode`.
- `measured.ts`: `MEASURED: readonly MeasuredDef[]` — `measured.json`을 import해 필드를 런타임 검증한 뒤 내보낸다(형식이 틀리면 throw). `measuredById(id: MeasuredId): MeasuredDef`, `transformValue(def: MeasuredDef, value: number): number` — linear는 min·max로 자른 뒤 `(v - center) / per`, indicator는 `value !== 0 ? 1 : 0`. 테스트 예: 기온 30 → 1, 기온 50 → 2(40으로 잘림), 낮 경기 5 → 1, `applicable === false`는 `home` 하나.
- `format.ts`: `formatPct(x)` → `"36.2%"`(소수 첫째 자리), `formatDeltaPp(d)` → app.js `formatDelta`와 같은 규칙(`+0.6%p`, `−0.07%p`(U+2212), `±0.00%p`), `josa(word, pair)`(app.js 그대로, `'이/가'`, `'은/는'`, `'을/를'`, `'으로/로'`), `basesText(bases)`(`주자 없음`, `만루`, `1·3루`), `situationText(state)` → `"9회말 2사 만루"`, `EVIDENCE_LABEL: Record<Evidence, string>` = 실측·그럴듯함·상상, `MODE_LABEL: Record<Mode, string>` = `현실 모드`·`만화 모드`.

### 5. 테스트 픽스처 `src/test/fixtures/appData.ts`
`export const fixtureAppData: AppData` — **합성 데이터**(실존 선수 이름·기록 금지):
- 원정 `HT` 타자 `a1`~`a9`(이름 "원정타자1"…), 홈 `LT` 타자 `h1`~`h9`, 투수 `ap`(원정, 우투), `hp`(홈, 좌투). rel은 대부분 `[1,1,1,1,1,1,1]`, 몇 명만 조금 다르게(예: `h6` 파워형 `[0.9, 1, 1.6, 1, 1.2, 1, 0.95]`).
- `league` 합 1(예: `[0.2, 0.09, 0.025, 0.004, 0.045, 0.15, 0.486]`), `countTable` 12행 × 5열, 행 합 1.
- 불펜 `HT-pen`, `LT-pen`(rel 1 벡터).
- `pitches.byPitcher.ap`에 code 0~4와 stance 0·1이 모두 들어간 PTS 행 10개 이상(대략 x0 -1.5, z0 5.8, vx0 5, vy0 -130, vz0 -5, ax -8, ay 28, az -15, topSz 3.4, bottomSz 1.6 근처), `pools.L`·`pools.R`에도 몇 개.
- 장면 1개: `id: 'fixture-walkoff'`, 9회말 2사 만루 동점(`away: 4, home: 4`), 타자 `h6`, 투수 `ap`, 실제 결과 만루 홈런(`event: 2`, `runs: 4`, `wpAfterHome: 1`), `context: { tempC: 27.5, windMs: 2.1, dayGame: false, dome: false }`.
- `evidence`: `temp_c`(verdict `maybe`)와 `day_game`(verdict `useless`) 두 항목. `trust`: 작은 값 한 벌.
- 테스트 먼저 `src/test/fixtures/appData.test.ts`: league 합 1(1e-9), countTable 행 합 1, 장면 라인업·타자·투수 id가 players에 있음, 장면 투수의 투구 행 존재, 모든 PitchRow 길이 16, evidence id가 `MEASURED`에 있음.

### 6. Python 계약 (`pipeline/`)
- 테스트 먼저 `pipeline/tests/test_contract.py`, 그다음 `pipeline/tmi_pipeline/contract.py`:
  - `MEASURED_PATH = ROOT / "src" / "domain" / "measured.json"`, `load_measured() -> list[dict]`, `measured_by_id() -> dict[str, dict]`, `transform_value(defn: dict, value: float) -> float`(TS와 같은 규칙, 같은 테스트 예시).
  - `EVENT_ORDER = ["K", "BB", "HR", "3B", "2B", "1B", "OUT"]`, `PITCH_TYPES`(TS와 같은 9개), `PITCH_RESULT_CODE = {"B": 0, "T": 1, "S": 2, "V": 2, "F": 3, "W": 3, "H": 4}`(네이버 pitchResult → PitchRow code).

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`src/types`는 타입만, 런타임 값은 `src/domain`)
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-setup/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 위 1~3의 타입 이름·필드·유니온 멤버·JSON 값을 바꾸지 마라. 이유: 이후 네 phase가 이 계약만 보고 동시에 작업한다.
- 엔진·캔버스·AI·파이프라인 처리 로직을 만들지 마라. 이유: 다음 phase의 범위다.
- 픽스처에 실존 선수 이름이나 실제 기록을 넣지 마라. 이유: ADR-005, 공개 저장소.
- `data/`를 읽는 테스트를 만들지 마라. 이유: 원자료가 없는 환경에서도 테스트가 통과해야 한다.
- 기존 테스트를 깨뜨리지 마라.
