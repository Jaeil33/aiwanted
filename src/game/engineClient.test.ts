import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createGame, createRng, playout, type Evaluation, type Game, type LineupSlot, type PlayoutResult, type TeamConfig } from '../engine';
import { fixtureAppData, fixtureSetup } from '../test/fixtures/appData';
import type { EngineEffect, GameState, TmiEntry } from '../types/domain';
import { compileSessionEffects } from './effects';
import {
  createLocalEngineClient,
  createWorkerEngineClient,
  handleEngineMessage,
  specKey,
  type EngineClient,
  type EngineRequestMessage,
  type EvaluateRequest,
  type GameSpec,
  type PlayoutRequest,
  type WorkerLike,
} from './engineClient';

/** createGame은 수백 ms가 걸린다 */
const SLOW = { timeout: 120_000 };

const setup = fixtureSetup();
const START: GameState = setup.situation.state;

const knobEntry = (id: string, part: TmiEntry['interpretation']['parts'][number]): TmiEntry => ({
  id,
  text: `${id} 문장`,
  interpretation: { source: 'rules', refused: false, reason: '', comment: '', parts: [part] },
});
/** 장면 투수 체력 −2(경기 내내) + 장면 타자 집중력 +2(이번 타석만) */
const EFFECTS: EngineEffect[] = compileSessionEffects(
  [
    knobEntry('tmi-1', { kind: 'knob', knob: 'stamina', subject: 'pitcher', strength: -2, scope: 'game', evidence: 'fun', why: '' }),
    knobEntry('tmi-2', { kind: 'knob', knob: 'focus', subject: 'batter', strength: 2, scope: 'pa', evidence: 'plausible', why: '' }),
  ],
  setup,
  fixtureAppData.evidence,
);

const specOf = (over: Partial<GameSpec> = {}): GameSpec => ({
  lg: setup.lg,
  away: setup.away,
  home: setup.home,
  countTable: setup.countTable,
  effects: [],
  mode: 'real',
  ...over,
});
/** 효과 2개 + 만화 모드 */
const TMI_SPEC = specOf({ effects: EFFECTS, mode: 'toon' });

const evaluateReq = (spec: GameSpec, over: Partial<EvaluateRequest> = {}): EvaluateRequest => ({
  spec,
  state: START,
  pitcher: setup.scenePitcher,
  first: true,
  ...over,
});
const playoutReq = (spec: GameSpec, over: Partial<PlayoutRequest> = {}): PlayoutRequest => ({
  spec,
  start: START,
  scenePitcher: setup.scenePitcher,
  seed: 1,
  ...over,
});

const FAKE_EVALUATION: Evaluation = {
  batSide: 'home',
  pa: new Float64Array(7),
  batterWin: 0.3,
  pitcherWin: 0.7,
  inningScore: 0.4,
  expRuns: 0.5,
  winHome: 0.6,
  tie: 0.05,
  winAway: 0.35,
  after: [],
  count: null,
};
const FAKE_PLAYOUT: PlayoutResult = { plateAppearances: [], final: START, winner: 'home', walkoff: true, truncated: false };

/** 호출 수만 세는 가짜 createGame */
const fakeCreateGame = () => vi.fn<typeof createGame>(() => ({ evaluate: () => FAKE_EVALUATION }));

const fakeClient = (over: Partial<EngineClient> = {}): EngineClient => ({
  evaluate: vi.fn(async () => FAKE_EVALUATION),
  playout: vi.fn(async () => FAKE_PLAYOUT),
  dispose: vi.fn(),
  ...over,
});

