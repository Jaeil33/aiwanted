import {
  createGame,
  createRng,
  playout,
  type Evaluation,
  type Game,
  type LineupSlot,
  type PlayoutResult,
  type TeamConfig,
} from '../engine';
import type { EngineEffect, EventVector, GameState, Mode, PitcherPlanEntry } from '../types/domain';
import { effectsKey } from './effects';

/** 경기 하나를 만드는 값. 구조화 복제가 되는 값만 담아 워커로 그대로 보낸다 */
export interface GameSpec {
  lg: EventVector;
  away: TeamConfig;
  home: TeamConfig;
  countTable: number[][] | null;
  effects: EngineEffect[];
  mode: Mode;
}

export interface EvaluateRequest {
  spec: GameSpec;
  state: GameState;
  pitcher: LineupSlot;
  first: boolean;
}

export interface PlayoutRequest {
  spec: GameSpec;
  start: GameState;
  scenePitcher: LineupSlot;
  seed: number;
  /** 그 경기의 실제 투수 차례(ADR-033). 구조화 복제가 되는 값만 담는다 */
  relief?: { plan: readonly PitcherPlanEntry[]; slots: Record<string, LineupSlot> };
  maxPlateAppearances?: number;
}

/** 확률 계산 창구. 모든 확률은 이 뒤의 엔진이 계산한다 */
export interface EngineClient {
  evaluate(req: EvaluateRequest): Promise<Evaluation>;
  playout(req: PlayoutRequest): Promise<PlayoutResult>;
  dispose(): void;
}

export type EngineRequestMessage =
  | { id: number; kind: 'evaluate'; req: EvaluateRequest }
  | { id: number; kind: 'playout'; req: PlayoutRequest };

export type EngineResponseMessage =
  | { id: number; ok: true; result: Evaluation | PlayoutResult }
  | { id: number; ok: false; error: string };

/** createWorkerEngineClient가 쓰는 워커 쪽 최소 모양 (브라우저 Worker가 그대로 맞는다) */
export interface WorkerLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  terminate(): void;
}

const DEFAULT_MAX_CACHED_GAMES = 4;

const slotKey = (slot: LineupSlot) => [slot.id, Array.from(slot.rel)];
const teamKey = (team: TeamConfig) => [team.lineup.map(slotKey), slotKey(team.bullpen)];

/** 경기 캐시 키: 리그 분포·두 팀 선수 id·rel·불펜·카운트 표·효과·모드가 같으면 같은 문자열 */
export function specKey(spec: GameSpec): string {
  const teams = JSON.stringify([Array.from(spec.lg), teamKey(spec.away), teamKey(spec.home), spec.countTable]);
  // JSON 문자열에는 줄바꿈 문자가 그대로 들어가지 않으므로 두 부분의 경계가 겹치지 않는다
  return `${teams}\n${effectsKey(spec.effects, spec.mode)}`;
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * 같은 스레드에서 계산하는 클라이언트(테스트·워커 안·워커가 없는 환경). createGame 결과를 specKey로
 * 최근 사용 순서대로 최대 maxCachedGames(기본 4)개 캐시한다. 계산 오류는 reject로 돌려준다.
 */
export function createLocalEngineClient(
  opts: { maxCachedGames?: number; createGameImpl?: typeof createGame } = {},
): EngineClient {
  const requested = opts.maxCachedGames;
  const limit = requested !== undefined && Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : DEFAULT_MAX_CACHED_GAMES;
  const make = opts.createGameImpl ?? createGame;
  /** 삽입 순서 = 최근 사용 순서 (앞이 가장 오래됨) */
  const games = new Map<string, Game>();
  let disposed = false;

  function gameFor(spec: GameSpec): Game {
    if (disposed) throw new Error('엔진 클라이언트가 이미 닫혔다');
    const key = specKey(spec);
    const cached = games.get(key);
    if (cached) {
      games.delete(key);
      games.set(key, cached);
      return cached;
    }
    const game = make({ lg: spec.lg, away: spec.away, home: spec.home, effects: spec.effects, mode: spec.mode, countTable: spec.countTable });
    games.set(key, game);
    for (const oldest of games.keys()) {
      if (games.size <= limit) break;
      games.delete(oldest);
    }
    return game;
  }

  return {
    async evaluate(req) {
      return gameFor(req.spec).evaluate(req.state, req.pitcher, { first: req.first });
    },
    async playout(req) {
      const { spec } = req;
      return playout({
        game: gameFor(spec),
        start: req.start,
        scenePitcher: req.scenePitcher,
        away: spec.away,
        home: spec.home,
        lg: spec.lg,
        effects: spec.effects,
        mode: spec.mode,
        countTable: spec.countTable,
        relief: req.relief,
        rng: createRng(req.seed),
        maxPlateAppearances: req.maxPlateAppearances,
      });
    },
    dispose() {
      disposed = true;
      games.clear();
    },
  };
}

/** 워커 쪽 요청 처리: kind에 맞는 메서드를 부르고, 예외는 { ok: false, error }로 바꾼다 */
export async function handleEngineMessage(client: EngineClient, msg: EngineRequestMessage): Promise<EngineResponseMessage> {
  const { id } = msg;
  const kind: string = msg.kind;
  try {
    if (msg.kind === 'evaluate') return { id, ok: true, result: await client.evaluate(msg.req) };
    if (msg.kind === 'playout') return { id, ok: true, result: await client.playout(msg.req) };
    return { id, ok: false, error: `알 수 없는 엔진 요청: ${kind}` };
  } catch (err) {
    return { id, ok: false, error: errorMessage(err) };
  }
}

function isResponseMessage(x: unknown): x is EngineResponseMessage {
  if (typeof x !== 'object' || x === null) return false;
  const m = x as { id?: unknown; ok?: unknown; error?: unknown };
  if (typeof m.id !== 'number') return false;
  return m.ok === true ? 'result' in m : m.ok === false && typeof m.error === 'string';
}

interface Waiter {
  resolve(result: Evaluation | PlayoutResult): void;
  reject(error: Error): void;
}

/**
 * 워커로 계산을 보내는 클라이언트: 요청마다 id를 붙여 보내고 응답 id로 resolve/reject를 짝짓는다.
 * dispose하면 워커를 끝내고 기다리던 요청을 모두 reject하며, 이후 요청도 reject한다.
 */
export function createWorkerEngineClient(worker: WorkerLike): EngineClient {
  const pending = new Map<number, Waiter>();
  let nextId = 1;
  let disposed = false;

  worker.addEventListener('message', (event) => {
    const msg = event.data;
    if (!isResponseMessage(msg)) return;
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    if (msg.ok) waiter.resolve(msg.result);
    else waiter.reject(new Error(msg.error));
  });

  function send<T extends Evaluation | PlayoutResult>(kind: EngineRequestMessage['kind'], req: EvaluateRequest | PlayoutRequest): Promise<T> {
    if (disposed) return Promise.reject(new Error('엔진 클라이언트가 이미 닫혔다'));
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: (result) => resolve(result as T), reject });
      try {
        worker.postMessage({ id, kind, req });
      } catch (err) {
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  return {
    evaluate: (req) => send<Evaluation>('evaluate', req),
    playout: (req) => send<PlayoutResult>('playout', req),
    dispose() {
      if (disposed) return;
      disposed = true;
      worker.terminate();
      const waiters = [...pending.values()];
      pending.clear();
      for (const waiter of waiters) waiter.reject(new Error('엔진 클라이언트를 닫아 기다리던 요청을 취소했다'));
    },
  };
}
