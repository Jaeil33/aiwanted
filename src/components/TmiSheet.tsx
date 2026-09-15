import { useId, useState, type FormEvent } from 'react';
import { formatPct } from '../domain/format';
import { deltaText } from '../game/broadcast';
import type { TmiEntry, VerdictResult } from '../types/domain';
import controls from './controls.module.css';
import { Sheet } from './Sheet';
import { TmiCard, type CardNames } from './TmiCard';
import styles from './TmiSheet.module.css';
import { trendOfText } from './WpPanel';

/** 시트 위 승률 한 줄: 지금 탭의 라벨과 TMI 없음 → 반영 값 */
export interface SheetOdds {
  label: string;
  base: number;
  value: number;
  hasTmi: boolean;
}

export interface TmiSheetProps {
  open: boolean;
  onClose(): void;
  /** null이면 계산 중 */
  odds: SheetOdds | null;
  tmis: TmiEntry[];
  verdicts: Record<string, VerdictResult>;
  judgingId: string | null;
  /** TMI를 바꿀 수 있다(첫 공을 던지기 전) */
  canEdit: boolean;
  /** 해석 중 */
  busy: boolean;
  max: number;
  notice: string;
  examples: string[];
  names?: CardNames;
  onSubmit(text: string): void;
  onRemove(id: string): void;
  onJudge(id: string): void;
}

/** TMI 입력 최대 글자 수(UTF-16 단위, 공유 링크 한도와 같다) */
const MAX_LENGTH = 80;

/** TMI 시트(시안 3번 화면): 승률 한 줄 → TMI 카드 → 입력 줄 → 예시 칩. 거부·실패 때 입력을 지우지 않는다 */
export function TmiSheet(p: TmiSheetProps) {
  const titleId = useId();
  const inputId = useId();
  const [text, setText] = useState('');
  const count = p.tmis.length;
  // TMI가 늘었을 때만 입력을 비운다(거부·실패면 그대로 둔다)
  const [seenCount, setSeenCount] = useState(count);
  if (count !== seenCount) {
    setSeenCount(count);
    if (count > seenCount) setText('');
  }
  const full = count >= p.max;
  const canSubmit = p.canEdit && !p.busy && !full && text.trim() !== '';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSubmit) p.onSubmit(text.trim());
  };

  const status = p.busy
    ? '해석 중…'
    : !p.canEdit
      ? '공을 던진 뒤에는 TMI를 바꿀 수 없어요. "처음부터"를 누르면 다시 걸 수 있어요.'
      : full
        ? `TMI는 ${p.max}개까지 걸 수 있어요.`
        : '';

  const { odds } = p;
  const delta = odds ? deltaText((odds.value - odds.base) * 100) : '';

  return (
    <Sheet open={p.open} onClose={p.onClose} labelledBy={titleId} dimStage>
      <h2 id={titleId} className={controls.srOnly}>
        TMI 걸기
      </h2>
      <button type="button" className={`${controls.icon} ${styles.close}`} onClick={p.onClose} aria-label="닫기">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <div className={styles.odds}>
        {odds ? (
          <>
            <span className={styles.oddsLabel}>{odds.label}</span>
            <b className={styles.oddsValue}>
              {odds.hasTmi ? (
                <>
                  {formatPct(odds.base)} <i>→</i> {formatPct(odds.value)}
                </>
              ) : (
                formatPct(odds.value)
              )}
            </b>
            {odds.hasTmi && (
              <span className={styles.delta} data-trend={trendOfText(delta)}>
                {delta}
              </span>
            )}
          </>
        ) : (
          <span className={styles.oddsLabel}>계산 중…</span>
        )}
      </div>
      {count > 0 && (
        <ul className={styles.cards}>
          {p.tmis.map((entry) => (
            <li key={entry.id}>
              <TmiCard
                entry={entry}
                names={p.names}
                verdict={Object.hasOwn(p.verdicts, entry.id) ? p.verdicts[entry.id] : null}
                judging={p.judgingId === entry.id}
                canRemove={p.canEdit}
                onRemove={() => p.onRemove(entry.id)}
                onJudge={() => p.onJudge(entry.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <form className={styles.composer} onSubmit={submit} aria-busy={p.busy}>
        <label htmlFor={inputId} className={controls.srOnly}>
          TMI 한 줄
        </label>
        <input
          id={inputId}
          className={styles.input}
          type="text"
          value={text}
          maxLength={MAX_LENGTH}
          placeholder="예: 투수가 어젯밤 3시간밖에 못 잤다"
          autoComplete="off"
          enterKeyHint="send"
          disabled={!p.canEdit}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className={`${controls.primary} ${styles.submit}`} disabled={!canSubmit}>
          걸기
        </button>
      </form>
      {(status || p.notice) && (
        <div className={styles.meta} aria-live="polite">
          {status && <p className={styles.status}>{status}</p>}
          {p.notice && <p className={styles.notice}>{p.notice}</p>}
        </div>
      )}
      {p.examples.length > 0 && (
        <div className={styles.examples} role="group" aria-label="예시 TMI">
          {p.examples.map((example) => (
            <button key={example} type="button" className={styles.example} disabled={!p.canEdit} onClick={() => setText(example.slice(0, MAX_LENGTH))}>
              {example}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
