import { useId, useState, type FormEvent } from 'react';
import styles from './TmiComposer.module.css';

export interface TmiComposerProps {
  examples: string[];
  disabled: boolean;
  /** 첫 공을 던진 뒤라 TMI를 바꿀 수 없다 */
  locked: boolean;
  /** 해석 중 */
  busy: boolean;
  count: number;
  max: number;
  /** 한 줄 알림 (대체 경로 안내 등) */
  notice: string;
  onSubmit(text: string): void;
}

/** TMI 입력 최대 글자 수 (UTF-16 단위, 공유 링크 한도와 같다) */
const MAX_LENGTH = 80;

/** TMI 한 줄 입력: 예시 칩, 글자 수, "TMI 걸기" 버튼, 잠금 안내, 알림 줄 */
export function TmiComposer({ examples, disabled, locked, busy, count, max, notice, onSubmit }: TmiComposerProps) {
  const inputId = useId();
  const [text, setText] = useState('');
  const full = count >= max;
  const inputLocked = disabled || locked;
  const canSubmit = !inputLocked && !busy && !full && text.trim() !== '';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit(text.trim());
    setText('');
  };

  return (
    <form className={styles.composer} onSubmit={submit} aria-busy={busy}>
      <div className={styles.head}>
        <label htmlFor={inputId} className={styles.label}>
          TMI 한 줄
        </label>
        <span className={styles.counter}>{`${count}/${max}`}</span>
      </div>
      <input
        id={inputId}
        className={styles.input}
        type="text"
        value={text}
        maxLength={MAX_LENGTH}
        placeholder="예: 투수가 어젯밤 3시간밖에 못 잤다"
        autoComplete="off"
        enterKeyHint="send"
        disabled={inputLocked}
        onChange={(event) => setText(event.target.value)}
      />
      <span className={styles.length}>{`${MAX_LENGTH}자 중 ${text.length}자`}</span>
      {examples.length > 0 && (
        <ul className={styles.examples} aria-label="예시 TMI">
          {examples.map((example) => (
            <li key={example}>
              <button type="button" className={styles.example} disabled={inputLocked} onClick={() => setText(example.slice(0, MAX_LENGTH))}>
                {example}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.submit} disabled={!canSubmit}>
          TMI 걸기
        </button>
        {busy && <span className={styles.busy}>해석 중…</span>}
      </div>
      {locked && <p className={styles.hint}>처음부터 다시 하면 TMI를 바꿀 수 있어요.</p>}
      {!locked && full && <p className={styles.hint}>{`TMI는 ${max}개까지 걸 수 있어요.`}</p>}
      <p className={styles.notice} aria-live="polite">
        {notice}
      </p>
    </form>
  );
}
