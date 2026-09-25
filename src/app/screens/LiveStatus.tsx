import controls from '../../components/controls.module.css';
import type { LiveErrorCode } from '../../live/providers/http';
import styles from './LiveStatus.module.css';

/*
 * 경기 데이터를 기다리거나 못 받았을 때의 한 판. 시즌 탐색 화면 셋이 함께 쓴다(ADR-032).
 * 네이버가 막히면 탐색 전체가 멈추므로(ADR-032 트레이드오프) 왜 비었는지 말하고 다시 받을 길을 준다.
 */

const MESSAGE: Record<LiveErrorCode, string> = {
  network: '경기 서버에 연결하지 못했어요.',
  timeout: '경기 정보가 제때 오지 않았어요.',
  cancelled: '요청이 취소됐어요.',
  rate: '요청이 너무 잦아요. 잠깐 뒤에 다시 받아 주세요.',
  notFound: '그 경기를 찾지 못했어요.',
  upstream: '경기 기록을 가져오지 못했어요.',
  shape: '경기 기록 모양이 예상과 달라요.',
};

export interface LiveStatusProps {
  loading: boolean;
  error: LiveErrorCode | null;
  /** 받아 왔는데 보여 줄 게 없을 때의 한 줄 */
  empty?: string;
  onRetry?(): void;
}

/** 기다리는 중·오류·빈 목록 가운데 하나를 그린다. 보여 줄 게 있으면 null */
export function LiveStatus({ loading, error, empty, onRetry }: LiveStatusProps) {
  if (loading) {
    return (
      <p className={styles.status} aria-live="polite">
        불러오는 중…
      </p>
    );
  }
  if (error !== null) {
    return (
      <div className={styles.status} role="alert">
        <p>{MESSAGE[error]}</p>
        {onRetry && (
          <button type="button" className={controls.secondary} onClick={onRetry}>
            다시 받기
          </button>
        )}
      </div>
    );
  }
  return empty === undefined ? null : (
    <p className={styles.status} aria-live="polite">
      {empty}
    </p>
  );
}
