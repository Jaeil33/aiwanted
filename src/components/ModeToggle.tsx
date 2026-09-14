import { useId } from 'react';
import { MODE_LABEL } from '../domain/format';
import type { Mode } from '../types/domain';
import styles from './ModeToggle.module.css';

export interface ModeToggleProps {
  mode: Mode;
  disabled: boolean;
  onChange(mode: Mode): void;
}

const OPTIONS: ReadonlyArray<{ mode: Mode; description: string }> = [
  { mode: 'real', description: '추정·설정 크기 그대로 계산해요' },
  { mode: 'toon', description: '효과를 6배로 과장해요. 재미용이에요' },
];

/** 현실/만화 모드 라디오 그룹과 지금 모드 설명 */
export function ModeToggle({ mode, disabled, onChange }: ModeToggleProps) {
  const name = useId();
  const descriptionId = `${name}-description`;
  const current = OPTIONS.find((option) => option.mode === mode) ?? OPTIONS[0];

  return (
    <div className={styles.toggle}>
      <div role="radiogroup" aria-label="계산 모드" aria-describedby={descriptionId} className={styles.options}>
        {OPTIONS.map((option) => {
          const checked = option.mode === mode;
          return (
            <label key={option.mode} className={styles.option} data-mode={option.mode} data-checked={checked ? 'true' : 'false'}>
              <input
                type="radio"
                className={styles.radio}
                name={name}
                value={option.mode}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(option.mode)}
              />
              <span>{MODE_LABEL[option.mode]}</span>
            </label>
          );
        })}
      </div>
      <p id={descriptionId} className={styles.description}>
        {current.description}
      </p>
    </div>
  );
}
