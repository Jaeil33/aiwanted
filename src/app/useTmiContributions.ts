import { useEffect, useMemo, useState } from 'react';
import { compileSessionEffects, pitcherFor, specKey, type EvaluateRequest } from '../game';
import { battingWin } from '../game/selectors';
import { useGame } from './GameProvider';
import { gameSpecFor } from './useSceneEvaluations';

/*
 * TMI 칩의 변화 값(시안 .pill b): 그 TMI 하나만 걸었을 때 장면 시작 상태에서 장면 공격 팀 승리확률이 TMI 없음보다 몇 %p 바뀌는지.
 * 숫자는 엔진 평가끼리 뺀 값이다(CLAUDE.md CRITICAL). 요청은 하나씩 차례로 보낸다.
 */

interface Settled {
  key: string;
  values: Record<string, number>;
}

/** TMI id → %p 변화. 아직 계산하지 못했으면 null */
export function useTmiContributions(): Record<string, number | null> {
  const { setup, session, engine, data } = useGame();
  const { tmis, mode } = session;

  const request = useMemo(() => {
    if (!setup) return null;
    const state = setup.situation.state;
    const pitcher = pitcherFor(setup, state);
    const base: EvaluateRequest = { spec: gameSpecFor(setup, [], 'real'), state, pitcher, first: true };
    const items = tmis
      .filter((entry) => !entry.interpretation.refused)
      .map((entry) => {
        const req: EvaluateRequest = { spec: gameSpecFor(setup, compileSessionEffects([entry], setup, data.evidence), mode), state, pitcher, first: true };
        return { id: entry.id, req };
      });
    const key = [setup.situation.id, specKey(base.spec), ...items.map((item) => `${item.id}:${specKey(item.req.spec)}`)].join('\n');
    return { key, base, items, batSide: setup.batSide };
  }, [setup, tmis, mode, data.evidence]);

  const [settled, setSettled] = useState<Settled>({ key: '', values: {} });

  useEffect(() => {
    if (!request || request.items.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const base = await engine.evaluate(request.base);
        const values: Record<string, number> = {};
        for (const item of request.items) {
          const ev = await engine.evaluate(item.req);
          if (cancelled) return;
          values[item.id] = (battingWin(ev, request.batSide) - battingWin(base, request.batSide)) * 100;
          setSettled({ key: request.key, values: { ...values } });
        }
      } catch {
        // 계산 실패(엔진 교체로 닫힌 클라이언트 등): 칩은 계산 중으로 남는다
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [request, engine]);

  if (!request) return {};
  const values = settled.key === request.key ? settled.values : {};
  return Object.fromEntries(request.items.map((item) => [item.id, Object.hasOwn(values, item.id) ? values[item.id] : null]));
}
