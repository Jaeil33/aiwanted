import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame, type Evaluation, type PlayoutResult } from '../engine';
import {
  handleEngineMessage,
  type EngineClient,
  type EngineRequestMessage,
  type EvaluateRequest,
  type GameSpec,
} from '../game';
import { fixtureSetup } from '../test/fixtures/appData';
import { createPlatformEngineClient, detectPlatform, localPlatform, seoulDate, type EngineWorker } from './platform';

const SLOW = { timeout: 120_000 };
const setup = fixtureSetup();
const START = setup.situation.state;
const SPEC: GameSpec = { lg: setup.lg, away: setup.away, home: setup.home, countTable: setup.countTable, effects: [], mode: 'real' };
const REQ: EvaluateRequest = { spec: SPEC, state: START, pitcher: setup.scenePitcher, first: true };

const evaluation = (batterWin: number): Evaluation => ({
  batSide: 'home',
  pa: new Float64Array(7),
  batterWin,
  pitcherWin: 1 - batterWin,
  inningScore: 0.4,
  expRuns: 0.5,
  winHome: 0.6,
  tie: 0.05,
  winAway: 0.35,
  after: [],
  count: null,
});
const PLAYOUT: PlayoutResult = { plateAppearances: [], final: START, winner: 'home', walkoff: true, truncated: false };

const fakeClient = (batterWin: number, over: Partial<EngineClient> = {}): EngineClient => ({
  evaluate: vi.fn(async () => evaluation(batterWin)),
  playout: vi.fn(async () => PLAYOUT),
  dispose: vi.fn(),
  ...over,
});

type MessageListener = (event: { data: unknown }) => void;

