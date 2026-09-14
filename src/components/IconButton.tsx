import type { ReactNode } from 'react';
import styles from './IconButton.module.css';

export interface IconButtonProps {
  /** 접근 이름(aria-label). 화면에는 아이콘만 보인다 */
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

/** 경기장 위에 겹치는 44px 아이콘 버튼(예: "처음부터") */
export function IconButton({ label, icon, onClick, disabled = false }: IconButtonProps) {
  return (
    <button type="button" className={styles.button} aria-label={label} onClick={onClick} disabled={disabled}>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}
