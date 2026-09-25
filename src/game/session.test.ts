import { describe, expect, it } from 'vitest';
import { fixtureAppData } from '../test/fixtures/appData';
import type { Situation } from '../types/data';
import type { GameState, PitchCode, TmiEntry, VerdictResult } from '../types/domain';
import {
  canEditMode,
  canEditTmi,
  canStopHere,
  initialSession,
  sessionReducer,
  type LiveState,
  type PlayLogEntry,
  type SessionAction,
  type SessionState,
} from './session';
import { situationFromScene } from './situation';

const SCENE = fixtureAppData.scenes[0];
const START: GameState = SCENE.state;
const SITUATION: Situation = situationFromScene(SCENE);
const otherSituation = (state: GameState): Situation => ({ ...SITUATION, id: 'other-situation', state });

const reduce = (s: SessionState, ...actions: SessionAction[]): SessionState => actions.reduce(sessionReducer, s);

function tmi(id: string, refused = false): TmiEntry {
  return {
    id,
    text: `${id} 문장`,
    interpretation: { source: 'rules', refused, reason: refused ? '민감한 내용' : '', comment: '', parts: [] },
  };
}

const freshLive = (state: GameState): LiveState => ({ state, balls: 0, strikes: 0, paIndex: 0, pitches: [] });

type OpenSituation = Extract<SessionAction, { type: 'openSituation' }>;
const open = (over: Partial<Omit<OpenSituation, 'type'>> = {}): SessionState =>
  sessionReducer(initialSession, { type: 'openSituation', situation: SITUATION, seed: 42, ...over });

const addTmi = (s: SessionState, entry: TmiEntry, note = '', disableProvider = false): SessionState =>
  reduce(s, { type: 'interpretStart' }, { type: 'interpretDone', entry, note, disableProvider });

const pitch = (s: SessionState, code: PitchCode, balls: number, strikes: number): SessionState =>
  reduce(s, { type: 'animationStart' }, { type: 'pitchApplied', code, balls, strikes });

const judge = (s: SessionState, id: string, verdict: VerdictResult, disableProvider = false): SessionState =>
  reduce(s, { type: 'judgeStart', id }, { type: 'judgeDone', id, verdict, note: '', disableProvider });

const WALKOFF_STATE: GameState = { ...START, home: 8, bases: 0, slotHome: 6 };
const WALKOFF_LOG: PlayLogEntry = {
  index: 0,
  inning: 9,
  half: 1,
  batterName: '홈타자6',
  pitcherName: '원정투수',
  headline: '끝내기 만루 홈런!',
  score: { away: 4, home: 8 },
  wpHomeAfter: 1,
  highlight: true,
};
const VERDICT: VerdictResult = {
  source: 'rules',
  variables: ['temp_c'],
  verdict: 'maybe',
  headline: '애매해요',
  body: '학습 구간은 0을 벗어났지만 검증 구간이 0을 포함해요.',
};

describe('initialSession', () => {
  it('첫 화면·현실 모드·seed 1이고 나머지는 비어 있다', () => {
    expect(initialSession).toEqual({
      screen: 'home',
      situation: null,
      extra: {},
      mode: 'real',
      seed: 1,
      tmis: [],
      interpreting: false,
      notice: '',
      providerDisabled: false,
      verdicts: {},
      judgingId: null,
      live: null,
      log: [],
      status: 'ready',
      final: null,
    });
    expect(canEditTmi(initialSession)).toBe(false);
  });
});

