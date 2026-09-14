import type { KeyboardEvent } from 'react';
import styles from './Tabs.module.css';

export interface TabsProps<T extends string> {
  /** tablist 접근 이름 */
  label: string;
  items: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}

/** --plate 판 안의 탭(예: 타석·이닝·경기). 좌우 화살표·Home·End로 선택을 옮기고 포커스가 따라간다 */
export function Tabs<T extends string>({ label, items, value, onChange }: TabsProps<T>) {
  const selectedIndex = items.findIndex((item) => item.id === value);
  const tabbable = selectedIndex === -1 ? 0 : selectedIndex;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const focused = tabs.findIndex((tab) => tab === event.target);
    const from = focused === -1 ? tabbable : focused;
    const last = tabs.length - 1;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = from >= last ? 0 : from + 1;
        break;
      case 'ArrowLeft':
        next = from <= 0 ? last : from - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    const item = items[next];
    if (!item) return;
    if (item.id !== value) onChange(item.id);
    tabs[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className={styles.list} onKeyDown={onKeyDown}>
      {items.map((item, index) => {
        const selected = index === selectedIndex;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={index === tabbable ? 0 : -1}
            className={styles.tab}
            onClick={() => {
              if (!selected) onChange(item.id);
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
