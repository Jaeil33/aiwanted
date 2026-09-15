import { useEffect, useState } from 'react';
import { buildSceneSetup, pitcherFor } from '../game/scene';
import { expectedSwing } from '../game/selectors';
import type { SceneRecord } from '../types/data';
import { useGame } from './GameProvider';
import { gameSpecFor } from './useSceneEvaluations';

/*
 * 로비 승부처 지수(ADR-014): 장면 시작 상태를 TMI 없음·현실 모드로 엔진에 평가해 expectedSwing을 구한다.
 * 실제 결과의 |WPA|(SceneRecord.leverage)는 결과를 알려주므로 쓰지 않는다. 숫자는 엔진 평가에서만 온다.
 */

export interface SceneSwings {
  /** 장면 id → 기대 승부처 지수(%p). 평가에 실패했으면 null, 아직이면 키가 없다 */
  swings: Record<string, number | null>;
  /** 아직 값이 없는 장면이 있다 */
  pending: boolean;
}

interface Settled {
  key: string;
  swings: Record<string, number | null>;
}

const EMPTY: Settled = { key: '', swings: {} };

/** 장면을 넘긴 순서대로 하나씩 평가한다(한꺼번에 보내지 않는다). 장면 목록이 바뀌거나 언마운트되면 남은 요청을 멈춘다 */
export function useSceneSwings(scenes: readonly SceneRecord[]): SceneSwings {
  const { data, engine } = useGame();
  const key = scenes.map((scene) => scene.id).join('\n');
  const [settled, setSettled] = useState<Settled>(EMPTY);

  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    const ids = key.split('\n');
    void (async () => {
      for (const id of ids) {
        let swing: number | null = null;
        try {
          const setup = buildSceneSetup(data, id);
          const state = setup.scene.state;
          const ev = await engine.evaluate({ spec: gameSpecFor(setup, [], 'real'), state, pitcher: pitcherFor(setup, state), first: true });
          swing = expectedSwing(ev);
        } catch {
          swing = null;
        }
        if (cancelled) return;
        setSettled((prev) => ({ key, swings: { ...(prev.key === key ? prev.swings : {}), [id]: swing } }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, data, engine]);

  const swings = settled.key === key ? settled.swings : EMPTY.swings;
  const pending = key !== '' && key.split('\n').some((id) => !Object.hasOwn(swings, id));
  return { swings, pending };
}
