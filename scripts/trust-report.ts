/**
 * 엔진 신뢰도 리포트: 2025 시즌 기록으로 만든 엔진(src/engine)을 2026 중계 타석에 적용해 경기 결과와 비교한다.
 * 입력은 파이프라인 trust_states의 data/build/trust/states.json, 출력은 앱이 읽는 data/build/app/trust.json(TrustData).
 * 확률은 엔진만 계산하고, 결과를 보정하거나 표본을 골라내지 않는다.
 * 사용: tsx scripts/trust-report.ts [--in states.json] [--out trust.json] [--max-games N]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createGame, type LineupSlot, type TeamConfig } from '../src/engine';
import type { TrustData } from '../src/types/data';
import type { GameState, Side } from '../src/types/domain';

/** pipeline/tmi_pipeline/trust_states.py 출력의 타석 한 줄 */
export interface TrustPlateAppearance {
  inning: number;
  half: 0 | 1;
  outs: number;
  bases: number;
  away: number;
  home: number;
  slotAway: number;
  slotHome: number;
  /** 이번 타자까지 타순별 마지막 타자 id, 모르면 null (길이 9) */
  lineupAway: (string | null)[];
  lineupHome: (string | null)[];
  /** 타석 시작 투수 */
  pitcher: string;
  /** 직전 유효 타석의 네이버 홈 승리확률 (0~1) */
  naverHomeWp: number;
}

export interface TrustGame {
  gameId: string;
  date: string;
  away: string;
  home: string;
  /** 홈 승 1, 원정 승 0, 무승부 null */
  homeWin: 0 | 1 | null;
  pas: TrustPlateAppearance[];
}

export interface TrustStates {
  season: number;
  /** 2025 리그 타석 결과 비율 (길이 7) */
  league: number[];
  /** 2025 기록이 있는 선수의 rel */
  players: Record<string, number[]>;
  /** 팀 코드 → 2025 불펜 rel */
  bullpens: Record<string, number[]>;
  games: TrustGame[];
}

export interface TrustOptions {
  /** 무승부를 뺀 경기 중 앞에서부터 쓸 경기 수 (기본: 전부) */
  maxGames?: number;
}

export interface TrustResult {
  trust: TrustData;
  /** evaluate가 RangeError를 던져 뺀 타석 수 */
  skipped: number;
}

export interface CliOptions {
  inPath: string;
  outPath: string;
  maxGames: number | undefined;
}

export const TRUST_NOTE =
  '2025 시즌 기록만으로 만든 엔진을 2026 중계 타석에 적용했어요. 선수 교체는 시작 라인업으로 고정했어요.';

const LINEUP_SIZE = 9;
/** 로그 손실이 무한대가 되지 않게 확률을 [EPS, 1 − EPS]로 자른다 */
const EPS = 1e-6;
const BINS = 10;
const ONES: readonly number[] = [1, 1, 1, 1, 1, 1, 1];

/** 타순마다 처음 알려진 타자 (끝까지 모르면 null) */
export function startingLineup(pas: readonly TrustPlateAppearance[], side: Side): (string | null)[] {
  const lineup: (string | null)[] = Array(LINEUP_SIZE).fill(null);
  for (const pa of pas) {
    const known = side === 'away' ? pa.lineupAway : pa.lineupHome;
    for (let i = 0; i < LINEUP_SIZE; i++) lineup[i] ??= known[i] ?? null;
  }
  return lineup;
}

/** 2025 rel, 기록이 없으면 리그 평균(1 벡터) */
const relOf = (table: Record<string, number[]>, id: string | null): readonly number[] =>
  id !== null && Object.hasOwn(table, id) ? table[id] : ONES;

function teamConfig(states: TrustStates, game: TrustGame, side: Side): TeamConfig {
  const code = side === 'away' ? game.away : game.home;
  return {
    lineup: startingLineup(game.pas, side).map((id, i) => ({
      id: id ?? `${code}-unknown-${i + 1}`,
      rel: relOf(states.players, id),
    })),
    bullpen: { id: `${code}-pen`, rel: relOf(states.bullpens, code) },
  };
}

const stateOf = (pa: TrustPlateAppearance): GameState => ({
  inning: pa.inning,
  half: pa.half,
  outs: pa.outs,
  bases: pa.bases,
  away: pa.away,
  home: pa.home,
  slotAway: pa.slotAway,
  slotHome: pa.slotHome,
});

interface LossSum {
  brier: number;
  logLoss: number;
}

const newLoss = (): LossSum => ({ brier: 0, logLoss: 0 });

function addLoss(sum: LossSum, p: number, y: 0 | 1): void {
  const q = Math.min(Math.max(p, EPS), 1 - EPS);
  sum.brier += (q - y) ** 2;
  sum.logLoss -= Math.log(y === 1 ? q : 1 - q);
}