function expectSameEvaluation(actual: Evaluation, expected: Evaluation, tol = 1e-12) {
  const near = (a: number, b: number, label: string) => expect(Math.abs(a - b), `${label}: ${a} vs ${b}`).toBeLessThanOrEqual(tol);
  expect(actual.batSide).toBe(expected.batSide);
  for (const key of ['batterWin', 'pitcherWin', 'inningScore', 'expRuns', 'winHome', 'tie', 'winAway'] as const) {
    near(actual[key], expected[key], key);
  }
  expect(actual.pa).toHaveLength(7);
  for (let i = 0; i < 7; i++) near(actual.pa[i], expected.pa[i], `pa[${i}]`);
  expect(actual.after).toHaveLength(expected.after.length);
  actual.after.forEach((a, e) => {
    for (const key of ['winHome', 'tie', 'winAway', 'inningScore'] as const) near(a[key], expected.after[e][key], `after[${e}].${key}`);
  });
  const expectedCount = expected.count;
  expect(actual.count === null).toBe(expectedCount === null);
  if (actual.count && expectedCount) {
    actual.count.rates.forEach((row, c) => row.forEach((x, k) => near(x, expectedCount.rates[c][k], `rates[${c}][${k}]`)));
    actual.count.term.forEach((row, c) => row.forEach((x, k) => near(x, expectedCount.term[c][k], `term[${c}][${k}]`)));
  }
}

describe('specKey', () => {
  it('선수 id·rel·불펜·lg·카운트 표·효과·모드가 같으면 같은 키 (복사본·sourceId와 무관)', () => {
    expect(specKey(JSON.parse(JSON.stringify(TMI_SPEC)) as GameSpec)).toBe(specKey(TMI_SPEC));
    const renamed = EFFECTS.map((fx) => ({ ...fx, sourceId: 'other' }));
    expect(specKey(specOf({ effects: renamed, mode: 'toon' }))).toBe(specKey(TMI_SPEC));
  });

  it('하나라도 다르면 다른 키', () => {
    const withSlot = (team: TeamConfig, index: number, slot: LineupSlot): TeamConfig => ({
      ...team,
      lineup: team.lineup.map((s, k) => (k === index ? slot : s)),
    });
    const variants: GameSpec[] = [
      specOf(),
      specOf({ mode: 'toon' }),
      specOf({ effects: EFFECTS }),
      specOf({ countTable: null }),
      specOf({ countTable: setup.countTable.map((row, c) => (c === 0 ? [row[0] + 0.01, ...row.slice(1)] : row)) }),
      specOf({ lg: setup.lg.map((x, i) => (i === 2 ? x + 0.001 : x)) }),
      specOf({ home: withSlot(setup.home, 5, { id: 'h6', rel: [0.9, 1, 1.7, 1, 1.2, 1, 0.95] }) }),
      specOf({ home: withSlot(setup.home, 5, { id: 'h6-copy', rel: setup.home.lineup[5].rel }) }),
      specOf({ away: { ...setup.away, bullpen: { id: 'HT-pen', rel: [1, 1, 1.1, 1, 1, 1, 1] } } }),
      specOf({ away: { ...setup.away, bullpen: { id: 'HT-pen-2', rel: setup.away.bullpen.rel } } }),
      specOf({ away: setup.home, home: setup.away }),
    ];
    expect(new Set(variants.map(specKey)).size).toBe(variants.length);
  });
});

