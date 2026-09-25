import { hitterOf, pitcherOf } from '../domain/players';
import type { AppData, CoreData, EvidenceData, PitchData, TrustData } from '../types/data';

/*
 * 앱 데이터 로더. 파이프라인 생성물(data/build/app/*.json, git 제외)을 빌드에 넣고 모양을 확인한다.
 * 필수 파일(core·pitches)이 없거나 모양이 틀리면 null(앱은 안내 화면), 선택 파일(evidence·trust)은 그 필드만 null.
 * 장면(scenes.json)은 더 쓰지 않는다: 어떤 타석이든 `/api/game`으로 연다(ADR-032·035).
 */

type Json = Record<string, unknown>;

const PITCH_ROW_LENGTH = 16;

const isRecord = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isString = (x: unknown): x is string => typeof x === 'string';
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
    isRecord(x.pools) &&
    isPitchRows(x.pools.L) &&
    isPitchRows(x.pools.R)
  );
}

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
  if (!isCore(core) || !isPitches(pitches)) return null;
  const evidence = fileNamed(files, 'evidence.json');
  const trust = fileNamed(files, 'trust.json');
  return { core, pitches, evidence: isEvidence(evidence) ? evidence : null, trust: isTrust(trust) ? trust : null };
}

/** 빌드에 넣은 앱 데이터 (파일이 없으면 null) */
export const APP_DATA: AppData | null = loadAppData(
  import.meta.glob('../../data/build/app/*.json', { eager: true, import: 'default' }) as Record<string, unknown>,
);

/** 겸업 선수 조회는 순수 모듈에 있다(ADR-035). 화면·게임 층이 여기서도 가져다 쓴다 */
export { hitterOf, pitcherOf };