/** computeTrust와 같은 계산에 건너뛴 타석 수를 함께 돌려준다 */
export function evaluateTrust(states: TrustStates, opts: TrustOptions = {}): TrustResult {
  const { maxGames } = opts;
  if (maxGames !== undefined && !(Number.isInteger(maxGames) && maxGames > 0)) {
    throw new RangeError(`computeTrust: maxGames는 1 이상 정수여야 한다 (${maxGames})`);
  }
  const games = states.games
    .filter((g): g is TrustGame & { homeWin: 0 | 1 } => g.homeWin !== null)
    .slice(0, maxGames);

  const engine = newLoss();
  const naver = newLoss();
  const constant = newLoss();
  const bins = Array.from({ length: BINS }, () => ({ predicted: 0, wins: 0, n: 0 }));
  let count = 0;
  let skipped = 0;

  for (const game of games) {
    const model = createGame({
      lg: states.league,
      away: teamConfig(states, game, 'away'),
      home: teamConfig(states, game, 'home'),
      effects: [],
      mode: 'real',
      countTable: null,
    });
    const y = game.homeWin;
    for (const pa of game.pas) {
      let p: number;
      try {
        const pitcher: LineupSlot = { id: pa.pitcher, rel: relOf(states.players, pa.pitcher) };
        const ev = model.evaluate(stateOf(pa), pitcher, { detail: false });
        p = ev.winHome + ev.tie / 2;
      } catch (err) {
        if (!(err instanceof RangeError)) throw err;
        skipped++;
        continue;
      }
      count++;
      addLoss(engine, p, y);
      addLoss(naver, pa.naverHomeWp, y);
      addLoss(constant, 0.5, y);
      const bin = bins[Math.min(BINS - 1, Math.max(0, Math.floor(p * BINS)))];
      bin.predicted += p;
      bin.wins += y;
      bin.n++;
    }
  }
  if (count === 0) throw new Error('computeTrust: 평가한 타석이 없다');

  const trust: TrustData = {
    games: games.length,
    plateAppearances: count,
    brier: { engine: engine.brier / count, naver: naver.brier / count, constant: constant.brier / count },
    logLoss: { engine: engine.logLoss / count, naver: naver.logLoss / count, constant: constant.logLoss / count },
    calibration: bins.flatMap((b, i) =>
      b.n === 0 ? [] : [{ lo: i / BINS, hi: (i + 1) / BINS, predicted: b.predicted / b.n, actual: b.wins / b.n, n: b.n }],
    ),
    note: skipped > 0 ? `${TRUST_NOTE} 엔진 범위 밖 타석 ${skipped}개는 뺐어요.` : TRUST_NOTE,
  };
  return { trust, skipped };
}

/**
 * 무승부를 뺀 경기마다 시작 라인업·팀 불펜·리그로 엔진을 한 번 만들고, 타석마다 엔진 홈 승리확률(winHome + tie / 2)을
 * 네이버 승리확률·항상 0.5와 함께 경기 결과로 채점한다(Brier·로그 손실·10구간 보정).
 */
export function computeTrust(states: TrustStates, opts: TrustOptions = {}): TrustData {
  return evaluateTrust(states, opts).trust;
}

/** 기본 경로는 저장소 root 기준, 넘겨준 경로는 cwd 기준 */
export function parseCli(argv: string[], root: string, cwd: string): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: { in: { type: 'string' }, out: { type: 'string' }, 'max-games': { type: 'string' } },
    strict: true,
    allowPositionals: false,
  });
  const rawMax = values['max-games'];
  if (rawMax !== undefined && !/^[1-9]\d*$/.test(rawMax)) {
    throw new RangeError(`--max-games는 1 이상 정수여야 한다 (${rawMax})`);
  }
  return {
    inPath: values.in === undefined ? path.join(root, 'data', 'build', 'trust', 'states.json') : path.resolve(cwd, values.in),
    outPath: values.out === undefined ? path.join(root, 'data', 'build', 'app', 'trust.json') : path.resolve(cwd, values.out),
    maxGames: rawMax === undefined ? undefined : Number(rawMax),
  };
}

export function summaryLines(trust: TrustData, skipped: number): string[] {
  const f = (x: number) => x.toFixed(4);
  const row = (label: string, m: TrustData['brier']) =>
    `${label}: 엔진 ${f(m.engine)} · 네이버 ${f(m.naver)} · 항상 0.5 ${f(m.constant)}`;
  return [
    `경기 ${trust.games} · 타석 ${trust.plateAppearances} · 건너뛴 타석 ${skipped}(엔진 범위 밖)`,
    row('Brier', trust.brier),
    row('로그 손실', trust.logLoss),
  ];
}

function main(argv: string[]): number {
  const started = performance.now();
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let opts: CliOptions;
  try {
    opts = parseCli(argv, root, process.cwd());
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error('사용: tsx scripts/trust-report.ts [--in states.json] [--out trust.json] [--max-games N]');
    return 2;
  }
  let states: TrustStates;
  try {
    states = JSON.parse(readFileSync(opts.inPath, 'utf8')) as TrustStates;
  } catch (err) {
    console.error(`입력을 읽지 못했습니다: ${opts.inPath}`);
    console.error(err instanceof Error ? err.message : String(err));
    console.error('먼저 만드세요: npm run data -- --only trust');
    return 1;
  }
  const { trust, skipped } = evaluateTrust(states, { maxGames: opts.maxGames });
  mkdirSync(path.dirname(opts.outPath), { recursive: true });
  writeFileSync(opts.outPath, JSON.stringify(trust), 'utf8');
  for (const line of summaryLines(trust, skipped)) console.log(line);
  console.log(`${path.relative(process.cwd(), opts.outPath)} (${((performance.now() - started) / 1000).toFixed(1)}초)`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
