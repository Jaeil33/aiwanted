# Step 0: playback-v2

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` (확률, 패턴, 상태 관리)
- `/docs/ADR.md` (ADR-002, ADR-012, ADR-015)
- `src/app/usePlayback.ts`, `src/app/usePlayback.test.tsx`, `src/app/useSceneEvaluations.ts`, `src/app/GameProvider.tsx`, `src/app/platform.ts`
- `src/game/playback.ts`, `src/game/session.ts`, `src/game/engineClient.ts`, `src/engine/rng.ts`, `src/engine/playout.ts` (`pickHighlights`)
- `src/stage/render/types.ts` (10-stage-broadcast step 2: `skip()`, `onPlate`, `setVariant`, 제한 시간 가드)
- `phases/10-stage-broadcast/index.json`, `phases/9-ui-system/index.json`의 summary

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 배경 (2026-09-15 감사)

- **난수 치우침**: 공마다 `createRng(seed × 100003 + 누적 투구 수)`로 생성기를 새로 만들어 첫 난수가 치우쳤다(χ²(99) 195 vs 단일 스트림 74).
- **끝까지 연출**: "경기 끝까지"는 평균 41초·최대 76초였고 멈출 수 없었다.
- **준비 전 투구 지연**: 확률 게이지가 뜨기 전에 "한 구 던지기"를 누르면 첫 공이 15~45초 걸렸다. `canPitch`가 엔진 준비 여부를 보지 않았고, 워커는 첫 요청 때에야 떴다.

## 작업

### `src/app/usePlayback.ts`
```ts
export interface PlaybackApi {
  throwPitch(): Promise<void>;
  finishPa(): Promise<void>;
  finishGame(): Promise<void>;
  /** 진행 중인 연출·반복을 멈추고 남은 결과를 연출 없이 즉시 반영한다 */
  skip(): void;
  busy: boolean;
  /** 지금 상태의 엔진 평가가 준비됐는지. false면 세 동작은 아무것도 하지 않는다 */
  ready: boolean;
  trail: Record<number, { winHome: number; tie: number }>;
}

export function usePlayback(
  stageRef: RefObject<StageController | null>,
  opts?: { sleep?: (ms: number) => Promise<void>; onCall?: (call: { text: string; tone: CalloutTone; key: number }) => void },
): PlaybackApi;
```
규칙:
1. **난수**: 한 판(판 = sceneId|seed)에는 `createRng(seed)` 하나를 이어 쓴다. `resetPlay`·`openScene`으로 판이 바뀔 때만 새로 만든다. playout에는 같은 스트림에서 뽑은 32비트 시드 하나를 넘긴다.
2. **skip()**:
   - 스테이지 `skip()`을 부른다.
   - 반복(타석 끝까지·경기 끝까지)을 중단 표시하고, 남은 결과를 연출 없이 같은 난수 순서로 계산해 세션에 반영한다.
   - 같은 시드라면 건너뛴 결과와 건너뛰지 않은 결과가 같아야 한다(연출은 난수를 쓰지 않는다).
3. **준비 게이트**: `ready`는 현재 상태의 평가가 캐시에 있을 때 true다. 장면을 열면 곧바로 엔진 클라이언트를 만들고(워커 로드 시작) 시작 상태 평가를 요청해 데운다.
4. **느린 연출**: `pickHighlights` 결과 중 변화가 큰 타석 최대 3개의 마지막 공에만 쓴다. 나머지는 fast다.
5. **콜**: 스테이지 `onPlate` 시점에 `onCall`로 콜을 알린다.
   - text: 볼 "볼", 스트라이크 "스트라이크", 파울 "파울", 인플레이는 결과 headline(홈런·끝내기면 tone 'big', 안타 'hit', 아웃 'out')
   - key는 증가하는 번호다.
6. **숨은 탭**: 스테이지 가드에 맡긴다. hook은 연출 Promise가 풀리면 다음 단계로 간다(추가 타이머 없음).
7. 기존 계약(pitchApplied·paFinished·gameFinished dispatch 순서, 언마운트 시 이미 던진 공 반영)은 유지한다.

### `src/app/useSceneEvaluations.ts`
- 장면을 열 때 시작 상태 base·tmi 평가를 요청한다(이미 하고 있으면 유지).
- `pending`과 별도로 `readyFor(stateKey)`를 제공해 usePlayback이 쓰게 한다.

### 테스트
- 가짜 StageController와 가짜 엔진 클라이언트로 확인할 것:
  - 공 여러 개의 난수 소비가 단일 스트림과 같다.
  - skip이 반복 중에도 즉시 세션을 최종 상태로 만든다.
  - 같은 시드에서 skip 결과가 끝까지 연출한 결과와 같다.
  - `ready`가 false일 때 세 동작이 무시된다.
  - onCall 순서·tone.
  - 하이라이트 느린 연출이 3개 이하다.
  - 언마운트 계약.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/app src/game
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - 확률은 엔진 결과만 쓰는가?
   - 난수는 인자로 받은 시드에서만 오는가?
   - 상태 변경은 세션 reducer 액션으로만 하는가?
3. `phases/11-screens/index.json`의 step 0을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 화면(`src/app/screens`)을 새로 만들지 마라. 이유: step 2의 범위다. 기존 PlayScreen은 새 hook 계약으로 컴파일·동작하게만 고친다.
- 공마다 생성기를 새로 만들지 마라. 이유: ADR-015 난수 치우침.
- 기존 테스트를 깨뜨리지 마라(바뀐 난수 규칙에 묶인 기대값은 새 규칙으로 고친다).
