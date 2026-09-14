import { useEffect, useMemo, useState } from 'react';
import { gaugesAtCount, type Evaluation } from '../engine';
import { compileSessionEffects, pitcherFor, specKey, type EvaluateRequest, type GameSpec, type GaugeLike, type SceneSetup } from '../game';
import type { EngineEffect, GameState, Mode } from '../types/domain';
import { useGame } from './GameProvider';

/*
 * 3단 승률판에 쓸 엔진 평가. 모든 확률은 엔진 클라이언트(evaluate) 결과이고, 여기서는 요청을 만들고 결과를 고르기만 한다.
 */

/** 장면의 리그 분포·두 팀·카운트 표와 효과·모드로 만든 경기 spec */
export function gameSpecFor(setup: SceneSetup, effects: EngineEffect[], mode: Mode): GameSpec {
  return { lg: setup.lg, away: setup.away, home: setup.home, countTable: setup.countTable, effects, mode };
}

export interface EvaluationPair {
  /** 효과 없음·현실 모드 */
  base: Evaluation | null;
  /** 세션 TMI 효과·세션 모드 */
  tmi: Evaluation | null;
  /** 지금 요청의 결과를 기다리는 중 */
  pending: boolean;
}

export interface SceneEvaluations extends EvaluationPair {
  baseGauge: GaugeLike | null;
  tmiGauge: GaugeLike | null;
}

interface PairRequest {
  key: string;
  sceneId: string;
  base: EvaluateRequest;
  /** base와 spec이 같으면 null (한 번만 계산한다) */
  tmi: EvaluateRequest | null;
}

interface Settled {
  key: string;
  sceneId: string;
  base: Evaluation | null;
  tmi: Evaluation | null;
}

/**
 * 한 상태에서 base·tmi 평가를 구한다. 요청 키(두 spec 키 + 상태 + first)가 바뀌면 다시 계산하고, 늦게 도착한 옛 결과는 버린다.
 * active가 false면 요청하지 않고 마지막 값을 유지한다(끝난 경기·3아웃 상태는 엔진이 RangeError를 던진다).
 */
export function useEvaluationPair(state: GameState | null, first: boolean, active: boolean): EvaluationPair {
  const { setup, session, engine, data } = useGame();
  const effects = useMemo(() => (setup ? compileSessionEffects(session.tmis, setup, data.evidence) : []), [setup, session.tmis, data.evidence]);
  const stateKey = state ? JSON.stringify(state) : null;

  const request = useMemo((): PairRequest | null => {
    if (!setup || stateKey === null || !active) return null;
    const target = JSON.parse(stateKey) as GameState;
    const baseSpec = gameSpecFor(setup, [], 'real');
    const tmiSpec = gameSpecFor(setup, effects, session.mode);
    const baseKey = specKey(baseSpec);
    const tmiKey = specKey(tmiSpec);
    const pitcher = pitcherFor(setup, target);
    return {
      key: [baseKey, tmiKey, stateKey, String(first)].join('\n'),
      sceneId: setup.scene.id,
      base: { spec: baseSpec, state: target, pitcher, first },
      tmi: baseKey === tmiKey ? null : { spec: tmiSpec, state: target, pitcher, first },
    };
  }, [setup, stateKey, active, effects, session.mode, first]);

  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    const basePromise = engine.evaluate(request.base);
    const tmiPromise = request.tmi ? engine.evaluate(request.tmi) : basePromise;
    Promise.all([basePromise, tmiPromise]).then(
      ([base, tmi]) => {
        if (!cancelled) setSettled({ key: request.key, sceneId: request.sceneId, base, tmi });
      },
      () => {
        if (cancelled) return;
        // 계산 실패(엔진 교체로 닫힌 클라이언트 등): 이 요청은 끝난 것으로 보고 같은 장면의 마지막 값을 유지한다
        setSettled((prev) => {
          const keep = prev !== null && prev.sceneId === request.sceneId;
          return { key: request.key, sceneId: request.sceneId, base: keep ? prev.base : null, tmi: keep ? prev.tmi : null };
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [request, engine]);

  const sceneId = setup ? setup.scene.id : null;
  const current = settled !== null && settled.sceneId === sceneId ? settled : null;
  return {
    base: current ? current.base : null,
    tmi: current ? current.tmi : null,
    pending: request !== null && (settled === null || settled.key !== request.key),
  };
}

/** 게이지: 카운트 모델이 있으면 지금 카운트의 gaugesAtCount, 없으면 평가 값. 이닝 줄에 쓸 기대 득점(타석 시작 기준)을 붙인다 */
function gaugeOf(ev: Evaluation | null, balls: number, strikes: number): GaugeLike | null {
  if (!ev) return null;
  if (!ev.count || ev.after.length !== 7) {
    return { batterWin: ev.batterWin, inningScore: ev.inningScore, expRuns: ev.expRuns, winHome: ev.winHome, tie: ev.tie, winAway: ev.winAway };
  }
  const g = gaugesAtCount(ev, Math.min(3, Math.max(0, balls)), Math.min(2, Math.max(0, strikes)));
  return { batterWin: g.batterWin, inningScore: g.inningScore, expRuns: ev.expRuns, winHome: g.winHome, tie: g.tie, winAway: g.winAway };
}

/** 지금 재생 상태(live.state, 첫 타석 여부, 카운트)의 base·tmi 평가와 게이지. 장면이 없거나 경기가 끝나면 요청하지 않는다 */
export function useSceneEvaluations(): SceneEvaluations {
  const { session } = useGame();
  const live = session.live;
  const active = live !== null && session.status !== 'finished';
  const pair = useEvaluationPair(live ? live.state : null, live ? live.paIndex === 0 : true, active);
  const balls = live ? live.balls : 0;
  const strikes = live ? live.strikes : 0;
  const baseGauge = useMemo(() => gaugeOf(pair.base, balls, strikes), [pair.base, balls, strikes]);
  const tmiGauge = useMemo(() => gaugeOf(pair.tmi, balls, strikes), [pair.tmi, balls, strikes]);
  return { base: pair.base, tmi: pair.tmi, baseGauge, tmiGauge, pending: pair.pending };
}
