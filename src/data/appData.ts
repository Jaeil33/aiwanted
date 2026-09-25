import { hitterOf, pitcherOf } from '../domain/players';
import type { AppData, CoreData, EvidenceData, PitchData, SceneRecord, TrustData } from '../types/data';

/*
 * 앱 데이터 로더. 파이프라인 생성물(data/build/app/*.json, git 제외)을 빌드에 넣고 모양을 확인한다.
 * 필수 파일(core·pitches·scenes)이 없거나 모양이 틀리면 null(앱은 안내 화면), 선택 파일(evidence·trust)은 그 필드만 null.
 */

type Json = Record<string, unknown>;

/** 엔진이 받는 이닝 상한 (engine MAX_INN) */
const MAX_INNING = 11;
const PITCH_ROW_LENGTH = 16;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isRecord = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isString = (x: unknown): x is string => typeof x === 'string';
const isNumberOrNull = (x: unknown) => x === null || isNumber(x);
const isIntegerIn = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;
const isNumbers = (x: unknown, length?: number) =>
  Array.isArray(x) && (length === undefined || x.length === length) && x.every(isNumber);
const everyValue = (x: unknown, ok: (value: unknown) => boolean) => isRecord(x) && Object.values(x).every(ok);

const isPlayer = (x: unknown) =>
  isRecord(x) && isString(x.id) && isString(x.name) && isString(x.team) && (x.kind === 'H' || x.kind === 'P') && isNumbers(x.rel, 7) && isRecord(x.line);

const isBullpen = (x: unknown) => isRecord(x) && isString(x.id) && isString(x.team) && isString(x.name) && isNumbers(x.rel, 7);

function isCore(x: unknown): x is CoreData {
  return (
    isRecord(x) &&
    isRecord(x.meta) &&
    isNumbers(x.league, 7) &&
    Array.isArray(x.countTable) &&
    x.countTable.length === 12 &&
    x.countTable.every((row) => isNumbers(row, 5)) &&
    everyValue(x.players, isPlayer) &&
    everyValue(x.bullpens, isBullpen)
  );
}

const isPitchRows = (x: unknown) => Array.isArray(x) && x.every((row) => isNumbers(row, PITCH_ROW_LENGTH));

function isPitches(x: unknown): x is PitchData {
  return (
    isRecord(x) &&
    Array.isArray(x.pitchTypes) &&
    x.pitchTypes.every(isString) &&
    everyValue(x.byPitcher, isPitchRows) &&
    isRecord(x.pools) &&
    isPitchRows(x.pools.L) &&
    isPitchRows(x.pools.R)
  );
}

const isTeam = (x: unknown) => isRecord(x) && isString(x.code) && isString(x.name) && isNumber(x.final);

const isState = (x: unknown) =>
  isRecord(x) &&
  isIntegerIn(x.inning, 1, MAX_INNING) &&
  (x.half === 0 || x.half === 1) &&
  isIntegerIn(x.outs, 0, 2) &&
  isIntegerIn(x.bases, 0, 7) &&
  isIntegerIn(x.away, 0, Number.MAX_SAFE_INTEGER) &&
  isIntegerIn(x.home, 0, Number.MAX_SAFE_INTEGER) &&
  isIntegerIn(x.slotAway, 0, 8) &&
  isIntegerIn(x.slotHome, 0, 8);

const isLineup = (x: unknown) => Array.isArray(x) && x.length === 9 && x.every(isString);

const isActual = (x: unknown) =>
  isRecord(x) &&
  isString(x.result) &&
  isIntegerIn(x.event, 0, 6) &&
  isNumber(x.runs) &&
  Array.isArray(x.notes) &&
  x.notes.every(isString) &&
  isPitchRows(x.pitches) &&
  isNumberOrNull(x.wpAfterHome);

const isContext = (x: unknown) =>
  isRecord(x) && isNumberOrNull(x.tempC) && isNumberOrNull(x.windMs) && typeof x.dayGame === 'boolean' && typeof x.dome === 'boolean';

function isScene(x: unknown): x is SceneRecord {
  return (
    isRecord(x) &&
    isString(x.id) &&
    x.id !== '' &&
    (x.source === 'curated' || x.source === 'auto') &&
    isString(x.title) &&
    isString(x.date) &&
    ISO_DATE.test(x.date) &&
    isString(x.stadium) &&
    isTeam(x.away) &&
    isTeam(x.home) &&
    isState(x.state) &&
    isString(x.batter) &&
    isString(x.pitcher) &&
    isRecord(x.lineups) &&
    isLineup(x.lineups.away) &&
    isLineup(x.lineups.home) &&
    isNumber(x.leverage) &&
    isNumberOrNull(x.naverWpBeforeHome) &&
    isActual(x.actual) &&
    isContext(x.context)
  );
}

const isScenes = (x: unknown): x is SceneRecord[] => Array.isArray(x) && x.length > 0 && x.every(isScene);

function isEvidence(x: unknown): x is EvidenceData {
  return (
    isRecord(x) &&
    isString(x.method) &&
    isNumbers(x.trainSeasons) &&
    isNumber(x.testSeason) &&
    isRecord(x.games) &&
    isRecord(x.joint) &&
    Array.isArray(x.items) &&
    x.items.every((item) => isRecord(item) && isString(item.id) && isNumber(item.beta) && isString(item.verdict) && isRecord(item.test))
  );
}

function isTrust(x: unknown): x is TrustData {
  return isRecord(x) && isNumber(x.games) && isNumber(x.plateAppearances) && isRecord(x.brier) && isRecord(x.logLoss) && Array.isArray(x.calibration);
}

/** 경로가 `/<name>`으로 끝나는 파일 */
function fileNamed(files: Record<string, unknown>, name: string): unknown {
  const suffix = `/${name}`;
  for (const [path, value] of Object.entries(files)) {
    if (path.endsWith(suffix)) return value;
  }
  return undefined;
}

/** 파일 경로 → JSON 값 레코드(import.meta.glob 결과)에서 AppData를 만든다 */
export function loadAppData(files: Record<string, unknown>): AppData | null {
  const core = fileNamed(files, 'core.json');
  const pitches = fileNamed(files, 'pitches.json');
  const scenes = fileNamed(files, 'scenes.json');
  if (!isCore(core) || !isPitches(pitches) || !isScenes(scenes)) return null;
  const evidence = fileNamed(files, 'evidence.json');
  const trust = fileNamed(files, 'trust.json');
  return { core, pitches, scenes, evidence: isEvidence(evidence) ? evidence : null, trust: isTrust(trust) ? trust : null };
}

const EPOCH = Date.UTC(2026, 0, 1);
const DAY_MS = 86_400_000;

/** 오늘의 장면 번호: 2026-01-01부터 지난 날 수 % count (음수 없음). count가 양의 정수가 아니거나 날짜가 틀리면 0 */
export function todaySceneIndex(isoDate: string, count: number): number {
  if (!Number.isInteger(count) || count < 1) return 0;
  const match = ISO_DATE.exec(isoDate);
  if (!match) return 0;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return 0;
  const days = Math.round((time - EPOCH) / DAY_MS);
  return ((days % count) + count) % count;
}

/** 빌드에 넣은 앱 데이터 (파일이 없으면 null) */
export const APP_DATA: AppData | null = loadAppData(
  import.meta.glob('../../data/build/app/*.json', { eager: true, import: 'default' }) as Record<string, unknown>,
);

/** 겸업 선수 조회는 순수 모듈에 있다(ADR-035). 화면·게임 층이 여기서도 가져다 쓴다 */
export { hitterOf, pitcherOf };
