# Step 1: stage-renderer

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` ("패턴": 캔버스 연출은 명령형 컨트롤러)
- `/docs/UI_GUIDE.md` (색상, 애니메이션 허용 범위, reduced motion)
- `/docs/PRD.md` (핵심 기능 5)
- 이전 step 산출물: `src/stage/math/*.ts`
- 계약: `src/types/domain.ts`(`Bases`, `PitchCode`, `Play`, `RunnerMove`), `src/types/data.ts`(`PitchRow`)
- 이식 원본(읽기만): `reference/tmi-prototype/stage.js` 215~938행(`createStage`, `resize`, `buildBackground`, `limb`, `drawPitcher`, `drawBatter`, `drawFielders`, `drawZone`, `drawBall`, `drawMitt`, `drawMap`, `drawCall`, `drawBanner`, `drawSparks`, `burst`, `idlePitcher`, `idleBatter`, `frame`, `batterKeys`, `playPitch`, `showBanner`, `setScene`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고 그 API로 그린다.

## 작업

프로토타입의 포수 뒤 중계 시점 연출을 `src/stage/render/`로 옮긴다. 화면 구성·연출 순서·타이밍은 프로토타입과 같게 하고, 테스트할 수 있게 시간·프레임·오프스크린 캔버스를 주입받는다. 모든 파일은 테스트를 먼저 쓴다.

### 공개 타입 (`src/stage/render/types.ts` — 타입만)
```ts
export interface StageScene {
  bat: { color: string; home: boolean; bats: 'L' | 'R' };
  fld: { color: string; home: boolean; throws: 'L' | 'R' };
  zone?: { top: number; bottom: number };
}
export interface PitchPlayback {
  row: PitchRow | null;          // null이면 DEFAULT_PITCH_ROW
  code: PitchCode;
  number: number;                // 이번 타석 몇 번째 공
  fast?: boolean;                // 슬로모션 없이 1배속
  play?: Play | null;            // 인플레이 결과(타구 연출)
  bats: 'L' | 'R';
  moves?: readonly RunnerMove[]; // 미니 다이아몬드 주자 이동
  basesAfter?: Bases;
  banner?: { text: string; sub?: string; tone?: 'normal' | 'big' };
  onRelease?: () => void;
}
export interface StageDeps {
  now(): number;
  requestFrame(cb: (t: number) => void): number;
  cancelFrame(id: number): void;
  createCanvas(width: number, height: number): HTMLCanvasElement;
}
export interface StageInspect {
  busy: boolean;
  bases: Bases;
  board: [string, string];
  banner: string | null;
  markers: number;
  scene: StageScene | null;
}
export interface StageController {
  setScene(scene: StageScene): void;
  setBases(bases: Bases): void;
  setBoard(lines: [string, string]): void;
  playPitch(p: PitchPlayback): Promise<void>;
  showBanner(b: { text: string; sub?: string; tone?: 'normal' | 'big' }): Promise<void>;
  clearMarkers(): void;
  resize(cssWidth: number, dpr?: number): void;
  inspect(): StageInspect;
  destroy(): void;
}
```

### 파일
- `src/stage/render/background.ts`: `buildBackground(ctx, scene)` — 하늘·조명탑·관중·전광판·펜스·잔디 줄무늬·내야 흙·마운드·배터 박스·홈플레이트를 한 번 그려 캐시.
- `src/stage/render/figures.ts`: `drawPitcher`, `drawBatter`, `drawFielders` — 팀 컬러 유니폼(`uniform`), 좌우 투타 반전, 투구 동작 키프레임, 스윙/테이크 키프레임.
- `src/stage/render/overlay.ts`: `drawZone`(번호 표시 투구 위치), `drawBall`(궤적 꼬리·그림자), `drawMitt`, `drawMap`(오른쪽 위 미니 다이아몬드와 주자 이동 애니메이션), `drawCall`(볼·스트라이크·헛스윙·파울·타격 태그), `drawBanner`, `drawSparks`.
- `src/stage/render/controller.ts`: `createStage(canvas: HTMLCanvasElement, opts?: { reducedMotion?: boolean; deps?: Partial<StageDeps> }): StageController`
  - 논리 크기 960×540, `resize(cssWidth, dpr)`로 실제 픽셀 크기와 스케일을 맞춘다.
  - `playPitch`: 투구 동작(1650ms, 릴리스 0.76 시점에 `onRelease`) → 공 비행(`pitchAt`, 홈 도달 `plateTime`) → 스윙/테이크 → 판정 태그 → 인플레이면 타구 비행과 가장 가까운 수비수 이동 → 주자 이동 → 배너. 슬로모션 배율 2.2, `fast` 또는 reducedMotion이면 1. 연출이 끝나면 resolve.
  - `busy`는 재생 중 true. 재생 중 `playPitch`를 또 부르면 앞 재생이 끝난 뒤 이어서 재생한다(큐).
  - 기본 deps는 `performance.now`, `requestAnimationFrame`, `cancelAnimationFrame`, `document.createElement('canvas')`. 이 기본값은 `controller.ts` 안에서만 만든다.
  - `destroy()`는 프레임 루프를 멈추고 대기 중인 Promise를 resolve한다.
- `src/stage/render/index.ts`, `src/stage/index.ts`: 공개 API 재내보내기(math + render).

### 테스트
- 가짜 2D 컨텍스트(호출을 기록하는 객체)와 가짜 캔버스, 수동으로 진행하는 시계·프레임 deps를 `src/stage/render/testing.ts`에 만든다(테스트 도우미, 이 파일도 테스트 먼저).
- `createStage`: 배경을 한 번만 만들고 매 프레임 `drawImage`로 그린다.
- `playPitch`: 시계를 진행하면 resolve되고, 그동안 `inspect().busy`가 true, 끝나면 false. `onRelease`가 한 번 불린다. `fast`·reducedMotion은 같은 투구를 더 짧은 시간에 끝낸다.
- 두 번 연달아 `playPitch`하면 순서대로 끝난다.
- `setBases`·`setBoard`·`showBanner`·`clearMarkers`가 `inspect()`에 반영된다. `basesAfter`를 준 재생이 끝나면 bases가 바뀐다.
- `resize(480, 2)`가 캔버스 픽셀 크기 960×540, 스케일 1로, `resize(390, 3)`이 비율을 유지한다.
- `destroy` 후 `cancelFrame`이 불리고 대기 중 재생이 resolve된다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `requestAnimationFrame`·`document` 접근이 `controller.ts` 기본 deps에만 있는가?
   - UI_GUIDE 금지 항목(글로우 애니메이션, 블러)을 쓰지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/3-stage/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 캔버스 라이브러리(Pixi, Three 등)를 설치하지 마라. 이유: ADR-007.
- `shadowBlur` 글로우, `filter: blur` 같은 효과를 쓰지 마라. 이유: UI_GUIDE 안티패턴.
- 선수 얼굴·구단 로고를 그리지 마라. 이유: ADR-005.
- React 컴포넌트를 만들지 마라. 이유: 다음 step의 범위다.
- `src/types`, `src/domain`, `src/engine`을 수정하지 마라.
- 기존 테스트를 깨뜨리지 마라.