describe('sessionReducer — 한 판 흐름', () => {
  it('장면 열기 → TMI 추가 → 투구 → 타석 끝 → 경기 끝', () => {
    let s = open();
    expect(s).toMatchObject({ screen: 'play', seed: 42, mode: 'real', tmis: [], status: 'ready', log: [], final: null });
    expect(s.situation?.id).toBe(SCENE.id);
    expect(s.live).toEqual(freshLive(START));
    expect(canEditTmi(s)).toBe(true);

    s = sessionReducer(s, { type: 'interpretStart' });
    expect(s.interpreting).toBe(true);
    s = sessionReducer(s, {
      type: 'interpretDone',
      entry: tmi('tmi-1'),
      note: 'AI 해석을 쓸 수 없어 규칙으로 계산했어요.',
      disableProvider: true,
    });
    expect(s).toMatchObject({ interpreting: false, notice: 'AI 해석을 쓸 수 없어 규칙으로 계산했어요.', providerDisabled: true });
    expect(s.tmis.map((e) => e.id)).toEqual(['tmi-1']);

    s = sessionReducer(s, { type: 'setMode', mode: 'toon' });
    expect(s.mode).toBe('toon');

    s = sessionReducer(s, { type: 'animationStart' });
    expect(s.status).toBe('animating');
    expect(canEditTmi(s)).toBe(false);
    s = sessionReducer(s, { type: 'pitchApplied', code: 'B', balls: 1, strikes: 0 });
    expect(s.status).toBe('ready');
    expect(s.live).toMatchObject({ balls: 1, strikes: 0, paIndex: 0, pitches: [{ balls: 0, strikes: 0, code: 'B' }] });
    s = pitch(s, 'S', 1, 1);
    s = pitch(s, 'X', 1, 1);
    expect(s.live?.pitches).toEqual([
      { balls: 0, strikes: 0, code: 'B' },
      { balls: 1, strikes: 0, code: 'S' },
      { balls: 1, strikes: 1, code: 'X' },
    ]);

    s = sessionReducer(s, { type: 'paFinished', entry: WALKOFF_LOG, state: WALKOFF_STATE });
    expect(s.log).toEqual([WALKOFF_LOG]);
    expect(s.live).toEqual({ state: WALKOFF_STATE, balls: 0, strikes: 0, paIndex: 1, pitches: [] });
    expect(s.status).toBe('ready');

    s = sessionReducer(s, { type: 'gameFinished', winner: 'home', walkoff: true, state: WALKOFF_STATE });
    expect(s).toMatchObject({
      status: 'finished',
      screen: 'result',
      final: { winner: 'home', walkoff: true, state: WALKOFF_STATE },
    });
    expect(s.tmis.map((e) => e.id)).toEqual(['tmi-1']);
  });

  it('paFinished는 기록을 순서대로 쌓고 타석 번호를 올린다', () => {
    const second: PlayLogEntry = { ...WALKOFF_LOG, index: 1, headline: '삼진', highlight: false, wpHomeAfter: null };
    const s = reduce(
      open(),
      { type: 'paFinished', entry: { ...WALKOFF_LOG, headline: '볼넷' }, state: START },
      { type: 'paFinished', entry: second, state: START },
    );
    expect(s.log.map((x) => x.headline)).toEqual(['볼넷', '삼진']);
    expect(s.live?.paIndex).toBe(2);
  });

  it('경기가 끝나면 재생 액션은 같은 객체를 돌려준다', () => {
    const done = sessionReducer(open(), { type: 'gameFinished', winner: 'away', walkoff: false, state: START });
    expect(done.status).toBe('finished');
    expect(sessionReducer(done, { type: 'animationStart' })).toBe(done);
    expect(sessionReducer(done, { type: 'pitchApplied', code: 'B', balls: 1, strikes: 0 })).toBe(done);
    expect(sessionReducer(done, { type: 'paFinished', entry: WALKOFF_LOG, state: WALKOFF_STATE })).toBe(done);
    expect(sessionReducer(done, { type: 'gameFinished', winner: 'home', walkoff: true, state: START })).toBe(done);
  });

  it('열린 장면이 없으면 재생 액션은 같은 객체를 돌려준다', () => {
    const actions: SessionAction[] = [
      { type: 'animationStart' },
      { type: 'pitchApplied', code: 'B', balls: 1, strikes: 0 },
      { type: 'paFinished', entry: WALKOFF_LOG, state: WALKOFF_STATE },
      { type: 'gameFinished', winner: 'home', walkoff: true, state: START },
      { type: 'resetPlay', seed: 2 },
      { type: 'interpretStart' },
      { type: 'setMode', mode: 'toon' },
    ];
    for (const action of actions) expect(sessionReducer(initialSession, action), action.type).toBe(initialSession);
  });

  it('공이 날아가는 중에는 animationStart를 다시 받지 않는다', () => {
    const animating = sessionReducer(open(), { type: 'animationStart' });
    expect(sessionReducer(animating, { type: 'animationStart' })).toBe(animating);
  });
});

