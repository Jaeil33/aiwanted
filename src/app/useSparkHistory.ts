import { useState } from 'react';
import type { GaugeLike } from '../game';
import type { SparkPoint } from '../game/broadcast';
import { useGame } from './GameProvider';

/*
 * 추이선 기록(ADR-025): 이번 판에서 게이지가 새로 올 때마다 한 점. 장면·판(seed)·모드·TMI가 바뀌면 처음부터 다시 쌓는다.
 * 새 타석 평가를 기다리는 동안(pending)에는 옛 게이지로 점을 찍지 않는다.
 */

const MAX_POINTS = 80;

export function useSparkHistory(gauge: GaugeLike | null, pending: boolean): SparkPoint[] {
  const { session } = useGame();
  const live = session.live;
  const key = `${session.sceneId ?? ''}|${session.seed}|${session.mode}|${session.tmis.map((entry) => entry.id).join(',')}`;
  const [store, setStore] = useState<{ key: string; points: SparkPoint[]; last: GaugeLike | null }>({ key: '', points: [], last: null });

  // 렌더 중 상태 맞추기: 게이지가 바뀐 렌더에서만 한 번 더 그린다
  if (live && gauge && !pending && (store.key !== key || store.last !== gauge)) {
    const kept = store.key === key ? store.points : [];
    const point: SparkPoint = { paIndex: live.paIndex, inning: live.state.inning, half: live.state.half, tmi: gauge };
    setStore({ key, last: gauge, points: [...kept, point].slice(-MAX_POINTS) });
  }
  return store.key === key ? store.points : [];
}
