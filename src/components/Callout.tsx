import { useEffect, useState } from 'react';
import { useReducedMotion } from '../stage/useReducedMotion';
import styles from './Callout.module.css';

export type CalloutTone = 'ball' | 'strike' | 'out' | 'hit' | 'big';

/** 콜 한 번이 보이는 시간(UI_GUIDE 움직임: 1,150ms) */
export const CALLOUT_MS = 1150;

export interface CalloutProps {
  /** 콜 글자(예: "볼", "삼진", "끝내기!"). 비면 아무것도 보이지 않는다 */
  text: string;
  /** ball --ball · strike --strike · out --out · hit·big --flood(big은 64px) */
  tone: CalloutTone;
  /** 바뀔 때마다 한 번 재생한다. 마운트 때 값이나 같은 값으로 다시 그리면 재생하지 않는다 */
  playKey: number;
}

/**
 * 볼·스트라이크·결과 콜(DOM, ADR-012). 위치가 정해진(position이 있는) 부모를 가득 채우고 한가운데에 그린다.
 * scale 1.5→1·skewX(−10deg)로 박힌 뒤 위로 사라지고, 동작 줄이기면 애니메이션 없이 1,150ms 동안 보인다.
 */
export function Callout({ text, tone, playKey }: CalloutProps) {
  const reduced = useReducedMotion();
  const [seenKey, setSeenKey] = useState(playKey);
  const [armed, setArmed] = useState(false);
  if (playKey !== seenKey) {
    setSeenKey(playKey);
    setArmed(true);
  }

  return (
    <div className={styles.callout} aria-live="polite" aria-atomic="true">
      {armed && text !== '' ? <CallText key={playKey} text={text} tone={tone} reduced={reduced} /> : null}
    </div>
  );
}

/** playKey마다 새로 마운트되는 콜 글자: CALLOUT_MS 뒤 스스로 내린다 */
function CallText({ text, tone, reduced }: { text: string; tone: CalloutTone; reduced: boolean }) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDone(true), CALLOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  if (done) return null;
  const classes = [styles.text, reduced ? styles.still : styles.play, tone === 'big' ? styles.big : null].filter(Boolean).join(' ');
  return (
    <span className={classes} data-tone={tone}>
      {text}
    </span>
  );
}
