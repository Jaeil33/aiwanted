import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { PITCH_TYPES } from '../domain/events';
import { applyTransition, createRng, nextCount, pickHighlights, startNextHalf, type Evaluation, type PlayoutResult } from '../engine';
import {
  batterFor,
  compileSessionEffects,
  headline,
  logEntryFor,
  pitcherFor,
  playbackFor,
  resolvePitch,
  samplePitchCode,
  specKey,
  type GameSpec,
  type SituationSetup,
  type SessionState,
} from '../game';
import type { PitchPlayback, StageController } from '../stage';
import type { PitchRow } from '../types/data';
import type { GameState } from '../types/domain';
import { useGame } from './GameProvider';
import { gameSpecFor } from './useSceneEvaluations';

/*
 * 다시 치르기(한 구·타석 끝까지·경기 끝까지). 공 결과는 엔진 평가와 session seed에서 만든 난수로만 뽑고(ADR-002),
 * 경기장 연출(playPitch)을 기다린 뒤 세션 액션을 보낸다. 전광판(setBoard)은 이 훅만 명령형으로 바꾼다.
 */

export interface PlaybackOptions {
  /** 연출하지 않는 타석 사이 대기. 테스트는 곧바로 끝나는 함수를 넣는다 */
  sleep?: (ms: number) => Promise<void>;
}

/** 타석 직후 승리확률 (차트의 원정 팀 기준 값에 무승부가 필요하다) */
export interface TrailPoint {
  winHome: number;
  tie: number;
}

export interface Playback {
  throwPitch(): Promise<void>;
  finishPa(): Promise<void>;
  finishGame(): Promise<void>;
  busy: boolean;
  /** 이번 판 타석 번호 → 타석 직후 승리확률·무승부 */
  trail: Record<number, TrailPoint>;
}

/** 공마다 난수 seed = session seed × 이 값 + 이번 판 누적 투구 수 */
const SEED_STRIDE = 100_003;
/** 경기 끝까지: 연출하지 않는 타석 사이 대기(ms) */
const QUIET_PA_MS = 150;
const MAX_PITCHES_PER_PA = 400;
const EMPTY_TRAIL: Record<number, TrailPoint> = Object.freeze({});

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

type Outcome = 'ended' | 'continued' | 'stopped';

/** 이번 판 식별: 장면을 다시 열거나 처음부터 하면 바뀐다 */
const runKeyOf = (s: SessionState) => `${s.sceneId ?? ''}|${s.seed}`;

const nameOf = (setup: SituationSetup, id: string) => (Object.hasOwn(setup.names, id) ? setup.names[id] : id);
const matchupLine = (setup: SituationSetup, state: GameState) => `${batterFor(setup, state).name} vs ${nameOf(setup, pitcherFor(setup, state).id)}`;
const pitchLine = (row: PitchRow | null) => (row ? `${PITCH_TYPES[row[0]] ?? '기타'} ${Math.round(row[1])}km` : '');

