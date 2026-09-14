import type { EntryChip } from '../game';
import type { TmiEntry, VerdictResult } from '../types/domain';
import styles from './InterpretationCard.module.css';

export interface InterpretationCardProps {
  entry: TmiEntry;
  /** entryChips(entry) 결과 */
  chips: EntryChip[];
  verdict: VerdictResult | null;
  judging: boolean;
  canRemove: boolean;
  canJudge: boolean;
  onRemove(): void;
  onJudge(): void;
}

const VERDICT_LABEL: Record<VerdictResult['verdict'], string> = {
  real: '진짜 효과',
  maybe: '애매해요',
  useless: '쓸모없음',
  unmeasurable: '잴 수 없음',
};

/** 해석 카드: 인용 문장·출처(AI/규칙)·해설·효과 칩, "진짜야?" 판정과 결과, 빼기 */
export function InterpretationCard({ entry, chips, verdict, judging, canRemove, canJudge, onRemove, onJudge }: InterpretationCardProps) {
  const { interpretation } = entry;
  return (
    <article className={styles.card} aria-label={`TMI ${entry.text}`}>
      <div className={styles.top}>
        <p className={styles.quote}>{entry.text}</p>
        {canRemove && (
          <button type="button" className={styles.remove} onClick={onRemove} aria-label={`“${entry.text}” 빼기`}>
            빼기
          </button>
        )}
      </div>
      <p className={styles.source} data-source={interpretation.source}>
        {interpretation.source === 'ai' ? 'AI 해석' : '규칙 해석'}
      </p>
      {interpretation.refused
        ? interpretation.reason && <p className={styles.reason}>{interpretation.reason}</p>
        : interpretation.comment && <p className={styles.comment}>{interpretation.comment}</p>}
      {chips.length > 0 && (
        <ul className={styles.chips} aria-label="해석 결과">
          {chips.map((chip, index) => (
            <li key={`${index}-${chip.label}`} className={styles.chip} data-tone={chip.tone}>
              {chip.label}
            </li>
          ))}
        </ul>
      )}
      {canJudge && (
        <button type="button" className={styles.judge} onClick={onJudge} disabled={judging} aria-busy={judging}>
          {judging ? '기록을 뒤지는 중…' : '진짜야?'}
        </button>
      )}
      {verdict && (
        <div className={styles.verdict}>
          <span className={styles.verdictChip} data-verdict={verdict.verdict}>
            {VERDICT_LABEL[verdict.verdict]}
          </span>
          <p className={styles.headline}>{verdict.headline}</p>
          <p className={styles.body}>{verdict.body}</p>
          <p className={styles.verdictSource}>{verdict.source === 'ai' ? 'AI 판정' : '기록표 판정'}</p>
        </div>
      )}
    </article>
  );
}
