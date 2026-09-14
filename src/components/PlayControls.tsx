import styles from './PlayControls.module.css';

export interface PlayControlsProps {
  /** 공을 던질 수 있다 (장면이 열려 있고 이번 타석 확률이 준비됨) */
  canPitch: boolean;
  /** 경기 끝까지 다시 치를 수 있다 */
  canFinish: boolean;
  /** 연출·계산 중 */
  busy: boolean;
  finished: boolean;
  onPitch(): void;
  onFinishPa(): void;
  onFinishGame(): void;
  onReset(): void;
}

/** 다시 치르기 조작: 휴대폰에서는 화면 아래 고정 바, 1024px 이상은 일반 흐름 */
export function PlayControls({ canPitch, canFinish, busy, finished, onPitch, onFinishPa, onFinishGame, onReset }: PlayControlsProps) {
  const pitchOff = !canPitch || busy || finished;
  const gameOff = !canFinish || busy || finished;
  return (
    <div className={styles.bar} role="group" aria-label="다시 치르기 조작" aria-busy={busy}>
      <button type="button" className={styles.primary} onClick={onPitch} disabled={pitchOff}>
        한 구 던지기
      </button>
      <button type="button" className={styles.secondary} onClick={onFinishPa} disabled={pitchOff}>
        이 타석 끝까지
      </button>
      <button type="button" className={styles.secondary} onClick={onFinishGame} disabled={gameOff}>
        경기 끝까지
      </button>
      <button type="button" className={styles.text} onClick={onReset} disabled={busy}>
        처음부터
      </button>
    </div>
  );
}
