import { Icon, type IconName } from './Icon';
import styles from './TabBar.module.css';

export type TabBarTab = 'lobby' | 'about';

const TABS: ReadonlyArray<{ id: TabBarTab; label: string; href: string; icon: IconName }> = [
  { id: 'lobby', label: '경기', href: '#/', icon: 'ball' },
  { id: 'about', label: '만든 이유', href: '#/about', icon: 'scale' },
];

export interface TabBarProps {
  /** 지금 탭. null이면 아무 탭도 표시하지 않는다 */
  current: TabBarTab | null;
}

/** 로비·만든 이유의 하단 탭바(ADR-020: 경기·만든 이유 두 개). 지금 탭은 aria-current="page" */
export function TabBar({ current }: TabBarProps) {
  return (
    <nav className={styles.bar} aria-label="주 메뉴">
      {TABS.map((tab) => (
        <a key={tab.id} className={styles.link} href={tab.href} aria-current={tab.id === current ? 'page' : undefined}>
          <Icon name={tab.icon} size={22} strokeWidth={1.5} />
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
