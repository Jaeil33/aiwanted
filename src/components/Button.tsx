import type { ReactNode } from 'react';
import styles from './Button.module.css';

export interface ButtonProps {
  /** primary: --flood 바탕(한 화면에 하나) · secondary: --plate 판 · text: 글자만 */
  variant: 'primary' | 'secondary' | 'text';
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  'aria-label'?: string;
  /** md 48px(기본) · lg 56px(로비 "경기 입장", 결과 도크) */
  size?: 'md' | 'lg';
  /** 배치용 클래스(그리드 자리·폭). 색·글꼴은 variant로만 바꾼다 */
  className?: string;
}

/** 표시·조작 전용 버튼. 비활성은 disabled 속성과 opacity 0.45 */
export function Button({ variant, children, onClick, disabled = false, type = 'button', 'aria-label': ariaLabel, size = 'md', className }: ButtonProps) {
  const classes = [styles.button, styles[variant], size === 'lg' ? styles.lg : null, className].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  );
}