export function usePlayback(stageRef: RefObject<StageController | null>, opts: PlaybackOptions = {}): Playback {
  const { setup, session, engine, data, dispatch, getSession } = useGame();
  const [busy, setBusy] = useState(false);
  const [trailState, setTrailState] = useState<{ key: string; points: Record<number, TrailPoint> }>({ key: '', points: EMPTY_TRAIL });
  const busyRef = useRef(false);
  const mounted = useRef(false);
  const counter = useRef({ key: '', thrown: 0 });
  const evalCache = useRef<{ key: string; ev: Evaluation } | null>(null);
  const latest = useRef({ setup, engine, data, sleep: opts.sleep ?? defaultSleep });

  useLayoutEffect(() => {
    latest.current = { setup, engine, data, sleep: opts.sleep ?? defaultSleep };
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 쉬는 동안 전광판 첫 줄: 지금 타자 vs 투수
  const liveState = session.live ? session.live.state : null;
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !setup || !liveState || busyRef.current) return;
    stage.setBoard([matchupLine(setup, liveState), '']);
  }, [stageRef, setup, liveState]);

  const runners = useMemo(() => {
    const alive = (key: string) => mounted.current && runKeyOf(getSession()) === key;

    const nextSeed = (s: SessionState) => {
      const key = runKeyOf(s);
      if (counter.current.key !== key) counter.current = { key, thrown: 0 };
      const seed = s.seed * SEED_STRIDE + counter.current.thrown;
      counter.current.thrown += 1;
      return seed;
    };

    const specOf = (st: SituationSetup, s: SessionState, dropPa: boolean): GameSpec => {
      const effects = compileSessionEffects(s.tmis, st, latest.current.data.evidence);
      return gameSpecFor(st, dropPa ? effects.filter((fx) => fx.scope !== 'pa') : effects, s.mode);
    };

    const evaluationAt = async (st: SituationSetup, spec: GameSpec, state: GameState, first: boolean): Promise<Evaluation> => {
      const key = `${specKey(spec)}\n${JSON.stringify(state)}\n${first}`;
      const cached = evalCache.current;
      if (cached && cached.key === key) return cached.ev;
      const ev = await latest.current.engine.evaluate({ spec, state, pitcher: pitcherFor(st, state), first });
      evalCache.current = { key, ev };
      return ev;
    };

    const remember = (key: string, index: number, point: TrailPoint | null) => {
      if (!point || !mounted.current) return;
      setTrailState((prev) => ({ key, points: { ...(prev.key === key ? prev.points : {}), [index]: point } }));
    };

    /** 새 타석 첫 공이면 지난 존 표시를 지우고, 전광판 첫 줄을 쓰고, 공을 놓는 순간 둘째 줄(구종·구속)을 쓴다 */
    const prepareStage = (line1: string, playback: PitchPlayback, firstOfPa: boolean): StageController | null => {
      const stage = stageRef.current;
      if (!stage) return null;
      if (firstOfPa) stage.clearMarkers();
      stage.setBoard([line1, '']);
      playback.onRelease = () => stageRef.current?.setBoard([line1, pitchLine(playback.row)]);
      return stage;
    };

    /** 공 하나: 엔진 평가 → 공 결과·타석 결과 → 연출 → pitchApplied(→ paFinished → gameFinished) */
    async function pitchOnce(fastUntilEnd: boolean): Promise<Outcome> {
      const s = getSession();
      const st = latest.current.setup;
      const live = s.live;
      if (!st || !live || s.status !== 'ready' || s.interpreting || st.situation.id !== s.sceneId) return 'stopped';
      const key = runKeyOf(s);
      const spec = specOf(st, s, false);
      const state = live.state;
      let ev: Evaluation;
      try {
        ev = await evaluationAt(st, spec, state, live.paIndex === 0);
      } catch {
        return 'stopped';
      }
      const now = getSession();
      if (!mounted.current || now.live !== live || now.status !== 'ready' || now.tmis !== s.tmis || now.mode !== s.mode) return 'stopped';

      const r = createRng(nextSeed(s));
      const { balls, strikes } = live;
      const code = samplePitchCode(ev, balls, strikes, r);
      const res = resolvePitch(ev, state, balls, strikes, code, r);
      const applied = res.ended ? applyTransition(state, res.ended.transition) : null;
      const over = applied ? applied.over : null;
      const playback = playbackFor({
        setup: st,
        data: latest.current.data,
        state,
        code,
        balls,
        strikes,
        number: live.pitches.length + 1,
        ended: res.ended,
        over,
        fast: fastUntilEnd && res.ended === null,
        r,
      });

      // 타석이 끝났으면 연출과 함께 다음 상태의 승리확률을 계산해 둔다 (다음 타석 평가 캐시도 된다)
      let nextState: GameState | null = null;
      let wpPromise: Promise<TrailPoint | null> = Promise.resolve(null);
      if (applied && over && over.kind === 'game') {
        wpPromise = Promise.resolve({ winHome: over.winner === 'home' ? 1 : 0, tie: over.winner === 'tie' ? 1 : 0 });
      } else if (applied) {
        const upcoming = over && over.kind === 'half' ? startNextHalf(applied.state) : applied.state;
        nextState = upcoming;
        wpPromise = evaluationAt(st, spec, upcoming, false).then(
          (next) => ({ winHome: next.winHome, tie: next.tie }),
          () => null,
        );
      }

      const stage = prepareStage(matchupLine(st, state), playback, live.pitches.length === 0);
      dispatch({ type: 'animationStart' });
      if (stage) await stage.playPitch(playback);
      const wp = await wpPromise;
      // 장면을 다시 열었으면 세션이 이미 새 판이다. 언마운트만 됐으면 던진 공은 마무리한다(연출 중 상태로 남기지 않는다)
      if (runKeyOf(getSession()) !== key) return 'stopped';
      dispatch({ type: 'pitchApplied', code, balls: res.balls, strikes: res.strikes });
      if (!res.ended || !applied) return mounted.current ? 'continued' : 'stopped';

      const batter = batterFor(st, state);
      const pitcher = pitcherFor(st, state);
      remember(key, live.paIndex, wp);
      dispatch({
        type: 'paFinished',
        entry: logEntryFor({
          setup: st,
          index: live.paIndex,
          before: state,
          after: applied.state,
          batterId: batter.id,
          pitcherId: pitcher.id,
          headline: headline(res.ended.event, res.ended.transition, over),
          wpHomeAfter: wp ? wp.winHome : null,
          highlight: false,
        }),
        state: nextState ?? applied.state,
      });
      if (over && over.kind === 'game') {
        dispatch({ type: 'gameFinished', winner: over.winner, walkoff: over.walkoff, state: applied.state });
      }
      return mounted.current ? 'ended' : 'stopped';
    }

    async function finishPaLoop(): Promise<Outcome> {
      for (let n = 0; n < MAX_PITCHES_PER_PA; n++) {
        const outcome = await pitchOnce(true);
        if (outcome !== 'continued') return outcome;
      }
      return 'stopped';
    }

    /** 타석 중간이면 먼저 끝내고, 엔진 playout으로 경기 끝까지. 승부처 타석만 공마다 연출하고 나머지는 기록만 남긴다 */
    async function finishGameRun(): Promise<void> {
      let s = getSession();
      if (!s.live || s.status !== 'ready') return;
      if (s.live.pitches.length > 0) {
        if ((await finishPaLoop()) !== 'ended') return;
        s = getSession();
      }
      const st = latest.current.setup;
      const live = s.live;
      if (!st || !live || s.status !== 'ready' || st.situation.id !== s.sceneId) return;
      const key = runKeyOf(s);
      const start = live.state;
      let result: PlayoutResult;
      try {
        // 장면 첫 타석이 이미 끝났으면 이번 타석(pa) 효과는 빼고 재생한다
        result = await latest.current.engine.playout({
          spec: specOf(st, s, live.paIndex > 0),
          start,
          scenePitcher: pitcherFor(st, start),
          seed: nextSeed(s),
        });
      } catch {
        return;
      }
      const now = getSession();
      if (!alive(key) || now.live !== live || now.tmis !== s.tmis || now.mode !== s.mode) return;

      const picks = new Set(pickHighlights(result));
      const pas = result.plateAppearances;
      for (let k = 0; k < pas.length; k++) {
        const pa = pas[k];
        const highlight = picks.has(k);
        const index = live.paIndex + k;
        const nextBefore = k + 1 < pas.length ? pas[k + 1].before : pa.over?.kind === 'half' ? startNextHalf(pa.after) : pa.after;

        if (highlight && pa.pitches.length > 0) {
          const line1 = `${nameOf(st, pa.batterId)} vs ${nameOf(st, pa.pitcherId)}`;
          for (let i = 0; i < pa.pitches.length; i++) {
            const pitch = pa.pitches[i];
            const last = i === pa.pitches.length - 1;
            const playback = playbackFor({
              setup: st,
              data: latest.current.data,
              state: pa.before,
              code: pitch.code,
              balls: pitch.balls,
              strikes: pitch.strikes,
              number: i + 1,
              ended: last ? { event: pa.event, transition: pa.transition } : null,
              over: last ? pa.over : null,
              fast: !last,
              r: createRng(nextSeed(s)),
            });
            const stage = prepareStage(line1, playback, i === 0);
            dispatch({ type: 'animationStart' });
            if (stage) await stage.playPitch(playback);
            if (runKeyOf(getSession()) !== key) return;
            const counted = nextCount(pitch.balls, pitch.strikes, pitch.code);
            dispatch({ type: 'pitchApplied', code: pitch.code, balls: counted.balls, strikes: counted.strikes });
            if (!last && !mounted.current) return;
          }
        }

        remember(key, index, pa.wpHomeAfter === null ? null : { winHome: pa.wpHomeAfter, tie: pa.tieAfter ?? 0 });
        dispatch({
          type: 'paFinished',
          entry: logEntryFor({
            setup: st,
            index,
            before: pa.before,
            after: pa.after,
            batterId: pa.batterId,
            pitcherId: pa.pitcherId,
            headline: headline(pa.event, pa.transition, pa.over),
            wpHomeAfter: pa.wpHomeAfter,
            highlight,
          }),
          state: nextBefore,
        });
        if (pa.over?.kind === 'game') {
          dispatch({ type: 'gameFinished', winner: pa.over.winner, walkoff: pa.over.walkoff, state: pa.after });
          return;
        }
        if (!highlight) await latest.current.sleep(QUIET_PA_MS);
        if (!alive(key)) return;
      }
      if (result.truncated) dispatch({ type: 'gameFinished', winner: result.winner, walkoff: false, state: result.final });
    }

    /** 진행 중에 다시 부르면 무시한다 */
    const guarded =
      (run: () => Promise<unknown>) =>
      async (): Promise<void> => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        try {
          await run();
        } finally {
          busyRef.current = false;
          if (mounted.current) setBusy(false);
        }
      };

    return {
      throwPitch: guarded(() => pitchOnce(false)),
      finishPa: guarded(finishPaLoop),
      finishGame: guarded(finishGameRun),
    };
  }, [dispatch, getSession, stageRef]);

  const trail = trailState.key === runKeyOf(session) ? trailState.points : EMPTY_TRAIL;
  return { ...runners, busy, trail };
}
