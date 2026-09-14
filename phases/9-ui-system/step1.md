# Step 1: controls

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/UI_GUIDE.md` (컴포넌트 규격, 움직임, 문구)
- `/docs/ADR.md` (ADR-011)
- `docs/design/nightgame/index.html`, `docs/design/nightgame/style.css` (도크·탭·칩·시트·탭바 모양 참고)
- `src/styles/tokens.css`, `src/styles/global.css` (step 0)
- 기존 컴포넌트 패턴: `src/components/PlayControls.tsx`, `src/components/ModeToggle.tsx`와 그 테스트, `src/test/setup.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

`src/components/`에 표시·조작 전용 컴포넌트를 만든다. 각 파일은 CSS 모듈과 테스트를 함께 두고, 색·반경·글꼴은 토큰만 쓴다.

```tsx
// Button.tsx
export function Button(props: {
  variant: 'primary' | 'secondary' | 'text';
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  'aria-label'?: string;
}): JSX.Element;

// IconButton.tsx — 44px, aria-label 필수
export function IconButton(props: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }): JSX.Element;

// PitchButton.tsx — 80px 원형, 공 아이콘 + 라벨. mode가 'skip'이면 라벨 "건너뛰기"와 빨리 감기 아이콘
export function PitchButton(props: { mode: 'pitch' | 'skip'; onClick: () => void; disabled?: boolean }): JSX.Element;

// Chip.tsx
export function Chip(props: {
  kind: 'mode' | 'grade' | 'delta' | 'toon' | 'plain';
  grade?: Evidence | 'refused';     // kind 'grade'일 때 금속색(refused는 --out)
  tone?: 'up' | 'down' | 'flat';     // kind 'delta'일 때
  children: ReactNode;
}): JSX.Element;

// Tabs.tsx — role="tablist", 좌우 화살표로 이동, 선택은 aria-selected
export function Tabs<T extends string>(props: { label: string; items: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void }): JSX.Element;

// TabBar.tsx — 하단 탭바 68px: 명장면(#/) · 판정소(#/evidence) · 만든 이유(#/about)
export function TabBar(props: { current: 'lobby' | 'evidence' | 'about' | null }): JSX.Element;

// Sheet.tsx — 아래에서 올라오는 시트
export function Sheet(props: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode; dimStage?: boolean }): JSX.Element | null;
```

동작 규칙:
- **Button**: 비활성은 `disabled` 속성과 opacity 0.45. 높이 48px 이상. primary는 `--flood` 바탕.
- **PitchButton**: 누르는 동안 scale 0.96. `disabled`면 누를 수 없다. 접근 이름은 라벨이다.
- **Chip**:
  - kind 'toon'은 `--toon` 점선 테두리다.
  - kind 'delta'는 tone 색 글자에 같은 색 10% 바탕이다.
- **Tabs**: 화살표 키로 선택이 바뀌고 onChange가 불린다. 탭 버튼 높이는 32px이고 판 안쪽 여백은 2px이다.
- **TabBar**:
  - 인라인 SVG 아이콘 3개(티켓, 저울, 공)와 라벨을 둔다.
  - 현재 탭은 `aria-current="page"`에 `--chalk`, 나머지는 `--dim`이다.
  - `position: sticky; bottom: 0`.
- **Sheet**:
  - `open`이면 `role="dialog"`, `aria-modal="true"`, `aria-labelledby`를 단다.
  - 열릴 때 첫 포커스 가능한 요소로 포커스를 옮기고, 닫히면 열기 전 포커스로 돌려준다.
  - Escape와 바탕 클릭은 `onClose`를 부른다.
  - 위쪽 모서리 16px, 280ms translateY 등장. 동작 줄이기면 등장 효과가 없다.
  - `dimStage`면 바탕을 55% 어둡게 한다.

### 테스트
- 컴포넌트마다 역할·접근 이름·비활성·클릭 콜백을 확인한다.
- Tabs 키보드, Sheet 포커스 이동·복귀·Escape·바탕 클릭, TabBar aria-current를 확인한다.
- CSS 모듈 클래스 존재만 확인하고 픽셀 값은 확인하지 않는다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/components
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - 컴포넌트가 표시·조작만 하고 게임 규칙·확률 계산을 하지 않는가?
   - 금지 목록(blur, 글로우 애니메이션, 스피너)을 지켰는가?
   - 모든 버튼 높이 44~48px 이상인가?
3. `phases/9-ui-system/index.json`의 step 1을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 기존 컴포넌트(PlayControls, ModeToggle 등)를 지우거나 고치지 마라. 이유: 화면 교체는 11-screens에서 한다.
- UI 라이브러리·아이콘 패키지를 설치하지 마라. 이유: ADR-007.
- 이모지를 아이콘으로 쓰지 마라. 이유: UI_GUIDE 금지 목록.
- 기존 테스트를 깨뜨리지 마라.
