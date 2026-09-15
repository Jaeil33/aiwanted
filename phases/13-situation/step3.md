# Step 3: pa-playback

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ARCHITECTURE.md`(확률, 패턴), `/docs/ADR.md`(ADR-002, ADR-015, ADR-016, ADR-018)
- `src/app/usePlayback.ts`와 테스트, `src/app/useSceneEvaluations.ts`, `src/app/platform.ts`
- `src/game/playback.ts`와 테스트(`samplePitchCode`, `resolvePitch`, `pickPitchRow`, `pitchRowsFor`, `headline`), `src/game/engineClient.ts`, `src/engine/rng.ts`, `src/engine/game.ts`(`applyTransition`, `startNextHalf`)
- `src/game/paSession.ts`, `src/game/situation.ts`, `src/game/headline.ts`
- `phases/13-situation/index.json`의 summary

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

### `src/game/playback.ts`
- `stage` 타입 import를 없앤다(계층 결합 제거). 필요한 타입은 `src/game`에 둔다.
- 추가:
```ts
/** 트래커가 구현한다(16-broadcast-ui). 게임 층은 이 인터페이스만 안다 */
export interface PitchAnimator {
  throwPitch(row: PitchRow, n: number, code: PitchCode): Promise<void>;
  skip(): void;
  reset(): void;
}
export function rowsForPitcher(args: { gameRows: PitchRow[]; pitchData: PitchData | null; pitcherId: string; throws: 'L' | 'R' }): PitchRow[];
```
- `rowsForPitcher` 우선순위: 그 경기에서 그 투수가 던진 행(`gameRows`) 12개 이상 → 그대로, 아니면 `pitchData.byPitcher[id]`와 합침 → 그래도 12개 미만이면 투수 손 리그 풀을 더한다.

### `src/app/usePaPlayback.ts`
```ts
export interface PaPlaybackApi {
  throwPitch(): Promise<void>;
  finishPa(): Promise<void>;
  skip(): void;
  ready: boolean;   // 상황 평가(TMI 반영)가 끝났을 때만 true
  busy: boolean;
}
export function usePaPlayback(deps: { animator: PitchAnimator | null; ... }): PaPlaybackApi;
```
- 한 번 쳐보기 = 시드 하나로 만든 난수 생성기 하나(`createRng(seed)`)를 끝까지 이어 쓴다. 공마다 생성기를 새로 만들지 않는다.
- 공 하나: 현재 카운트 평가 → `samplePitchCode` → `resolvePitch` → `pickPitchRow(rowsForPitcher(...), code, b, s, stance, rng)` → `animator.throwPitch` → `pitchApplied`. 타석이 끝나면 `applyTransition`으로 다음 상태를 만들고 `paDone`(사건·중계식 헤드라인·상태).
- `finishPa`는 끝날 때까지 공을 반복한다(최대 20구 가드). `skip`은 animator.skip 후 남은 공을 연출 없이 계산한다.
- `ready`가 false면 `throwPitch`·`finishPa`는 아무것도 하지 않는다(감사: 준비 전 첫 공 15~45초 지연).
- `resetPlay` 뒤 같은 시드면 같은 결과가 나온다(결정성 테스트).
- 문서가 숨겨져도 계산은 이어서 끝낸다(연출은 animator가 즉시 끝냄).

### 테스트
- 가짜 animator(즉시 resolve, 호출 기록), 가짜 엔진 클라이언트로: 결정성, 한 스트림 사용(생성기 생성 1회), 준비 전 무시, skip 뒤 결과 동일, 20구 가드, 볼넷·삼진·인플레이 종료, 끝내기 상태.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 체크리스트: `src/game`에서 `stage` import가 사라졌는가? 기존 `usePlayback`과 화면은 그대로 도는가?
3. `phases/13-situation/index.json`의 step 3과 `phases/index.json`의 13-situation 상태를 업데이트한다.

## 금지사항

- 기존 `usePlayback.ts`·`PlayScreen`을 지우지 마라. 이유: 16-broadcast-ui가 교체한다.
- 경기 끝까지 재생 경로를 새로 만들지 마라. 이유: ADR-016.