describe('createLocalEngineClient', () => {
  let direct: Game;
  let client: EngineClient;

  beforeAll(() => {
    direct = createGame({ lg: setup.lg, away: setup.away, home: setup.home, effects: EFFECTS, mode: 'toon', countTable: setup.countTable });
    client = createLocalEngineClient();
  }, 120_000);

  it('evaluate는 같은 설정으로 엔진을 직접 부른 결과와 같다 (1e-12)', SLOW, async () => {
    for (const first of [true, false]) {
      expectSameEvaluation(await client.evaluate(evaluateReq(TMI_SPEC, { first })), direct.evaluate(START, setup.scenePitcher, { first }));
    }
    const tenthTop: GameState = { ...START, inning: 10, half: 0, outs: 0, bases: 0 };
    expectSameEvaluation(
      await client.evaluate(evaluateReq(TMI_SPEC, { state: tenthTop, pitcher: setup.home.bullpen, first: false })),
      direct.evaluate(tenthTop, setup.home.bullpen, { first: false }),
    );
    // first가 그대로 전달된다: 이번 타석 효과(집중력 +2)는 첫 타석에만 붙는다
    const [firstPa, laterPa] = await Promise.all([true, false].map((first) => client.evaluate(evaluateReq(TMI_SPEC, { first }))));
    expect(firstPa.batterWin).not.toBe(laterPa.batterWin);
    // 카운트 모델까지 계산한다 (gaugesAtCount·samplePitchCode에 필요)
    expect(firstPa.count).not.toBeNull();
  });

  it('같은 spec이면 createGame을 한 번만 부르고, 넘기는 설정은 spec 그대로다', SLOW, async () => {
    const impl = vi.fn(createGame);
    const local = createLocalEngineClient({ createGameImpl: impl });
    await local.evaluate(evaluateReq(specOf()));
    await local.evaluate(evaluateReq(JSON.parse(JSON.stringify(specOf())) as GameSpec, { first: false }));
    await local.playout(playoutReq(specOf(), { maxPlateAppearances: 2 }));
    expect(impl).toHaveBeenCalledTimes(1);
    expect(impl.mock.calls[0][0]).toEqual({
      lg: setup.lg,
      away: setup.away,
      home: setup.home,
      effects: [],
      mode: 'real',
      countTable: setup.countTable,
    });
  });

  it('캐시 한도를 넘으면 가장 오래 쓰지 않은 경기를 버린다', async () => {
    const impl = fakeCreateGame();
    const local = createLocalEngineClient({ maxCachedGames: 2, createGameImpl: impl });
    const [a, b, c] = [specOf(), specOf({ mode: 'toon' }), specOf({ countTable: null })];
    const use = (spec: GameSpec) => local.evaluate(evaluateReq(spec));
    await use(a);
    await use(b);
    await use(a); // 적중: 최근 사용 순서 b, a
    expect(impl).toHaveBeenCalledTimes(2);
    await use(c); // b를 버린다
    await use(a); // 적중
    expect(impl).toHaveBeenCalledTimes(3);
    await use(b); // 다시 만들고 c를 버린다
    await use(a); // 적중
    expect(impl).toHaveBeenCalledTimes(4);
    await use(c);
    expect(impl).toHaveBeenCalledTimes(5);
  });

  it('기본 캐시는 경기 4개다', async () => {
    const impl = fakeCreateGame();
    const local = createLocalEngineClient({ createGameImpl: impl });
    const specs = [
      specOf(),
      specOf({ mode: 'toon' }),
      specOf({ countTable: null }),
      specOf({ effects: EFFECTS }),
      specOf({ effects: EFFECTS, mode: 'toon' }),
    ];
    for (const spec of specs.slice(0, 4)) await local.evaluate(evaluateReq(spec));
    await local.evaluate(evaluateReq(specs[0])); // 적중
    expect(impl).toHaveBeenCalledTimes(4);
    await local.evaluate(evaluateReq(specs[4])); // specs[1]을 버린다
    await local.evaluate(evaluateReq(specs[0])); // 적중
    expect(impl).toHaveBeenCalledTimes(5);
    await local.evaluate(evaluateReq(specs[1]));
    expect(impl).toHaveBeenCalledTimes(6);
  });

  it('playout은 같은 seed면 같은 결과이고, 엔진 playout에 createRng(seed)를 넘긴 것과 같다', SLOW, async () => {
    const req = playoutReq(TMI_SPEC, { seed: 2026 });
    const a = await client.playout(req);
    expect(await client.playout({ ...req })).toEqual(a);
    expect(a).toEqual(
      playout({
        game: direct,
        start: START,
        scenePitcher: setup.scenePitcher,
        away: setup.away,
        home: setup.home,
        lg: setup.lg,
        effects: EFFECTS,
        mode: 'toon',
        countTable: setup.countTable,
        rng: createRng(2026),
      }),
    );
    expect(await client.playout({ ...req, seed: 7 })).not.toEqual(a);
  });

  it('maxPlateAppearances를 엔진 playout에 넘긴다', SLOW, async () => {
    const result = await client.playout(playoutReq(TMI_SPEC, { seed: 3, maxPlateAppearances: 1 }));
    expect(result.plateAppearances).toHaveLength(1);
  });

  it('엔진 오류는 reject로 전달하고, dispose 뒤 요청은 reject한다', SLOW, async () => {
    await expect(client.evaluate(evaluateReq(TMI_SPEC, { state: { ...START, inning: 12 } }))).rejects.toThrow(RangeError);

    const impl = fakeCreateGame();
    const local = createLocalEngineClient({ createGameImpl: impl });
    local.dispose();
    await expect(local.evaluate(evaluateReq(specOf()))).rejects.toThrow(Error);
    await expect(local.playout(playoutReq(specOf()))).rejects.toThrow(Error);
    expect(impl).not.toHaveBeenCalled();
  });
});

