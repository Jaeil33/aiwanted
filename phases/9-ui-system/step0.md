# Step 0: design-tokens

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/UI_GUIDE.md` (전부 — 이 step의 기준)
- `/docs/ADR.md` (ADR-007, ADR-010, ADR-011)
- `docs/design/nightgame/style.css` (시안 토큰·타이포 참고, import 금지)
- `src/styles/tokens.css`, `src/styles/global.css`, `index.html`, `src/main.tsx`
- 옛 토큰을 쓰는 CSS 모듈 목록: `grep -rl "var(--night\|var(--booth\|var(--dugout\|var(--rail\|var(--board\|var(--chalk-\|var(--led\|var(--display\|var(--body" src`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

### `src/styles/tokens.css`
- UI_GUIDE의 새 토큰을 값 그대로 정의한다.
  - 바탕: `--ground`, `--plate`, `--plate-2`, `--hair`, `--hair-2`, `--hud`
  - 글자: `--chalk`, `--dust`, `--dim`
  - 행동·시맨틱: `--flood`, `--flood-ink`, `--ball`, `--strike`, `--out`, `--toon`, `--bat`, `--fld`
  - 금속색: `--foil-real`, `--foil-maybe`, `--foil-fun`
  - 글꼴: `--callout`, `--ui`, `--num`
  - 움직임: `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`
  - 반경: `--r-board: 2px`, `--r-control: 6px`, `--r-slot: 8px`, `--r-ticket: 10px`, `--r-card: 12px`, `--r-sheet: 16px`
- 옛 토큰 이름은 11-screens가 끝날 때까지 기존 화면이 깨지지 않도록 새 값의 별칭으로 남긴다. 주석으로 "11-screens에서 제거"라고 표시한다.
  - `--night: var(--ground)`, `--booth: var(--plate)`, `--dugout: var(--plate-2)`, `--rail: var(--hair)`, `--board: #05090D`
  - `--chalk-2: #C9CFCC`, `--chalk-3: var(--dust)`, `--chalk-4: var(--dim)`
  - `--led: var(--flood)`, `--led-ink: var(--flood-ink)`
  - `--display: var(--callout)`, `--body: var(--ui)`, `--led-font: var(--num)`
  - `--evidence-measured: var(--foil-real)`, `--evidence-plausible: var(--foil-maybe)`, `--evidence-fun: var(--foil-fun)`

### `src/styles/global.css`
- `html, body`에 `background: var(--ground)`, `color: var(--chalk)`, `font: 400 15px/1.6 var(--ui)`를 준다.
- 한국어 줄바꿈 `word-break: keep-all; overflow-wrap: break-word`.
- 모든 인터랙티브 요소에 포커스 링 `outline: 2px solid var(--flood); outline-offset: 2px`.
- `[hidden] { display: none !important; }`, `button, input { font: inherit; color: inherit; }`.
- 숫자 유틸 클래스 `.num { font-family: var(--num); font-stretch: 76%; font-variant-numeric: tabular-nums; }`.
- `@media (prefers-reduced-motion: reduce)`에서 `*, *::before, *::after`의 animation·transition 시간을 1ms로 줄인다.

### `index.html`
- 글꼴 링크를 UI_GUIDE의 주소(Archivo·Gasoek One·Noto Sans KR)로 바꾸고 `preconnect` 두 줄을 유지한다.
- `<meta name="theme-color" content="#07090B">`를 넣는다.

### 테스트 (`src/styles/tokens.test.ts`)
- `tokens.css`를 `?raw`로 읽어 확인한다.
  - 새 토큰이 모두 정의돼 있고 값이 UI_GUIDE와 같다.
  - 옛 별칭이 모두 있다.
- 대비 계산(WCAG 상대 휘도)을 순수 함수로 만들어 테스트한다.
  - `--chalk`·`--dust` 대 `--ground`·`--plate`: 4.5 이상
  - `--flood-ink` 대 `--flood`: 4.5 이상
  - `--dim` 대 `--ground`: 3 이상
  - 금속색 세 가지 대 `--plate`: 4.5 이상
- `index.html`을 `?raw`로 읽어 세 글꼴 family와 theme-color가 있는지 확인한다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/styles src/main.test.tsx
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - Tailwind·CSS 라이브러리를 추가하지 않았는가(ADR-007)?
   - 금지 목록(blur, 그라데이션 글자, 보라색, 픽셀 글꼴)을 쓰지 않았는가?
3. `phases/9-ui-system/index.json`의 step 0을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 기존 CSS 모듈을 새 토큰으로 옮겨 쓰지 마라. 이유: 화면은 11-screens에서 새로 만든다. 별칭으로 깨지지 않게만 한다.
- 새 패키지(폰트 패키지 포함)를 설치하지 마라. 이유: ADR-007. 글꼴은 Google Fonts 링크로만.
- `docs/design/nightgame/`의 파일을 import하지 마라. 이유: CLAUDE.md.
- 기존 테스트를 깨뜨리지 마라.
