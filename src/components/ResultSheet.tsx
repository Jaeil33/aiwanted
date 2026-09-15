import { useId } from 'react';
import { EV, EVENT_LABEL } from '../domain/events';
import { formatPct } from '../domain/format';
import { TOON_FACTOR } from '../engine';
import type { OddsHeadline } from '../game/headline';
import controls from './controls.module.css';
import { winLineText, type WinLineValue } from './OddsPanel';
import styles from './ResultSheet.module.css';
import { Sheet } from './Sheet';
import { ThousandDots } from './ThousandDots';

export interface ResultSheetProps {
  open: boolean;
  onClose(): void;
  /** 쳐본 타석 결과 한 줄("삼진", "2타점 적시타") */
  playedHeadline: string;
  /** "실제: …". 직접 만든 상황이면 null */
  actualText: string | null;
  headline: OddsHeadline;
  /** thousandSplit 결과 (사건 순서 7개) */
  counts: { tmi: number[]; base: number[] };
  hasTmi: boolean;
  win: WinLineValue | null;
  /** 만화 모드로 평가한 같은 큰 숫자(0~1). 없으면 줄을 숨긴다 */
  toon: number | null;
  onReplay(): void;
  onShare(): void;
  shareNote: string;
}

/** 결과 카드(UI_GUIDE): 쳐본 결과 → 1,000타석 점과 범례 → 승리확률·만화 모드 한 줄 → 다시·공유 */
export function ResultSheet(p: ResultSheetProps) {
  const titleId = useId();
  const title = p.playedHeadline.endsWith('!') ? p.playedHeadline : `${p.playedHeadline}!`;
  const { event } = p.headline;
  const eventName = event === null ? '출루' : EVENT_LABEL[event];
  const pick = (c: number[]) => (event === null ? 1000 - (c[EV.K] ?? 0) - (c[EV.OUT] ?? 0) : (c[event] ?? 0));
  const legend = p.hasTmi
    ? `1,000번 치면 ${eventName} ${pick(p.counts.tmi)}번 · TMI 없이 ${pick(p.counts.base)}번`
    : `1,000번 치면 ${eventName} ${pick(p.counts.base)}번`;

  return (
    <Sheet open={p.open} onClose={p.onClose} labelledBy={titleId} dimStage>
      <div className={styles.head}>
        <p className={styles.eyebrow}>한 타석 쳐본 결과</p>
        <button type="button" className={`${controls.icon} ${styles.close}`} onClick={p.onClose} aria-label="닫기">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className={styles.titleRow}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {p.actualText && <span className={styles.actual}>{p.actualText}</span>}
      </div>
      <section className={styles.card} aria-label="1,000타석">
        <ThousandDots counts={p.hasTmi ? p.counts.tmi : p.counts.base} highlight={event} />
        <p className={styles.legend}>{legend}</p>
      </section>
      <ul className={styles.lines}>
        {p.win && <li className={styles.line}>{winLineText(p.win, p.hasTmi)}</li>}
        {p.hasTmi && p.toon !== null && (
          <li className={styles.line}>
            <span className={styles.toonChip} data-mode="toon">
              만화 모드
            </span>
            <span>{`만화 모드(효과 ${TOON_FACTOR}배)였다면 ${formatPct(p.toon)}`}</span>
          </li>
        )}
      </ul>
      <div className={styles.dock}>
        <button type="button" className={controls.primary} onClick={p.onReplay}>
          같은 TMI로 다시
        </button>
        <button type="button" className={controls.secondary} onClick={p.onShare}>
          결과 카드 공유
        </button>
      </div>
      {p.shareNote && (
        <p className={styles.note} aria-live="polite">
          {p.shareNote}
        </p>
      )}
      <p className={styles.sources}>기록·중계: 네이버 스포츠(KBO) · 날씨: Open-Meteo · 확률: TMI 야구 엔진 계산값</p>
    </Sheet>
  );
}