describe('sessionReducer — TMI 편집', () => {
  it('공이 날아가는 중·이번 타석에 공을 던진 뒤에는 모드와 TMI를 바꿀 수 없다', () => {
    const withTmi = addTmi(open(), tmi('tmi-1'));
    const animating = sessionReducer(withTmi, { type: 'animationStart' });
    const thrown = sessionReducer(animating, { type: 'pitchApplied', code: 'B', balls: 1, strikes: 0 });
    for (const locked of [animating, thrown]) {
      expect(canEditTmi(locked)).toBe(false);
      expect(sessionReducer(locked, { type: 'setMode', mode: 'toon' })).toBe(locked);
      expect(sessionReducer(locked, { type: 'interpretStart' })).toBe(locked);
      expect(sessionReducer(locked, { type: 'removeTmi', id: 'tmi-1' })).toBe(locked);
    }
  });

  it('다음 타석에는 TMI를 다시 걸 수 있지만 모드는 잠긴다', () => {
    // ADR-033·Q13: 이어서 치는 타석마다 다시 걸 수 있다. 새로 걸지 않으면 앞 타석 TMI가 그대로 남는다.
    // 모드는 이미 친 타석과 기준이 달라지므로 판 도중에 바꾸지 않는다
    const withTmi = addTmi(open(), tmi('tmi-1'));
    const nextPa = sessionReducer(withTmi, { type: 'paFinished', entry: WALKOFF_LOG, state: START });
    expect(canEditTmi(nextPa)).toBe(true);
    expect(canEditMode(nextPa)).toBe(false);
    expect(sessionReducer(nextPa, { type: 'setMode', mode: 'toon' })).toBe(nextPa);
    expect(sessionReducer(nextPa, { type: 'interpretStart' }).interpreting).toBe(true);
    expect(sessionReducer(nextPa, { type: 'removeTmi', id: 'tmi-1' }).tmis).toEqual([]);
    // 앞 타석 TMI는 그대로 남아 있다
    expect(nextPa.tmis.map((e) => e.id)).toEqual(['tmi-1']);
  });

  it('여기까지: 한 타석이라도 친 뒤 첫 공 전에만 멈춘다', () => {
    const fresh = open();
    expect(canStopHere(fresh)).toBe(false);
    expect(sessionReducer(fresh, { type: 'stopHere' })).toBe(fresh);

    const played = sessionReducer(fresh, { type: 'paFinished', entry: WALKOFF_LOG, state: WALKOFF_STATE });
    expect(canStopHere(played)).toBe(true);
    const stopped = sessionReducer(played, { type: 'stopHere' });
    expect(stopped).toMatchObject({ status: 'finished', screen: 'result' });
    expect(stopped.final).toEqual({ winner: 'home', walkoff: false, state: WALKOFF_STATE, stopped: true });

    const midPa = pitch(played, 'B', 1, 0);
    expect(canStopHere(midPa)).toBe(false);
    expect(sessionReducer(midPa, { type: 'stopHere' })).toBe(midPa);
  });

  it('여기까지 멈추면 그 시점 점수로 승패를 적는다', () => {
    const tie = { ...START, away: 4, home: 4 };
    const played = sessionReducer(open(), { type: 'paFinished', entry: WALKOFF_LOG, state: tie });
    expect(sessionReducer(played, { type: 'stopHere' }).final?.winner).toBe('tie');

    const awayAhead = { ...START, away: 9, home: 4 };
    const played2 = sessionReducer(open(), { type: 'paFinished', entry: WALKOFF_LOG, state: awayAhead });
    expect(sessionReducer(played2, { type: 'stopHere' }).final?.winner).toBe('away');
  });

  it('해석 중에 공을 던졌으면 늦게 온 해석은 넣지 않고 해석 중 표시만 끈다', () => {
    const inflight = pitch(sessionReducer(open(), { type: 'interpretStart' }), 'B', 1, 0);
    const landed = sessionReducer(inflight, { type: 'interpretDone', entry: tmi('tmi-1'), note: '늦게 도착', disableProvider: true });
    expect(landed).toMatchObject({ tmis: [], interpreting: false, notice: '늦게 도착', providerDisabled: true });
  });

  it('해석을 시작하지 않았으면 interpretDone·interpretFailed는 같은 객체', () => {
    const s = open();
    expect(sessionReducer(s, { type: 'interpretDone', entry: tmi('tmi-1'), note: '', disableProvider: false })).toBe(s);
    expect(sessionReducer(s, { type: 'interpretFailed', note: '오류' })).toBe(s);
  });

  it('해석 실패는 해석 중 표시를 끄고 알림을 남긴다', () => {
    const failed = reduce(open(), { type: 'interpretStart' }, { type: 'interpretFailed', note: 'TMI를 한 줄 적어 주세요.' });
    expect(failed).toMatchObject({ interpreting: false, notice: 'TMI를 한 줄 적어 주세요.', tmis: [] });
  });

  it('거부된 해석은 TMI 칸을 차지하지 않고 거부 이유를 알림으로 남긴다', () => {
    const refused = addTmi(open(), tmi('tmi-1', true), 'AI 해석을 쓸 수 없어 규칙으로 계산했어요.', true);
    expect(refused).toMatchObject({ tmis: [], interpreting: false, notice: '민감한 내용', providerDisabled: true });
    const next = addTmi(refused, tmi('tmi-2'));
    expect(next.tmis.map((e) => e.id)).toEqual(['tmi-2']);
  });

  it('이미 해석 중이면 interpretStart를 무시한다', () => {
    const s = sessionReducer(open(), { type: 'interpretStart' });
    expect(sessionReducer(s, { type: 'interpretStart' })).toBe(s);
  });

  it('TMI는 3개까지 쌓는다', () => {
    let s = open();
    for (const id of ['tmi-1', 'tmi-2', 'tmi-3']) s = addTmi(s, tmi(id));
    expect(s.tmis.map((e) => e.id)).toEqual(['tmi-1', 'tmi-2', 'tmi-3']);
    expect(sessionReducer(s, { type: 'interpretStart' })).toBe(s);
    expect(addTmi(s, tmi('tmi-4'))).toBe(s);
  });

  it('removeTmi는 그 TMI·판정·판정 중 표시를 지우고, 모르는 id면 같은 객체', () => {
    let s = addTmi(addTmi(open(), tmi('tmi-1')), tmi('tmi-2'));
    s = judge(s, 'tmi-1', VERDICT);
    const removed = sessionReducer(s, { type: 'removeTmi', id: 'tmi-1' });
    expect(removed.tmis.map((e) => e.id)).toEqual(['tmi-2']);
    expect(removed.verdicts).toEqual({});
    expect(sessionReducer(removed, { type: 'removeTmi', id: 'nope' })).toBe(removed);

    const judging = sessionReducer(removed, { type: 'judgeStart', id: 'tmi-2' });
    const gone = sessionReducer(judging, { type: 'removeTmi', id: 'tmi-2' });
    expect(gone.judgingId).toBeNull();
    expect(sessionReducer(gone, { type: 'judgeDone', id: 'tmi-2', verdict: VERDICT, note: '', disableProvider: false })).toBe(gone);
  });

  it('같은 모드로 바꾸면 같은 객체', () => {
    const s = open();
    expect(sessionReducer(s, { type: 'setMode', mode: 'real' })).toBe(s);
  });
});

