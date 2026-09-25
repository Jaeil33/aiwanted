import type { ReactNode } from 'react';
import styles from './TabBar.module.css';

export type TabBarTab = 'lobby' | 'evidence' | 'about';

/** 중계 시안 탭 아이콘(선 1.7px, 채움 없음) */
const TABS: ReadonlyArray<{ id: TabBarTab; label: string; href: string; icon: ReactNode }> = [
  {
    id: 'lobby',
    label: '경기',
    href: '#/',
    icon: (
      <>
        <path d="M4 6h16v12H4z" />
        <path d="M4 10h16" />
      </>
    ),
  },
  {
    id: 'evidence',
    label: '판정소',
    href: '#/evidence',
    icon: <path d="M12 4v16M6 8h12M6 8l-3 6h6zM18 8l-3 6h6z" />,
  },
  {
    id: 'about',
    label: '만든 이유',
    href: '#/about',
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </>
    ),
  },
];

export interface TabBarProps {
  /** 지금 탭. null이면 아무 탭도 표시하지 않는다 */
  current: TabBarTab | null;
}

/** 탐색 화면의 하단 탭바(경기·판정소·만든 이유). 지금 탭은 aria-current="page" */
export function TabBar({ current }: TabBarProps) {
  return (
    <nav className={styles.bar} aria-label="주 메뉴">
      {TABS.map((tab) => (
        <a key={tab.id} className={styles.link} href={tab.href} aria-current={tab.id === current ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {tab.icon}
          </svg>
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
