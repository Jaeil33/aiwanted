import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createGame } from '../engine';
import { fixtureAppData } from '../test/fixtures/appData';
import type { EngineResponseMessage, GameSpec } from './engineClient';
import { buildSceneSetup } from './scene';

type Listener = (event: { data: unknown }) => void;

const setup = buildSceneSetup(fixtureAppData, 'fixture-walkoff');
const START = setup.situation.state;
const SPEC: GameSpec = { lg: setup.lg, away: setup.away, home: setup.home, countTable: setup.countTable, effects: [], mode: 'real' };

/*
 * 워커 전역(self) 대신 쓰는 가짜. 모듈은 beforeAll에서 한 번 불러오므로, 테스트 사이에 지워질 수 있는
 * vi.fn 호출 기록 대신 평범한 배열에 등록한 리스너와 보낸 메시지를 남긴다.
 */
const registered: string[] = [];
const listeners: Listener[] = [];
const posted: unknown[] = [];
const fakeSelf = {
  addEventListener(type: string, fn: Listener) {
    registered.push(type);
    listeners.push(fn);
  },
  postMessage(message: unknown) {
    posted.push(message);
  },
};

const send = (data: unknown) => {
  for (const fn of listeners) fn({ data });
};

const idOf = (message: unknown) => (message as { id?: unknown }).id;

async function responseFor(id: number): Promise<EngineResponseMessage> {
  await vi.waitFor(
    () => {
      if (!posted.some((m) => idOf(m) === id)) throw new Error(`응답 ${id}를 기다리는 중`);
    },
    { timeout: 60_000, interval: 5 },
  );
  return posted.find((m) => idOf(m) === id) as EngineResponseMessage;
}

beforeAll(async () => {
  vi.stubGlobal('self', fakeSelf);
  await import('./engine.worker');
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('engine.worker', () => {
  it('불러오면 self에 message 리스너를 하나 등록한다', () => {
    expect(registered).toEqual(['message']);
  });

  it('evaluate 요청을 지역 엔진으로 계산해 같은 id로 postMessage한다', { timeout: 120_000 }, async () => {
    send({ id: 1, kind: 'evaluate', req: { spec: SPEC, state: START, pitcher: setup.scenePitcher, first: true } });
    const response = await responseFor(1);
    expect(response.ok).toBe(true);
    const expected = createGame({ ...SPEC }).evaluate(START, setup.scenePitcher, { first: true });
    if (!response.ok || !('batterWin' in response.result)) throw new Error('evaluate 결과가 아니다');
    expect(Math.abs(response.result.batterWin - expected.batterWin)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(response.result.winHome - expected.winHome)).toBeLessThanOrEqual(1e-12);
  });

  it('playout 요청도 처리한다', { timeout: 120_000 }, async () => {
    send({ id: 2, kind: 'playout', req: { spec: SPEC, start: START, scenePitcher: setup.scenePitcher, seed: 5, maxPlateAppearances: 2 } });
    const response = await responseFor(2);
    if (!response.ok || !('plateAppearances' in response.result)) throw new Error('playout 결과가 아니다');
    expect(response.result.plateAppearances.length).toBeGreaterThan(0);
    expect(response.result.plateAppearances.length).toBeLessThanOrEqual(2);
  });

  it('엔진 오류는 ok: false 응답으로 돌려준다', { timeout: 120_000 }, async () => {
    const shortLineup: GameSpec = { ...SPEC, away: { ...SPEC.away, lineup: SPEC.away.lineup.slice(0, 8) } };
    send({ id: 3, kind: 'evaluate', req: { spec: shortLineup, state: START, pitcher: setup.scenePitcher, first: true } });
    expect(await responseFor(3)).toEqual({ id: 3, ok: false, error: expect.stringMatching(/타선은 9명/) });
  });

  it('id가 없는 메시지는 응답하지 않는다', async () => {
    const before = posted.length;
    send('hello');
    send(null);
    send({ kind: 'evaluate', req: {} });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(posted).toHaveLength(before);
  });
});