describe('sessionReducer — 장면·화면', () => {
  it('openSituation은 준 tmis·mode를 쓴다', () => {
    const s = open({ tmis: [tmi('tmi-9')], mode: 'toon' });
    expect(s.tmis.map((e) => e.id)).toEqual(['tmi-9']);
    expect(s.mode).toBe('toon');
  });

  it('openSituation은 기록·결과·판정·알림을 초기화하고, tmis를 안 주면 비우고 mode를 안 주면 유지한다', () => {
    let s = addTmi(open(), tmi('tmi-1'), '규칙으로 계산했어요.');
    s = sessionReducer(s, { type: 'setMode', mode: 'toon' });
    s = judge(s, 'tmi-1', VERDICT);
    s = reduce(
      s,
      { type: 'paFinished', entry: WALKOFF_LOG, state: WALKOFF_STATE },
      { type: 'gameFinished', winner: 'home', walkoff: true, state: WALKOFF_STATE },
    );
    const other: GameState = { ...START, inning: 3, half: 0, outs: 0, bases: 0 };
    const reopened = sessionReducer(s, { type: 'openSituation', situation: otherSituation(other), seed: 7 });
    expect(reopened).toMatchObject({
      screen: 'play',
      seed: 7,
      mode: 'toon',
      tmis: [],
      interpreting: false,
      notice: '',
      verdicts: {},
      judgingId: null,
      log: [],
      status: 'ready',
      final: null,
    });
    expect(reopened.situation?.id).toBe('other-situation');
    expect(reopened.live).toEqual(freshLive(other));
  });

  it('해석 중에 다른 장면을 열면 옛 장면의 해석 결과는 버린다', () => {
    const inflight = sessionReducer(open(), { type: 'interpretStart' });
    const reopened = sessionReducer(inflight, { type: 'openSituation', situation: otherSituation(START), seed: 7 });
    expect(reopened.interpreting).toBe(false);
    expect(sessionReducer(reopened, { type: 'interpretDone', entry: tmi('tmi-1'), note: '', disableProvider: false })).toBe(reopened);
  });

  it('navigate: 열린 장면이 없으면 play·result 대신 home, 같은 화면이면 같은 객체', () => {
    const evidence = sessionReducer(initialSession, { type: 'navigate', screen: 'evidence' });
    expect(evidence.screen).toBe('evidence');
    expect(sessionReducer(evidence, { type: 'navigate', screen: 'play' }).screen).toBe('home');
    expect(sessionReducer(evidence, { type: 'navigate', screen: 'result' }).screen).toBe('home');
    expect(sessionReducer(evidence, { type: 'navigate', screen: 'evidence' })).toBe(evidence);
    expect(sessionReducer(initialSession, { type: 'navigate', screen: 'play' })).toBe(initialSession);

    const s = open();
    expect(sessionReducer(s, { type: 'navigate', screen: 'result' }).screen).toBe('result');
    expect(sessionReducer(s, { type: 'navigate', screen: 'about' })).toMatchObject({ screen: 'about' });
    expect(sessionReducer(s, { type: 'navigate', screen: 'about' }).situation?.id).toBe(SCENE.id);
  });

  it('resetPlay는 TMI·판정을 두고 재생만 시작 상태로 되돌린다', () => {
    let s = judge(addTmi(open(), tmi('tmi-1')), 'tmi-1', VERDICT);
    s = pitch(s, 'X', 0, 0);
    s = reduce(
      s,
      { type: 'paFinished', entry: WALKOFF_LOG, state: WALKOFF_STATE },
      { type: 'gameFinished', winner: 'home', walkoff: true, state: WALKOFF_STATE },
    );
    const reset = sessionReducer(s, { type: 'resetPlay', seed: 43 });
    expect(reset).toMatchObject({ screen: 'play', seed: 43, status: 'ready', log: [], final: null });
    expect(reset.live).toEqual(freshLive(START));
    expect(reset.tmis).toBe(s.tmis);
    expect(reset.verdicts).toBe(s.verdicts);
    expect(canEditTmi(reset)).toBe(true);
  });

  it('resetPlay는 공이 날아가는 중이면 무시한다', () => {
    const animating = sessionReducer(open(), { type: 'animationStart' });
    expect(sessionReducer(animating, { type: 'resetPlay', seed: 2 })).toBe(animating);
  });
});

