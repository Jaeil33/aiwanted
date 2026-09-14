# Step 2: stage-component

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` ("패턴": React는 ref로만 컨트롤러 조작)
- `/docs/UI_GUIDE.md` (레이아웃: 휴대폰 전체 폭 16:9, reduced motion)
- 이전 step 산출물: `src/stage/render/types.ts`, `controller.ts`, `testing.ts`, `src/stage/index.ts`
- 0-setup 산출물: `src/app/App.tsx`, `src/test/setup.ts`, `vitest.config.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

### `src/stage/useReducedMotion.ts` (테스트 먼저)
- `useReducedMotion(): boolean` — `window.matchMedia('(prefers-reduced-motion: reduce)')`를 구독하고 바뀌면 갱신한다. `matchMedia`가 없으면 false.

### `src/stage/BallparkStage.tsx` (테스트 먼저 `BallparkStage.test.tsx`)
- `BallparkStage = forwardRef<StageController, BallparkStageProps>`
- `BallparkStageProps { scene: StageScene | null; bases?: Bases; board?: [string, string]; className?: string; label?: string }`
- 동작:
  - 컨테이너 `div` 안에 `canvas` 하나(`role="img"`, `aria-label`은 `label` 또는 기본 "경기장: 투수와 타자가 공을 주고받는 화면").
  - 마운드 시 `createStage(canvas, { reducedMotion })`를 한 번 만들고, `useImperativeHandle`로 컨트롤러 메서드를 그대로 노출한다.
  - `scene`·`bases`·`board` prop이 바뀌면 `setScene`·`setBases`·`setBoard`를 부른다.
  - 컨테이너 폭이 바뀌면 `resize(width, devicePixelRatio)`를 부른다. `ResizeObserver`가 없으면 `window` resize 이벤트로 대신한다.
  - 언마운트 시 `destroy()`.
  - 캔버스는 CSS로 폭 100%, `aspect-ratio: 16 / 9`, `max-width: 100%`. 스타일은 `BallparkStage.module.css`.

### `src/stage/index.ts`
- `BallparkStage`, `useReducedMotion`을 추가로 내보낸다.

### 테스트
- `HTMLCanvasElement.prototype.getContext`를 `vi.spyOn`으로 가짜 컨텍스트(이전 step `testing.ts`)를 돌려주게 막는다.
- 렌더하면 `role="img"` 캔버스와 기본 aria-label이 있다.
- ref로 `inspect()`·`setBoard()`를 부를 수 있다.
- prop `bases`를 바꾸면 `inspect().bases`가 바뀐다.
- 언마운트하면 컨트롤러 `destroy`가 불린다(`createStage`를 모듈 모킹하거나 inspect로 확인).
- `useReducedMotion`: matchMedia 가짜 객체로 true/false와 change 이벤트 반영.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 컴포넌트가 연출 로직을 갖지 않고 컨트롤러만 조작하는가?
   - UI_GUIDE 레이아웃(전체 폭 16:9, 가로 스크롤 없음)을 따르는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/3-stage/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `App.tsx`나 화면 코드에 경기장을 붙이지 마라. 이유: 화면 조립은 5-app phase의 범위다.
- 컴포넌트 안에서 엔진·데이터를 import하지 마라. 이유: 스테이지는 받은 연출 명령만 그린다.
- 새 패키지를 설치하지 마라. 이유: ADR-007.
- `src/types`, `src/domain`, `src/engine`을 수정하지 마라.
- 기존 테스트를 깨뜨리지 마라.
