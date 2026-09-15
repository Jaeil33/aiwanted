import { useId, useState, type FormEvent } from 'react';
import { formatDeltaPp, formatPct } from '../domain/format';
import type { OddsHeadline } from '../game/headline';
import type { TmiEntry, VerdictResult } from '../types/domain';
import controls from './controls.module.css';
import { trendOf } from './OddsPanel';
import { Sheet } from './Sheet';
import { TmiCard } from './TmiCard';
import styles from './TmiSheet.module.css';

export interface TmiSheetProps {
  open: boolean;
  onClose(): void;
  headline: OddsHeadline | null;
  hasTmi: boolean;
  tmis: TmiEntry[];
  verdicts: Record<string, VerdictResult>;
  judgingId: string | null;
  /** TMI를 바꿀 수 있다(쳐보기 전) */
  canEdit: boolean;
  /** 해석 중 */
  busy: boolean;
  max: number;
  notice: string;
  examples: string[];
  onSubmit(text: string): void;
  onRemove(id: string): void;
  onJudge(id: string): void;
}

/** TMI 입력 최대 글자 수(UTF-16 단위, 공유 링크 한도와 같다) */
const MAX_LENGTH = 80;

/** TMI 시트: 작은 확률 판(전 → 후) · 걸린 TMI 카드 · 입력 줄(거부·실패 때 지우지 않는다) · 예시 칩 */
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
      ? '쳐본 뒤에는 TMI를 바꿀 수 없어요. "같은 TMI로 다시"를 누르면 처음부터 할 수 있어요.'
      : full
        ? `TMI는 ${p.max}개까지 걸 수 있어요.`
        : '';

  const mini = p.headline ? (
    <div className={styles.mini}>
      <span className={styles.miniLabel}>{p.headline.label}</span>
      <b className={styles.miniValue}>{p.hasTmi ? `${formatPct(p.headline.base)} → ${formatPct(p.headline.tmi)}` : formatPct(p.headline.base)}</b>
      {p.hasTmi && (
        <span className={styles.miniDelta} data-trend={trendOf(p.headline.tmi - p.headline.base)}>
          {formatDeltaPp(p.headline.tmi - p.headline.base)}
        </span>
      )}
    </div>
  ) : (
    <div className={styles.mini}>
      <span className={styles.miniLabel}>계산 중…</span>
    </div>
  );

  return (
    <Sheet open={p.open} onClose={p.onClose} labelledBy={titleId} dimStage above={mini}>
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          TMI 걸기
        </h2>
        <span className={styles.count}>{`${count}/${p.max}`}</span>
        <button type="button" className={`${controls.icon} ${styles.close}`} onClick={p.onClose} aria-label="닫기">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {count > 0 && (
        <ul className={styles.cards}>
          {p.tmis.map((entry) => (
            <li key={entry.id}>
              <TmiCard
                entry={entry}
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
      <div className={styles.meta}>
        <span className={styles.status} aria-live="polite">
          {status}
        </span>
        <span className={styles.length}>{`${text.length}/${MAX_LENGTH}`}</span>
      </div>
      {p.notice && (
        <p className={styles.notice} aria-live="polite">
          {p.notice}
        </p>
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
