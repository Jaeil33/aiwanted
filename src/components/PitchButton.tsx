import { Icon } from './Icon';
import styles from './PitchButton.module.css';

export interface PitchButtonProps {
  /** pitch: 한 구 던지기 · skip: 재생 중 남은 연출 없이 결과 반영(ADR-015) */
  mode: 'pitch' | 'skip';
  onClick: () => void;
  disabled?: boolean;
}

const LOOK = {
  pitch: { label: '던지기', icon: 'ball', stroke: 1.8 },
  skip: { label: '건너뛰기', icon: 'fast-forward', stroke: 2 },
} as const;

/** 하단 도크 가운데 80px 원형 버튼: 아이콘 + 라벨. 접근 이름은 라벨이다 */
export function PitchButton({ mode, onClick, disabled = false }: PitchButtonProps) {
  const { label, icon, stroke } = LOOK[mode];
  return (
    <button type="button" className={styles.button} data-mode={mode} onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={26} strokeWidth={stroke} />
      <span className={styles.label}>{label}</span>
    </button>
  );
}
