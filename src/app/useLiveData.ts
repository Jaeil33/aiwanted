import { useCallback, useEffect, useState } from 'react';
import { LiveError, type DateRange, type LiveApi, type LiveErrorCode } from '../live/providers/http';
import type { GameSummary, LiveGame } from '../types/live';

/*
 * 경기 목록·경기 하나를 한 번 받는다. 폴링하지 않는다(ADR-032: 이번 범위는 지난 경기 탐색이다).
 * 다시 받는 일은 화면이 refresh()로 시킨다. 키가 바뀌거나 화면을 떠나면 AbortController로 끊는다.
 */

export interface Loaded<T> {
  data: T | null;
  error: LiveErrorCode | null;
  loading: boolean;
  refresh(): void;
}

interface Slot<T> {
  key: string | null;
  /** refresh() 세대. 다시 받는 동안 다시 기다리는 표시가 뜬다 */
  nonce: number;
  data: T | null;
  error: LiveErrorCode | null;
}

const IDLE: Slot<never> = { key: null, nonce: -1, data: null, error: null };

/**
 * key가 null이면 부르지 않는다. key가 바뀌면 앞 요청을 끊고 새로 부른다.
 * load는 key와 같은 값에 의존하는 안정된 함수여야 한다(useCallback).
 *
 * 기다리는 중인지는 상태로 두지 않고 렌더에서 셈한다: 효과 안에서 곧바로 setState를 부르면
 * 렌더가 연달아 돌고(react-hooks/set-state-in-effect), 키가 바뀐 첫 렌더에 앞 경기가 잠깐 보인다.
 */
function useLiveResource<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>): Loaded<T> {
  const [slot, setSlot] = useState<Slot<T>>(IDLE as Slot<T>);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    let alive = true;
    load(controller.signal).then(
      (data) => {
        if (alive) setSlot({ key, nonce, data, error: null });
      },
      (error: unknown) => {
        if (!alive) return;
        const code: LiveErrorCode = error instanceof LiveError ? error.code : 'network';
        // 우리가 끊은 요청은 화면에 오류로 남기지 않는다
        if (code === 'cancelled') return;
        setSlot({ key, nonce, data: null, error: code });
      },
    );
    return () => {
      alive = false;
      controller.abort();
    };
  }, [key, nonce, load]);

  const refresh = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);

  // 이번 키·세대의 답이 아직 없으면 기다리는 중이다(앞 키의 값을 내보내지 않는다)
  const fresh = slot.key === key && slot.nonce === nonce;
  return {
    data: fresh ? slot.data : null,
    error: fresh ? slot.error : null,
    loading: key !== null && !fresh,
    refresh,
  };
}

const rejectIdle = () => Promise.reject(new LiveError('cancelled', '아직 부를 수 없어요.'));

/** 기간 안의 경기 목록. api나 range가 null이면 부르지 않는다 */
export function useGames(api: LiveApi | null, range: DateRange | null): Loaded<GameSummary[]> {
  const from = range?.from ?? null;
  const to = range?.to ?? null;
  const load = useCallback(
    (signal: AbortSignal) => (api !== null && from !== null && to !== null ? api.games({ from, to }, signal) : rejectIdle()),
    [api, from, to],
  );
  return useLiveResource(api !== null && from !== null && to !== null ? `games:${from}:${to}` : null, load);
}

/** 경기 하나의 타석 전체. api나 gameId가 null이면 부르지 않는다 */
export function useLiveGame(api: LiveApi | null, gameId: string | null): Loaded<LiveGame> {
  const load = useCallback(
    (signal: AbortSignal) => (api !== null && gameId !== null ? api.game(gameId, signal) : rejectIdle()),
    [api, gameId],
  );
  return useLiveResource(api !== null && gameId !== null ? `game:${gameId}` : null, load);
}
