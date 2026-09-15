import { useEffect, useMemo, useState } from 'react';
import type { Evaluation } from '../engine';
import { compileSessionEffects, pitcherFor, specKey, type EvaluateRequest } from '../game';
import { useGame } from './GameProvider';
import { gameSpecFor } from './useSceneEvaluations';

/*
 * 타석 화면 확률(ADR-016·019): 장면 시작 상태(첫 타석)에서 TMI 없음·TMI(현실)·TMI(만화) 세 평가.
 * 모든 확률은 엔진 클라이언트 결과이고 여기서는 요청을 만들고 고르기만 한다.
 */

export interface PaOdds {
  base: Evaluation | null;
  /** TMI가 없으면 base와 같은 객체 */
  tmi: Evaluation | null;
  /** 만화 모드. TMI가 없으면 base와 같은 객체 */
  toon: Evaluation | null;
  pending: boolean;
}

interface Settled {
  key: string;
  sceneId: string;
  base: Evaluation | null;
  tmi: Evaluation | null;
  toon: Evaluation | null;
}

const EMPTY: PaOdds = { base: null, tmi: null, toon: null, pending: false };

export function usePaOdds(): PaOdds {
  const { setup, session, engine, data } = useGame();
  const effects = useMemo(() => (setup ? compileSessionEffects(session.tmis, setup, data.evidence) : []), [setup, session.tmis, data.evidence]);

  const request = useMemo(() => {
    if (!setup) return null;
    const state = setup.scene.state;
    const pitcher = pitcherFor(setup, state);
    const at = (spec: EvaluateRequest['spec']): EvaluateRequest => ({ spec, state, pitcher, first: true });
    const base = at(gameSpecFor(setup, [], 'real'));
    if (effects.length === 0) return { key: specKey(base.spec), sceneId: setup.scene.id, base, tmi: null, toon: null };
    const tmi = at(gameSpecFor(setup, effects, 'real'));
    const toon = at(gameSpecFor(setup, effects, 'toon'));
    return { key: [specKey(base.spec), specKey(tmi.spec), specKey(toon.spec)].join('\n'), sceneId: setup.scene.id, base, tmi, toon };
  }, [setup, effects]);

  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    const basePromise = engine.evaluate(request.base);
    const tmiPromise = request.tmi ? engine.evaluate(request.tmi) : basePromise;
    const toonPromise = request.toon ? engine.evaluate(request.toon) : basePromise;
    Promise.all([basePromise, tmiPromise, toonPromise]).then(
      ([base, tmi, toon]) => {
        if (!cancelled) setSettled({ key: request.key, sceneId: request.sceneId, base, tmi, toon });
      },
      () => {
        if (cancelled) return;
        // 계산 실패: 이 요청은 끝난 것으로 보고 같은 장면의 마지막 값을 유지한다
        setSettled((prev) => {
          const keep = prev !== null && prev.sceneId === request.sceneId;
          return { key: request.key, sceneId: request.sceneId, base: keep ? prev.base : null, tmi: keep ? prev.tmi : null, toon: keep ? prev.toon : null };
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [request, engine]);

  if (!request) return EMPTY;
  const current = settled !== null && settled.sceneId === request.sceneId ? settled : null;
  return {
    base: current ? current.base : null,
    tmi: current ? current.tmi : null,
    toon: current ? current.toon : null,
    pending: settled === null || settled.key !== request.key,
  };
}