describe('handleEngineMessage', () => {
  it('kind에 맞는 메서드를 부르고 같은 id로 결과를 돌려준다', async () => {
    const c = fakeClient();
    const evalReq = evaluateReq(specOf());
    expect(await handleEngineMessage(c, { id: 7, kind: 'evaluate', req: evalReq })).toEqual({ id: 7, ok: true, result: FAKE_EVALUATION });
    expect(c.evaluate).toHaveBeenCalledWith(evalReq);
    const playReq = playoutReq(specOf(), { seed: 9 });
    expect(await handleEngineMessage(c, { id: 8, kind: 'playout', req: playReq })).toEqual({ id: 8, ok: true, result: FAKE_PLAYOUT });
    expect(c.playout).toHaveBeenCalledWith(playReq);
  });

  it('예외(비동기·동기·Error가 아닌 값)는 ok: false와 메시지로 바꾼다', async () => {
    const rejecting = fakeClient({
      evaluate: async () => {
        throw new RangeError('evaluate: 이닝 1~11');
      },
    });
    expect(await handleEngineMessage(rejecting, { id: 1, kind: 'evaluate', req: evaluateReq(specOf()) })).toEqual({
      id: 1,
      ok: false,
      error: 'evaluate: 이닝 1~11',
    });
    const throwing = fakeClient({
      playout: () => {
        throw new Error('동기 예외');
      },
    });
    expect(await handleEngineMessage(throwing, { id: 2, kind: 'playout', req: playoutReq(specOf()) })).toEqual({
      id: 2,
      ok: false,
      error: '동기 예외',
    });
    const stringly = fakeClient({ evaluate: () => Promise.reject('문자열 오류') });
    expect(await handleEngineMessage(stringly, { id: 3, kind: 'evaluate', req: evaluateReq(specOf()) })).toEqual({
      id: 3,
      ok: false,
      error: '문자열 오류',
    });
  });

  it('모르는 kind는 ok: false', async () => {
    const unknownKind = { id: 4, kind: 'simulate', req: {} } as unknown as EngineRequestMessage;
    expect(await handleEngineMessage(fakeClient(), unknownKind)).toMatchObject({ id: 4, ok: false });
  });
});

type Listener = (event: { data: unknown }) => void;

/** 메모리 안 가짜 워커: 요청·응답을 구조화 복제해 inner 클라이언트로 처리한다. hold면 release(i)로 응답시킨다 */
function fakeWorker(inner: EngineClient, opts: { hold?: boolean } = {}) {
  const listeners: Listener[] = [];
  const held: unknown[] = [];
  const emit = (data: unknown) => {
    for (const fn of listeners) fn({ data });
  };
  const respond = async (message: unknown) => {
    const response = await handleEngineMessage(inner, structuredClone(message) as EngineRequestMessage);
    emit(structuredClone(response));
  };
  const worker = {
    postMessage: vi.fn((message: unknown) => {
      if (opts.hold) held.push(message);
      else void respond(message);
    }),
    addEventListener: vi.fn((_type: 'message', fn: Listener) => {
      listeners.push(fn);
    }),
    terminate: vi.fn(),
  };
  return { worker, emit, release: (index: number) => respond(held[index]) };
}

