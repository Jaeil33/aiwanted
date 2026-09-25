import { useEffect, useMemo, useRef } from 'react';
import { encodeShare, gameRowsOf, pitcherPlanOf, situationFromPa, type SharePayload, type SituationExtra } from '../../game';
import type { LiveGame } from '../../types/live';
import { useGame } from '../GameProvider';
import { situationIdOf } from '../router';
import { useLiveGame } from '../useLiveData';
import { LiveStatus } from './LiveStatus';
import { PlayScreen } from './PlayScreen';

/*
 * 지난 경기의 한 타석을 열어 플레이 화면으로 넘긴다(ADR-032). 경기 하나를 받아
 * 그 타석을 `Situation`으로 바꾸고, 중계에서만 아는 값(이름·손·실제 투수 차례·그 경기 투구 표본)을 함께 넘긴다.
 */

/** 중계에서만 아는 값들. 번들 데이터(core)에 없는 선수와 실제 투수 차례가 여기서 온다 */
export function extraOf(game: LiveGame): SituationExtra {
  const { away, home } = game.summary;
  return {
    names: game.names,
    hands: game.hands,
    pitcherPlan: pitcherPlanOf(game),
    gameRows: gameRowsOf(game),
    actualFinal: away.score === null || home.score === null ? null : { away: away.score, home: home.score },
  };
}

export function PaScreen({ gameId, no, share }: { gameId: string; no: number; share: SharePayload | null }) {
  const { platform, session, actions } = useGame();
  const { data: game, error, loading, refresh } = useLiveGame(platform.liveApi, gameId);
  const situationId = situationIdOf(gameId, no);
  // 공유 값은 파싱할 때마다 새 객체다: 글자로 견줘 같은 타석을 다시 열지 않는다
  const shareKey = useMemo(() => (share === null ? '' : encodeShare(share)), [share]);
  const opened = useRef<string | null>(null);

  const missing = game !== null && game.plateAppearances.every((pa) => pa.no !== no);

  useEffect(() => {
    if (game === null || missing) return;
    const key = `${situationId}|${shareKey}`;
    if (opened.current === key) return;
    const situation = situationFromPa(game, no, 'past');
    if (situation === null) return;
    opened.current = key;
    void actions.openSituation(situation, extraOf(game), share);
    // share는 shareKey로 견준다(매번 새 객체다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, missing, no, situationId, shareKey, actions]);

  if (session.situation !== null && session.situation.id === situationId) return <PlayScreen />;

  return (
    <LiveStatus
      loading={loading || (game !== null && !missing)}
      error={error}
      empty={
        platform.liveApi === null
          ? '이 화면에서는 경기를 불러올 수 없어요.'
          : missing
            ? '그 타석이 없는 경기예요.'
            : undefined
      }
      onRetry={refresh}
    />
  );
}
