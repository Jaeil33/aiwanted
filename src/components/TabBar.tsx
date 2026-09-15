import { Icon, type IconName } from './Icon';
import styles from './TabBar.module.css';

export type TabBarTab = 'lobby' | 'evidence' | 'about';

const TABS: ReadonlyArray<{ id: TabBarTab; label: string; href: string; icon: IconName }> = [
  { id: 'lobby', label: '명장면', href: '#/', icon: 'ticket' },
  { id: 'evidence', label: '판정소', href: '#/evidence', icon: 'scale' },
  { id: 'about', label: '만든 이유', href: '#/about', icon: 'ball' },
];

export interface TabBarProps {
  /** 지금 탭. null이면 아무 탭도 표시하지 않는다 */
  current: TabBarTab | null;
}

/** 로비·판정소·만든 이유의 하단 탭바(68px, 화면 아래에 붙는다). 지금 탭은 aria-current="page"와 --chalk */
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