describe('createWorkerEngineClient', () => {
  let inner: EngineClient;

  beforeAll(() => {
    inner = createLocalEngineClient();
  });

  it('요청·응답이 구조화 복제를 거쳐 왕복하고 지역 계산과 같다', SLOW, async () => {
    const { worker } = fakeWorker(inner);
    const remote = createWorkerEngineClient(worker);
    const req = evaluateReq(TMI_SPEC);
    const viaWorker = await remote.evaluate(req);
    expect(Object.prototype.toString.call(viaWorker.pa)).toBe('[object Float64Array]');
    expectSameEvaluation(viaWorker, await inner.evaluate(req), 0);

    const playReq = playoutReq(TMI_SPEC, { seed: 11, maxPlateAppearances: 5 });
    expect(await remote.playout(playReq)).toEqual(await inner.playout(playReq));
    expect(worker.addEventListener).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expect(worker.postMessage.mock.calls[0][0]).toEqual({ id: expect.any(Number), kind: 'evaluate', req });
    expect(worker.postMessage.mock.calls[1][0]).toMatchObject({ kind: 'playout', req: playReq });
  });

  it('엔진 오류를 reject로 전달한다', SLOW, async () => {
    const remote = createWorkerEngineClient(fakeWorker(inner).worker);
    await expect(remote.evaluate(evaluateReq(TMI_SPEC, { state: { ...START, inning: 12 } }))).rejects.toThrow(/이닝 1~11/);
    const failing = createWorkerEngineClient(fakeWorker(fakeClient({ playout: () => Promise.reject(new Error('재생 실패')) })).worker);
    await expect(failing.playout(playoutReq(specOf()))).rejects.toThrow('재생 실패');
  });

  it('응답 순서가 바뀌어도 id로 짝을 맞춘다', async () => {
    const byFirst = fakeClient({ evaluate: async (req) => ({ ...FAKE_EVALUATION, batterWin: req.first ? 1 : 0 }) });
    const { worker, release } = fakeWorker(byFirst, { hold: true });
    const remote = createWorkerEngineClient(worker);
    const first = remote.evaluate(evaluateReq(specOf(), { first: true }));
    const later = remote.evaluate(evaluateReq(specOf(), { first: false }));
    await release(1);
    await release(0);
    expect((await first).batterWin).toBe(1);
    expect((await later).batterWin).toBe(0);
  });

  it('워커가 보낸 모양이 틀린 메시지나 모르는 id는 무시한다', async () => {
    const { worker, emit, release } = fakeWorker(fakeClient(), { hold: true });
    const remote = createWorkerEngineClient(worker);
    const pending = remote.playout(playoutReq(specOf()));
    emit('noise');
    emit(null);
    emit({ id: 999, ok: true, result: FAKE_EVALUATION });
    emit({ ok: false, error: 'id 없음' });
    for (let id = 0; id < 5; id++) emit({ id, ok: 'yes' });
    await release(0);
    await expect(pending).resolves.toEqual(FAKE_PLAYOUT);
  });

  it('dispose하면 워커를 끝내고 기다리던 요청과 이후 요청을 reject한다', async () => {
    const { worker, release } = fakeWorker(fakeClient(), { hold: true });
    const remote = createWorkerEngineClient(worker);
    const waitingEvaluate = remote.evaluate(evaluateReq(specOf()));
    const waitingPlayout = remote.playout(playoutReq(specOf()));
    remote.dispose();
    await expect(waitingEvaluate).rejects.toThrow(Error);
    await expect(waitingPlayout).rejects.toThrow(Error);
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    await release(0); // 늦게 온 응답은 무시한다
    await expect(remote.evaluate(evaluateReq(specOf()))).rejects.toThrow(Error);
    remote.dispose();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
  });

  it('postMessage가 실패하면 그 요청을 reject한다', async () => {
    const worker: WorkerLike = {
      postMessage: () => {
        throw new Error('DataCloneError');
      },
      addEventListener: vi.fn(),
      terminate: vi.fn(),
    };
    await expect(createWorkerEngineClient(worker).evaluate(evaluateReq(specOf()))).rejects.toThrow('DataCloneError');
  });

  it('브라우저 Worker를 그대로 넘길 수 있다 (타입 확인)', () => {
    const accepts = (w: Worker): WorkerLike => w;
    expect(accepts).toBeTypeOf('function');
  });
});
