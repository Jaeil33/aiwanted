# Step 2: stage-controller

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` (패턴: 캔버스 연출)
- `/docs/ADR.md` (ADR-012, ADR-015)
- `src/stage/render/controller.ts`, `src/stage/render/types.ts`, `src/stage/render/testing.ts`(수동 프레임 deps)와 테스트
- `src/stage/BallparkStage.tsx`, `src/stage/BallparkStage.test.tsx`, `src/stage/useReducedMotion.ts`, `src/stage/index.ts`
- step 0·1 산출물: `src/stage/math/camera.ts`, `src/stage/render/background.ts`, `figures.ts`, `overlay.ts`
- 사용하는 쪽(읽기만): `src/app/usePlayback.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 배경 (2026-09-15 앱 흐름 감사)

- **숨은 탭 멈춤**: 연출 루프가 `requestAnimationFrame`에만 의존한다. 탭이 오래 백그라운드에 있으면 투구가 멈추고, 돌아온 뒤 다음 투구도 15초 넘게 멈췄다. 콘솔 오류는 없었다.
- **건너뛰기 없음**: "경기 끝까지" 연출(평균 41초, 최대 76초)을 멈추거나 건너뛸 수 없었다.

## 작업

### `src/stage/render/types.ts`, `controller.ts`
```ts
export type StageVariant = 'play' | 'lobby' | 'backdrop';

export interface StageDeps {
  now(): number;
  requestFrame(cb: (t: number) => void): number;
  cancelFrame(id: number): void;
  createCanvas(width: number, height: number): HTMLCanvasElement;
  /** 벽시계 타이머(프레임이 멈춰도 동작) */
  setTimer(cb: () => void, ms: number): number;
  clearTimer(id: number): void;
  /** 문서 가시성 구독. 해제 함수를 돌려준다 */
  onVisibility(cb: (hidden: boolean) => void): () => void;
}

export interface PitchPlayback {
  // 기존 필드 유지 + 아래 추가. banner는 받아도 그리지 않는다(DOM Callout 담당, deprecated 주석)
  /** 공이 플레이트를 지나는 순간 한 번 */
  onPlate?: (code: PitchCode) => void;
}

export interface StageController {
  setScene(scene: StageScene): void;
  setVariant(variant: StageVariant): void;   // lobby·backdrop은 존·표시·공을 숨기고, backdrop은 어둡게
  setLights(level: number): void;            // 0~1
  lightsOn(durationMs: number): Promise<void>; // 두 번 짧게 깜빡인 뒤 1로(동작 줄이기면 즉시)
  setBases(bases: Bases): void;              // 유지(주루 연출용)
  setBoard(lines: [string, string]): void;
  playPitch(p: PitchPlayback): Promise<void>;
  /** 진행 중인 연출을 즉시 최종 상태로 끝내고 기다리던 Promise를 푼다 */
  skip(): void;
  showBanner(b: StageBanner): Promise<void>; // 그리지 않고 바로 푼다(호환용, deprecated)
  clearMarkers(): void;
  resize(cssWidth: number, cssHeight: number, dpr?: number): void;
  inspect(): StageInspect;                    // lights·variant·hidden 추가
  destroy(): void;
}
```

규칙:
- **숨은 탭**: 문서가 숨겨지면 진행 중인 연출을 `skip()`과 같게 즉시 끝낸다. 숨은 동안 들어온 `playPitch`는 연출 없이 바로 최종 상태로 풀린다. 다시 보이면 대기 동작만 이어 간다.
- **제한 시간 가드**: 모든 `playPitch` Promise는 예상 연출 시간 + 1,500ms 안에 반드시 풀린다. 벽시계 타이머로 강제하므로 프레임이 한 번도 오지 않아도 풀린다.
- **onPlate**: 공이 플레이트를 지나는 연출 시각에 한 번 부른다. skip·숨김·가드로 끝나면 끝날 때 한 번 부른다(중복 없음).
- **동작 줄이기**: 슬로모션·잔상 없이 1배속이다.
- **destroy**: 타이머·가시성 구독·프레임을 모두 해제한다.
- **기본 deps**: 브라우저의 `requestAnimationFrame`, `setTimeout`, `document.visibilitychange`를 쓰고, 이 접근은 기본 deps 생성 함수 안에만 둔다.

### `src/stage/BallparkStage.tsx`
- props: `{ scene: StageScene; variant?: StageVariant; lights?: number; bases?: Bases; className?: string }`.
- `ResizeObserver`로 너비와 높이를 모두 넘긴다. 부모가 높이를 정하고 캔버스는 그 칸을 채운다.
- ref로 컨트롤러를 노출하는 방식(기존 `forwardRef`)을 유지한다.

### 테스트
- 수동 deps로 확인할 것:
  - `skip()`이 기다리던 Promise를 풀고 `onPlate`를 한 번 부른다.
  - 숨김 이벤트가 진행 중 연출을 끝낸다.
  - 숨은 동안 `playPitch`가 바로 풀린다.
  - 프레임이 전혀 오지 않아도 가드 시간 안에 풀린다.
  - `lightsOn` 단계와 동작 줄이기.
  - `setVariant`별로 존·표시 그리기가 달라진다.
  - `resize`가 너비·높이를 받는다.
  - `destroy`가 모든 구독을 해제한다.
- BallparkStage: 너비·높이 전달, variant·lights prop 반영.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/stage src/app/usePlayback.test.tsx
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - `window`·`document`·타이머 접근이 기본 deps 생성 함수에만 있는가?
   - 기존 `usePlayback`이 새 API로도 컴파일·통과하는가(banner 무시, resize 인자)?
3. `phases/10-stage-broadcast/index.json`의 step 2를 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 연출이 게임 상태(점수·카운트)를 바꾸게 하지 마라. 이유: 상태는 세션 reducer만 바꾼다(ARCHITECTURE 상태 관리).
- `usePlayback`의 게임 흐름을 새로 만들지 마라. 이유: 11-screens의 범위다. 새 API에 맞춰 컴파일되게만 고친다.
- 기존 테스트를 깨뜨리지 마라.
