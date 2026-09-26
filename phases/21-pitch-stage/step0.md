# Step 0: cutover

## 왜

ADR-018이 2026-09-15에 이렇게 적었다 — **"기존 `stage/render`·인형 자세 계산과 그 테스트를 지운다."**
안 지워졌다. 1년 가까이 아무도 안 부르는 채로 매번 타입 검사·린트·테스트를 통과하고 있었다.

`/grill-me` Q20에서 사용자가 (a) 삭제를 골랐다.

## 지운 것

| | |
|---|---|
| `src/stage/render/` | `controller`·`figures`(막대 사람)·`overlay`·`background`·`testing` + 테스트 |
| `src/stage/math/` | `batted`(타구 비행)·`pose`(관절 키프레임)·`field`(야수 위치)·`color`·`camera`·`random` + 테스트 |
| `src/stage/BallparkStage.*` | 옛 나이트게임 경기장 컴포넌트 |
| `src/game/playback.stageSceneFor` | 만들어 놓고 `setScene`(아무 일도 안 함)에만 넘기던 값 |

남긴 것: `tracker.ts`(실제로 그리는 것), `math/pitch.ts`(궤적 계산), `useReducedMotion`.
`camera.ts`가 갖고 있던 `PLATE_Y`는 쓰는 쪽(`pitch.ts`)으로 옮겼다.

## 함께 걷어낸 죽은 표면

지우고 나니 **아무 일도 안 하는 계약**이 드러났다.

- `StageController.setScene` / `setBoard` — `PitchTracker`에서 둘 다 `() => undefined`였다.
  `usePlayback`이 매 공 `setBoard([...])`를 부르고 있었고, 그 문자열을 만드는 `matchupLine`·`pitchLine`도 있었다.
  **전광판은 화면에 없다.** 셋 다 지웠다.
- `PitchPlayback.bats` / `play` / `moves` / `basesAfter` — `playbackFor`가 채우고 **지운 렌더러만 읽던** 필드.
  `StageInspect.board` / `scene`도 같다.

여기까지는 Q20이 물은 범위(`render`·인형·타구·`BallparkStage`) 밖이지만, 반만 지우면
"이건 왜 있지"가 그대로 남는다. 필요해지면 git이 돌려준다.

`render/types.ts`는 **트래커가 실제로 읽는 것만** 남겨 `src/stage/types.ts`로 옮겼다.
`src/game`은 순수 모듈이라 DOM이 없어서 배럴(`../stage`)이 아니라 `../stage/types`를 직접 읽어야 한다 —
배럴은 `tracker.ts`를 끌고 오고 그건 `CanvasRenderingContext2D`를 쓴다.

## 확인

타입·린트 통과. Vitest **129파일 1,716개** 통과(지운 테스트 130개).
소스 약 60KB가 줄었고 번들은 그대로다(어차피 트리 셰이킹으로 빠져 있었다).
