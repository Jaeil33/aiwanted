# Step 0: stage-math

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` (디렉토리 구조의 `src/stage/math`, "패턴")
- `/docs/PRD.md` (핵심 기능 5 다시 치르기)
- 계약: `src/types/domain.ts`(`Play`, `PitchCode`, `RunnerMove`, `Bases`), `src/types/data.ts`(`PitchRow` — 인덱스 6~13이 x0, z0, vx0, vy0, vz0, ax, ay, az, 14~15가 topSz, bottomSz, 기준 y0 = 55ft)
- 이식 원본(읽기만): `reference/tmi-prototype/stage.js` 1~215행(`CAMERA`, `PLATE_Y`, `MITT_Y`, `GRAVITY`, `DRAG`, `BALL_R`, `project`, `pitchAt`, `timeToY`, `plateTime`, `lerp`, `clamp01`, `smooth`, `battedPreset`, `flight`, `pathAt`, `poseAt`, `PITCHER_SET`, `RELEASE_AT`, `PITCHER_KEYS`, `BAT`, `BATTER_X`, `FIELDERS`, `BASES`, `mix`, `uniform`, `basePoint`, `mulberry`)과 `reference/tmi-prototype/stage.test.js`

`src/stage/math`는 순수 모듈이다(CLAUDE.md CRITICAL). DOM·캔버스·`Math.random`을 쓰지 마라(난수는 인자). 모든 파일은 같은 폴더의 `<이름>.test.ts`를 먼저 쓴다.

## 작업

프로토타입 stage.js의 계산 부분을 연출 코드와 분리해 TypeScript로 옮긴다. 값과 공식은 그대로 둔다.

### `src/stage/math/camera.ts`
- `W = 960`, `H = 540`(논리 캔버스), `CAMERA = { y: -14, z: 6, f: 1150, cx: W / 2, hy: 150 }`, `PLATE_Y = 0.7083`, `MITT_Y = -1.6`, `BALL_R = 0.121`
- `project(x: number, y: number, z: number): { x: number; y: number; s: number }`

### `src/stage/math/pitch.ts`
- `pitchAt(row: PitchRow, t: number): { x: number; y: number; z: number }` — `x = x0 + vx0·t + ½·ax·t²`, y는 y0 = 55에서 같은 식, z도 같은 식.
- `timeToY(row: PitchRow, yTarget: number): number`, `plateTime(row: PitchRow): number`
- `DEFAULT_PITCH_ROW: PitchRow` — 투구 표본이 없을 때 쓰는 가운데 직구 한 개(합성 값).

### `src/stage/math/batted.ts`
- `GRAVITY = 32.17`, `DRAG = 0.0012`
- `battedPreset(play: Play | 'F', bats: 'L' | 'R', u1: number, u2: number): BattedSpec` — stage.js 그대로(HR, 3B, 2B, 1B, DP, GB, FB, SF, LD, F 파울).
- `flight(spec: BattedSpec): { points: FlightPoint[]; landing: { x: number; y: number }; apex: number; distance: number; duration: number }` — 항력 있는 포물선, 땅볼은 튕김, `stopAt` 처리.
- `pathAt(points: FlightPoint[], t: number): FlightPoint`

### `src/stage/math/pose.ts`
- `lerp`, `clamp01`, `smooth`
- `poseAt(keys: PoseKey[], t: number): Pose` — smoothstep 보간.
- `PITCHER_SET`, `RELEASE_AT = 0.76`, `DELIVERY_MS = 1650`, `PITCHER_KEYS`, `BAT`(stance·load·stride·contact·follow·take), `BATTER_X = 2.9` — 값 그대로.

### `src/stage/math/field.ts`
- `FIELDERS`, `BASES`, `basePoint(q: number)`, `nearestFielder(landing: { x: number; y: number }): number` (stage.js 839행 로직)

### `src/stage/math/color.ts`
- `mix(hex: string, other: string, amount: number): string`, `uniform(teamColor: string): { base: string; dark: string; light: string }`(stage.js `uniform`이 돌려주는 값 구조 그대로)

### `src/stage/math/index.ts`
- 위 공개 API를 다시 내보낸다. `index.test.ts`에서 이름 목록을 확인한다.

### 테스트 (stage.test.js를 옮기고 보강)
- 카메라: 먼 수평선이 눈높이(`hy`)에 오고, 1루(+x)가 화면 오른쪽.
- 투구: 합성 PitchRow에서 `plateTime`으로 구한 시각의 y가 `PLATE_Y`(1e-6), 그 시각 x·z가 등가속도 공식으로 계산한 값과 같다.
- 타구 프리셋: HR 비거리 ≥ 360ft, 뜬공 정점 ≥ 60ft·비거리 200~340ft, 땅볼 정점 ≤ 6ft·비거리 < 160ft(여러 u1·u2).
- 우타자는 좌측(−x), 좌타자는 우측(+x)으로 당겨친다.
- `flight` 점들이 시간순이고 홈플레이트 근처에서 시작한다. `pathAt`이 구간 사이를 보간한다.
- `poseAt`: 키프레임 시각에서 키 값과 같고, 사이에서 연속이다.
- `mix`: amount 0 → 원래 색, 1 → other.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/stage/math`에 DOM·캔버스 코드가 없는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/3-stage/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 카메라·물리 상수, 자세 키프레임 값을 바꾸지 마라. 이유: 실제 투구 추적 좌표와 화면이 맞도록 프로토타입에서 검증한 값이다.
- 테스트에 실제 네이버 투구 기록을 넣지 마라. 합성 값만. 이유: ADR-005, 공개 저장소.
- 캔버스 그리기 코드를 만들지 마라. 이유: 다음 step의 범위다.
- `src/types`, `src/domain`, `src/engine`을 수정하지 마라. 이유: 공용 계약이거나 다른 phase의 영역이다.
- 기존 테스트를 깨뜨리지 마라.