describe('sessionReducer — 판정', () => {
  it('judgeStart → judgeDone으로 판정을 저장하고, providerDisabled는 한 번 켜지면 유지된다', () => {
    const s = addTmi(open(), tmi('tmi-1'));
    const judging = sessionReducer(s, { type: 'judgeStart', id: 'tmi-1' });
    expect(judging.judgingId).toBe('tmi-1');
    const judged = sessionReducer(judging, {
      type: 'judgeDone',
      id: 'tmi-1',
      verdict: VERDICT,
      note: 'AI 판정을 쓸 수 없어 기록표로 판정했어요.',
      disableProvider: true,
    });
    expect(judged).toMatchObject({
      judgingId: null,
      verdicts: { 'tmi-1': VERDICT },
      providerDisabled: true,
      notice: 'AI 판정을 쓸 수 없어 기록표로 판정했어요.',
    });
    expect(judge(judged, 'tmi-1', VERDICT, false).providerDisabled).toBe(true);
  });

  it('TMI 편집이 잠겨도 판정은 할 수 있다', () => {
    const locked = pitch(addTmi(open(), tmi('tmi-1')), 'B', 1, 0);
    expect(canEditTmi(locked)).toBe(false);
    expect(sessionReducer(locked, { type: 'judgeStart', id: 'tmi-1' }).judgingId).toBe('tmi-1');
  });

  it('모르는 id·거부된 TMI·이미 판정 중·짝이 맞지 않는 judgeDone은 같은 객체', () => {
    const s = addTmi(addTmi(open(), tmi('tmi-1')), tmi('tmi-2', true));
    expect(sessionReducer(s, { type: 'judgeStart', id: 'nope' })).toBe(s);
    expect(sessionReducer(s, { type: 'judgeStart', id: 'tmi-2' })).toBe(s);
    expect(sessionReducer(s, { type: 'judgeDone', id: 'tmi-1', verdict: VERDICT, note: '', disableProvider: false })).toBe(s);

    const judging = sessionReducer(s, { type: 'judgeStart', id: 'tmi-1' });
    expect(sessionReducer(judging, { type: 'judgeStart', id: 'tmi-1' })).toBe(judging);
    expect(sessionReducer(judging, { type: 'judgeDone', id: 'tmi-2', verdict: VERDICT, note: '', disableProvider: false })).toBe(judging);
  });
});
