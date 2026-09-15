import type { ReactElement } from 'react';

/** 아이콘은 야구 요소(공·티켓·저울)와 조작(빨리 감기·끝까지·되돌리기·공유·다음)에만 쓴다 (UI_GUIDE 아이콘) */
export const ICON_NAMES = ['ball', 'ticket', 'scale', 'fast-forward', 'to-end', 'pa-end', 'restart', 'share', 'chevron-right'] as const;
export type IconName = (typeof ICON_NAMES)[number];

/** 24×24 좌표의 선 모양(시안 docs/design/nightgame 아이콘을 옮김) */
const SHAPES: Record<IconName, ReactElement> = {
  ball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M6.5 5.5c2.5 3 2.5 10 0 13M17.5 5.5c-2.5 3-2.5 10 0 13" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z" />
      <path d="M14 7v10" strokeDasharray="2 2" />
    </>
  ),
  scale: <path d="M12 3v18M5 7h14M5 7l-3 6h6zM19 7l-3 6h6z" />,
  'fast-forward': <path d="M4 5l8 7-8 7zM13 5l8 7-8 7z" />,
  'to-end': <path d="M3 5l7 7-7 7zM12 5l7 7-7 7zM21 5v14" />,
  'pa-end': <path d="M5 5l8 7-8 7zM16 5v14" />,
  restart: (
    <>
      <path d="M4 12a8 8 0 1 0 8-8H7" />
      <path d="M8 1L5 4l3 3" />
    </>
  ),
  share: <path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />,
  'chevron-right': <path d="M9 5l7 7-7 7" />,
};

export interface IconProps {
  name: IconName;
  /** 폭·높이(px). 기본 24 */
  size?: number;
  /** 선 굵기(UI_GUIDE 1.5~2.2). 기본 2 */
  strokeWidth?: number;
  className?: string;
}

/** 인라인 SVG 선 아이콘(currentColor). 이름은 버튼·링크 라벨이 읽어 주므로 스크린리더에서 숨긴다 */
export function Icon({ name, size = 24, strokeWidth = 2, className }: IconProps) {
  return (
    <svg
      className={className}
      data-icon={name}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {SHAPES[name]}
    </svg>
  );
}