/** 메모리 안 가짜 워커: 보낸 요청을 쌓아 두고 release(i)로 inner 클라이언트의 응답을 돌려보낸다. fail()은 error 이벤트 */
function fakeWorker(inner: EngineClient) {
  const messageListeners: MessageListener[] = [];
  const errorListeners: Array<(event: unknown) => void> = [];
  const held: unknown[] = [];
  const spies = {
    postMessage: vi.fn((message: unknown) => {
      held.push(message);
    }),
    addEventListener: vi.fn((type: string, listener: (event: never) => void) => {
      if (type === 'error') errorListeners.push(listener as (event: unknown) => void);
      if (type === 'message') messageListeners.push(listener as MessageListener);
    }),
    terminate: vi.fn(),
  };
  return {
    worker: spies as unknown as EngineWorker,
    spies,
    held,
    async release(index: number) {
      const response = await handleEngineMessage(inner, structuredClone(held[index]) as EngineRequestMessage);
      for (const listener of messageListeners) listener({ data: structuredClone(response) });
    },
    fail() {
      for (const listener of errorListeners) listener({ type: 'error' });
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('seoulDate', () => {
  it('서울 시간의 YYYY-MM-DD', () => {
    expect(seoulDate(new Date('2026-09-13T14:59:59Z'))).toBe('2026-09-13');
    expect(seoulDate(new Date('2026-09-13T15:00:00Z'))).toBe('2026-09-14');
    expect(seoulDate(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
  });
});

describe('detectPlatform', () => {
  it('아티팩트 밖(claude 없음)·Worker 없음이면 AI 런타임·다운로드가 없고 오늘은 서울 날짜', async () => {
    vi.stubEnv('VITE_API_BASE', '');
    vi.stubEnv('VITE_AI_API_BASE', '');
    const now = () => new Date('2026-09-13T15:30:00Z');
    const platform = await detectPlatform({} as Window & typeof globalThis, { now });
    expect(platform.artifactSample).toBeNull();
    expect(platform.downloads).toBeNull();
    expect(platform.fetch).toBeUndefined();
    expect(platform.today()).toBe('2026-09-14');
  });

  it('환경변수가 없으면 apiBase 기본값은 같은 출처의 /api다', async () => {
    // 2026-09-22 배포는 VITE_AI_API_BASE가 없어 apiBase가 null이었고, 브라우저가 /api를 아예 부르지 않았다(ADR-028·029).
    vi.stubEnv('VITE_API_BASE', '');
    vi.stubEnv('VITE_AI_API_BASE', '');
    const platform = await detectPlatform({} as Window & typeof globalThis);
    expect(platform.apiBase).toBe('/api');
  });

  it('아티팩트 모드에는 서버가 없으므로 apiBase·liveApi가 null이다', async () => {
    vi.stubEnv('MODE', 'artifact');
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const platform = await detectPlatform({ fetch: fetchImpl } as unknown as Window & typeof globalThis);
    expect(platform.apiBase).toBeNull();
    expect(platform.liveApi).toBeNull();
  });

  it('VITE_API_BASE가 VITE_AI_API_BASE보다 앞선다', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://new.example/api');
    vi.stubEnv('VITE_AI_API_BASE', 'https://old.example/api');
    const platform = await detectPlatform({} as Window & typeof globalThis);
    expect(platform.apiBase).toBe('https://new.example/api');
  });

  it('apiBase와 fetch가 모두 있으면 liveApi를 만들고, fetch가 없으면 null이다', async () => {
    vi.stubEnv('VITE_API_BASE', '/api');
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      async () => new Response(JSON.stringify({ games: [] }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const withFetch = await detectPlatform({ fetch: fetchImpl } as unknown as Window & typeof globalThis);
    expect(withFetch.liveApi).not.toBeNull();
    await expect(withFetch.liveApi?.games({ from: '2026-09-15', to: '2026-09-15' })).resolves.toEqual([]);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/api/games?');

    const noFetch = await detectPlatform({} as Window & typeof globalThis);
    expect(noFetch.liveApi).toBeNull();
  });

  it('아티팩트 런타임이면 sample과 downloads를 쓴다', async () => {
    const sample = Object.assign(() => undefined, { json: vi.fn() });
    const downloads = { save: vi.fn(async () => undefined) };
    const use = vi.fn(async (name: string) => (name === 'sample' ? sample : name === 'downloads' ? downloads : null));
    const platform = await detectPlatform({ claude: { use } } as unknown as Window & typeof globalThis);
    expect(platform.artifactSample).toBe(sample);
    expect(platform.downloads).toBe(downloads);
    expect(use).toHaveBeenCalledWith('sample');
    expect(use).toHaveBeenCalledWith('downloads');
  });

  it('downloads가 null·save 없음·reject면 null', async () => {
    const sample = { json: vi.fn() };
    const variants: Array<(name: string) => Promise<unknown>> = [
      async (name) => (name === 'sample' ? sample : null),
      async (name) => (name === 'sample' ? sample : { open: vi.fn() }),
      async (name) => {
        if (name === 'sample') return sample;
        throw new Error('not_declared');
      },
    ];
    for (const use of variants) {
      const platform = await detectPlatform({ claude: { use } } as unknown as Window & typeof globalThis);
      expect(platform.artifactSample).toBe(sample);
      expect(platform.downloads).toBeNull();
    }
    const noUse = await detectPlatform({ claude: {} } as unknown as Window & typeof globalThis);
    expect([noUse.artifactSample, noUse.downloads]).toEqual([null, null]);
  });

  it('배포 AI 주소는 VITE_AI_API_BASE, fetch는 창의 fetch를 그대로 넘긴다', async () => {
    vi.stubEnv('VITE_API_BASE', '');
    vi.stubEnv('VITE_AI_API_BASE', 'https://tmi.example/api');
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const platform = await detectPlatform({ fetch: fetchImpl } as unknown as Window & typeof globalThis);
    expect(platform.apiBase).toBe('https://tmi.example/api');
    expect(platform.fetch).toBe(fetchImpl);
  });

  it('Worker가 없으면 지역 클라이언트로 엔진을 직접 부른 것과 같은 값을 계산한다', SLOW, async () => {
    const platform = await detectPlatform({} as Window & typeof globalThis);
    const client = platform.createEngineClient();
    const ev = await client.evaluate(REQ);
    const expected = createGame({ ...SPEC }).evaluate(START, setup.scenePitcher, { first: true });
    expect(Math.abs(ev.batterWin - expected.batterWin)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(ev.winHome - expected.winHome)).toBeLessThanOrEqual(1e-12);
    client.dispose();
  });

  it('Worker가 있어도 워커를 띄우지 못하면 지역 클라이언트로 계산한다', SLOW, async () => {
    const platform = await detectPlatform({ Worker: function FakeWorker() {} } as unknown as Window & typeof globalThis);
    const client = platform.createEngineClient();
    const ev = await client.evaluate(REQ);
    expect(ev.count).not.toBeNull();
    expect(ev.batterWin).toBeGreaterThan(0);
    client.dispose();
  });
});

describe('localPlatform', () => {
  it('플랫폼을 알아내기 전 기본값: 지역 엔진, AI·다운로드 없음', async () => {
    const platform = localPlatform({ now: () => new Date('2026-08-24T16:00:00Z') });
    expect([platform.artifactSample, platform.downloads, platform.apiBase, platform.liveApi]).toEqual([null, null, null, null]);
    expect(platform.today()).toBe('2026-08-25');
    expect(platform.createEngineClient().evaluate).toBeTypeOf('function');
  });
});

describe('createPlatformEngineClient', () => {
  it('워커를 쓸 수 없으면(loadWorker null) 지역 클라이언트로 계산한다', async () => {
    const local = fakeClient(0.1);
    const client = createPlatformEngineClient({ loadWorker: null, createLocal: () => local });
    await expect(client.evaluate(REQ)).resolves.toMatchObject({ batterWin: 0.1 });
    await expect(client.playout({ spec: SPEC, start: START, scenePitcher: setup.scenePitcher, seed: 1 })).resolves.toBe(PLAYOUT);
    expect(local.evaluate).toHaveBeenCalledWith(REQ);
  });

  it('워커가 뜨면 워커로 계산하고 지역 클라이언트는 만들지 않는다', async () => {
    const createLocal = vi.fn(() => fakeClient(0.1));
    const fake = fakeWorker(fakeClient(0.9));
    const client = createPlatformEngineClient({ loadWorker: async () => fake.worker, createLocal });
    const pending = client.evaluate(REQ);
    await vi.waitFor(() => expect(fake.held).toHaveLength(1));
    await fake.release(0);
    await expect(pending).resolves.toMatchObject({ batterWin: 0.9 });
    expect(createLocal).not.toHaveBeenCalled();
  });

  it('워커 생성이 실패하면 지역 클라이언트로 계산한다', async () => {
    const client = createPlatformEngineClient({
      loadWorker: async () => {
        throw new Error('SecurityError: blob 워커 금지');
      },
      createLocal: () => fakeClient(0.1),
    });
    await expect(client.evaluate(REQ)).resolves.toMatchObject({ batterWin: 0.1 });
  });

  it('워커 error 이벤트: 응답을 못 받은 요청과 이후 요청을 지역 클라이언트로 처리하고 워커를 끝낸다', async () => {
    const local = fakeClient(0.1);
    const fake = fakeWorker(fakeClient(0.9));
    const client = createPlatformEngineClient({ loadWorker: async () => fake.worker, createLocal: () => local });
    const first = client.evaluate(REQ);
    const second = client.evaluate({ ...REQ, first: false });
    await vi.waitFor(() => expect(fake.held).toHaveLength(2));
    fake.fail();
    await expect(first).resolves.toMatchObject({ batterWin: 0.1 });
    await expect(second).resolves.toMatchObject({ batterWin: 0.1 });
    expect(fake.spies.terminate).toHaveBeenCalledTimes(1);

    await expect(client.evaluate(REQ)).resolves.toMatchObject({ batterWin: 0.1 });
    expect(fake.spies.postMessage).toHaveBeenCalledTimes(2);
    expect(local.evaluate).toHaveBeenCalledTimes(3);
    await fake.release(0); // 늦게 온 워커 응답은 무시한다
  });

  it('워커가 돌려준 계산 오류는 지역으로 넘기지 않고 reject한다', async () => {
    const createLocal = vi.fn(() => fakeClient(0.1));
    const fake = fakeWorker(fakeClient(0.9, { evaluate: () => Promise.reject(new RangeError('evaluate: 이닝 1~11')) }));
    const client = createPlatformEngineClient({ loadWorker: async () => fake.worker, createLocal });
    const pending = client.evaluate(REQ);
    await vi.waitFor(() => expect(fake.held).toHaveLength(1));
    await fake.release(0);
    await expect(pending).rejects.toThrow('이닝 1~11');
    expect(createLocal).not.toHaveBeenCalled();
  });

  it('dispose하면 워커를 끝내고 기다리던 요청과 이후 요청을 reject한다', async () => {
    const local = fakeClient(0.1);
    const fake = fakeWorker(fakeClient(0.9));
    const client = createPlatformEngineClient({ loadWorker: async () => fake.worker, createLocal: () => local });
    const pending = client.evaluate(REQ);
    await vi.waitFor(() => expect(fake.held).toHaveLength(1));
    client.dispose();
    await expect(pending).rejects.toThrow(Error);
    await expect(client.evaluate(REQ)).rejects.toThrow(Error);
    expect(fake.spies.terminate).toHaveBeenCalledTimes(1);
    expect(local.evaluate).not.toHaveBeenCalled();
  });

  it('워커가 준비되기 전에 dispose하면 준비된 워커를 곧바로 끝낸다', async () => {
    const fake = fakeWorker(fakeClient(0.9));
    let resolveWorker: (w: EngineWorker) => void = () => undefined;
    const client = createPlatformEngineClient({
      loadWorker: () =>
        new Promise<EngineWorker>((resolve) => {
          resolveWorker = resolve;
        }),
      createLocal: () => fakeClient(0.1),
    });
    const pending = client.evaluate(REQ);
    client.dispose();
    resolveWorker(fake.worker);
    await expect(pending).rejects.toThrow(Error);
    expect(fake.spies.terminate).toHaveBeenCalledTimes(1);
    expect(fake.spies.postMessage).not.toHaveBeenCalled();
  });

  it('브라우저 Worker를 EngineWorker로 넘길 수 있다 (타입 확인)', () => {
    const accepts = (w: Worker): EngineWorker => w;
    expect(accepts).toBeTypeOf('function');
  });
});
