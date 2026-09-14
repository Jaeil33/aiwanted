# Step 0: broadcast-camera

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` (stage)
- `/docs/ADR.md` (ADR-005, ADR-012)
- `/docs/UI_GUIDE.md` (경기장 캔버스, 플레이 화면 구성)
- `docs/design/nightgame/stage.mjs` (중견수 쪽 시점 구도 참고 — 가상 좌표 360×452에 손으로 배치한 것, import 금지)
- `src/stage/math/*.ts`와 테스트 (`camera.ts`, `pitch.ts`, `batted.ts`, `field.ts`, `pose.ts`, `index.ts`)
- `src/stage/render/controller.ts`, `src/stage/BallparkStage.tsx` (투영을 쓰는 곳 — 이번 step에서는 컴파일이 되게만 맞춘다)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 배경

지금 카메라는 포수 뒤(`CAMERA = { y: -14, z: 6, f: 1150 }`)에 있다. 이 시점에서는 앞쪽 타자가 화면 절반을 가린다. TV 중계의 중견수 쪽 망원 시점(투수 뒷모습, 타자·포수·주심이 한 화면)으로 바꾼다. 경기장 좌표는 그대로 ft 단위다: x는 1루 쪽 +, y는 홈플레이트에서 투수·외야 쪽 +, z는 위쪽 +.

## 작업

### `src/stage/math/camera.ts`
```ts
/** 논리 캔버스(세로형 6:7). 렌더러가 실제 픽셀로 늘린다 */
export const W = 720;
export const H = 840;

export interface Camera {
  /** 카메라 위치(ft): 중견수 뒤쪽 높은 곳 */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 바라보는 점(ft): 홈플레이트 조금 위 */
  readonly target: { x: number; y: number; z: number };
  /** 초점 거리(px, 논리 캔버스 기준) */
  readonly f: number;
  /** 화면에서 바라보는 점이 놓일 위치(px) */
  readonly cx: number;
  readonly cy: number;
}

export const CAMERA: Camera;

/** 경기장 좌표(ft) → 논리 캔버스(px). s는 그 깊이에서 1ft가 몇 px인지. 카메라 뒤면 null */
export function project(x: number, y: number, z: number): Projected | null;
```
- 카메라는 중견수 쪽 뒤 높은 곳에 둔다. 바라보는 점은 홈플레이트 위이고, 롤이 없는 핀홀 투영이다.
- 1루 쪽(+x)이 화면 왼쪽에 보인다(중계 화면과 같음). 투수가 플레이트를 가리지 않게 카메라를 x축으로 조금 비켜 둔다.
- `PLATE_Y`, `MITT_Y`, `BALL_R`는 유지한다.
- `project`가 null을 돌려줄 수 있게 되므로 호출하는 곳(`math`·`render`)을 컴파일되도록 고친다. 그리는 코드의 모양 변화는 step 1에서 한다.

### 구도 조건 (테스트로 강제)
- **홈플레이트** (0, 0.7, 0): 화면 x는 W의 45~55%, y는 H의 55~62%.
- **투수판** (0, 60.5, 0.83): 플레이트보다 화면 아래(y가 큼)이고 H의 80~95% 사이.
- **망원 비율**: s(투수판) / s(플레이트)가 1.10~1.40.
- **좌우**: 1루 베이스 (63.6, 63.6, 0)은 플레이트보다 화면 왼쪽이고, 3루 베이스는 오른쪽이다.
- **스트라이크 존**: 폭 1.42ft(플레이트, z 2.5)이 W의 4~7%.
- **관중석**: 백스톱 뒤 관중석 높이 (0, −60, 20)가 H의 5~35%.
- **카메라 뒤**: 뒤쪽 점은 null이다.
- **투구 궤적**: 기존 `pitch.ts` 궤적 함수의 릴리스 지점(y≈55)과 플레이트 통과 지점이 모두 투영되고, 릴리스가 플레이트보다 화면 아래에 있다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/stage/math
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - `src/stage/math`가 순수 모듈인가?
   - 경기장 좌표계 정의를 바꾸지 않았는가?
3. summary에 최종 카메라 값(x·y·z·target·f)과 구도 조건 수치를 적는다.
4. `phases/10-stage-broadcast/index.json`의 step 0을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 경기장 좌표계(ft, 축 방향)나 PTS 궤적 수식을 바꾸지 마라. 이유: 실제 투구 데이터(ADR-002, `PitchRow`)와 맞아야 한다.
- 3D 라이브러리를 설치하지 마라. 이유: ADR-007. 캔버스 2D와 직접 투영으로 한다.
- 기존 테스트를 깨뜨리지 마라(카메라 값에 묶인 기존 투영 테스트는 새 구도 조건으로 바꾼다).
