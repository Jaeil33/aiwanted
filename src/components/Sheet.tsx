import { useEffect, useEffectEvent, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Sheet.module.css';

export interface SheetProps {
  open: boolean;
  /** Escape·바탕 누르기 */
  onClose: () => void;
  /** 시트 제목 요소의 id (aria-labelledby) */
  labelledBy: string;
  children: ReactNode;
  /** 뒤 경기장을 55% 어둡게 덮는다 */
  dimStage?: boolean;
  /** 시트 판 위, 덮인 경기장 위에 함께 두는 내용(예: TMI 시트의 작은 승률 판 "전 → 후") */
  above?: ReactNode;
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const focusablesIn = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];

/**
 * 아래에서 올라오는 시트(모달 대화상자). 열리면 첫 포커스 가능한 요소로 포커스를 옮기고 Tab을 안에 가두며,
 * 닫히면 열기 전 포커스로 돌려준다. 열린 동안 뒤 페이지 스크롤을 잠근다.
 */
export function Sheet({ open, onClose, labelledBy, children, dimStage = false, above }: SheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const requestClose = useEffectEvent(() => onClose());

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (focusablesIn(dialog)[0] ?? dialog).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusablesIn(dialog);
      const active = document.activeElement;
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const outside = !dialog.contains(active);
      if (event.shiftKey && (active === first || active === dialog || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = bodyOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className={styles.root}>
      <div
        className={[styles.backdrop, dimStage ? styles.dim : null].filter(Boolean).join(' ')}
        data-sheet-backdrop=""
        aria-hidden="true"
        onClick={onClose}
      />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} className={styles.dialog}>
        {above ? <div className={styles.above}>{above}</div> : null}
        <div className={styles.panel}>
          <span className={styles.grabber} aria-hidden="true" />
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
