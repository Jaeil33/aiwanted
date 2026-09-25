/**
 * TS 중계 파서(src/live/relay.ts)가 Python(pipeline/tmi_pipeline/relay.py)과 같은 답을 내는지 실제 원자료로 대조한다.
 *
 * 두 구현이 어긋나면 파이프라인이 만든 확률과 화면이 보여주는 타석이 서로 다른 경기가 된다.
 * 네트워크를 부르지 않는다. 원자료가 없으면 건너뛴다(CI·다른 기계).
 *
 * 사용: npm run check:relay
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pitchRow, plateAppearances, walkPitches } from '../src/live/relay';
import { pythonEnv, resolvePython } from './run-python';

/** 일치율이 이 아래면 실패한다 */
const THRESHOLD = 0.99;
/** 어긋남을 이만큼만 모은다 */
const MAX_MISMATCHES = 20;

export interface RefPa {
  index: number; inning: number; half: number; batter: string; pitcher: string; batOrder: number;
  outs: number; bases: number; away: number; home: number;
  event: number; runs: number; complete: boolean; rows: number[][];
}

export interface Mismatch {
  gameId: string;
  index: number;
  what: string;
  python: string;
  typescript: string;
}

export interface ParityResult {
  games: number;
  plateAppearances: number;
  matched: number;
  pitches: number;
  pitchesMatched: number;
  mismatches: Mismatch[];
}

/** 한 타석에서 대조하는 값들. 하나라도 다르면 그 타석은 어긋난 것으로 센다 */
const refFieldsOf = (pa: RefPa): string =>
  JSON.stringify([
    pa.inning, pa.half, pa.batter, pa.pitcher, pa.batOrder,
    pa.outs, pa.bases, pa.away, pa.home, pa.event, pa.runs, pa.complete,
  ]);

/** 기준값(Python)과 원자료를 받아 TS 파서와 맞춰 본다 */
export function compare(
  reference: Record<string, RefPa[]>,
  rawOf: (gameId: string) => unknown,
): ParityResult {
  const result: ParityResult = {
    games: 0, plateAppearances: 0, matched: 0, pitches: 0, pitchesMatched: 0, mismatches: [],
  };
  const note = (m: Mismatch) => {
    if (result.mismatches.length < MAX_MISMATCHES) result.mismatches.push(m);
  };

  for (const [gameId, refPas] of Object.entries(reference)) {
    const raw = rawOf(gameId);
    if (raw === null || raw === undefined) continue;
    result.games++;
    const mine = plateAppearances({ textRelays: (raw as { textRelays?: unknown[] }).textRelays ?? [] });
    result.plateAppearances += refPas.length;

    if (mine.length !== refPas.length) {
      note({ gameId, index: -1, what: '타석 수', python: String(refPas.length), typescript: String(mine.length) });
    }

    const n = Math.min(mine.length, refPas.length);
    for (let i = 0; i < n; i++) {
      const ref = refPas[i];
      const got = mine[i];
      const mineFields = JSON.stringify([
        got.inning, got.half, got.batterId, got.pitcherId, got.batOrder,
        got.state.outs, got.state.bases, got.state.away, got.state.home, got.event, got.runs, got.complete,
      ]);
      if (mineFields === refFieldsOf(ref)) result.matched++;
      else note({ gameId, index: i, what: '타석 값', python: refFieldsOf(ref), typescript: mineFields });

      const rows = walkPitches(got.options, got.ptsById)
        .filter((p) => p.pts !== null)
        .map((p) => pitchRow(p.option, p.pts, p.balls, p.strikes));
      result.pitches += ref.rows.length;
      if (rows.length !== ref.rows.length) {
        note({ gameId, index: i, what: '투구 수', python: String(ref.rows.length), typescript: String(rows.length) });
      }
      for (let j = 0; j < Math.min(rows.length, ref.rows.length); j++) {
        const mineRow = JSON.stringify(rows[j]);
        const refRow = JSON.stringify(ref.rows[j]);
        if (mineRow === refRow) result.pitchesMatched++;
        else note({ gameId, index: i, what: `투구 ${j}`, python: refRow, typescript: mineRow });
      }
    }
  }
  return result;
}

function main(): number {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rawDir = path.join(root, 'data', 'raw', 'naver', 'relay');
  if (!existsSync(rawDir) || readdirSync(rawDir).filter((f) => f.endsWith('.json')).length === 0) {
    console.log(`[parity] 중계 원자료가 없어 건너뜁니다: ${rawDir}`);
    return 0;
  }
  const python = resolvePython(root, process.platform, existsSync);
  if (!python) {
    console.log('[parity] .venv Python이 없어 건너뜁니다.');
    return 0;
  }

  const work = mkdtempSync(path.join(tmpdir(), 'parity-'));
  const refPath = path.join(work, 'reference.json');
  try {
    const dump = spawnSync(python, ['-m', 'tmi_pipeline.parity', refPath], {
      cwd: root, env: pythonEnv(root, process.env), stdio: 'inherit',
    });
    if (dump.status !== 0) {
      console.error('[parity] 기준값 생성 실패');
      return 1;
    }
    const reference = (JSON.parse(readFileSync(refPath, 'utf8')) as { games: Record<string, RefPa[]> }).games;
    const result = compare(reference, (gameId) => {
      const file = path.join(rawDir, `${gameId}.json`);
      return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    });

    const paRate = result.plateAppearances === 0 ? 1 : result.matched / result.plateAppearances;
    const pitchRate = result.pitches === 0 ? 1 : result.pitchesMatched / result.pitches;
    console.log(
      `[parity] 경기 ${result.games} · 타석 ${result.matched}/${result.plateAppearances} (${(paRate * 100).toFixed(2)}%)`
      + ` · 투구 ${result.pitchesMatched}/${result.pitches} (${(pitchRate * 100).toFixed(2)}%)`,
    );
    for (const m of result.mismatches.slice(0, 10)) {
      console.log(`  ✗ ${m.gameId} #${m.index} ${m.what}\n      py: ${m.python}\n      ts: ${m.typescript}`);
    }
    if (paRate < THRESHOLD || pitchRate < THRESHOLD) {
      console.error(`[parity] 일치율이 ${(THRESHOLD * 100).toFixed(0)}% 미만입니다.`);
      return 1;
    }
    return 0;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
