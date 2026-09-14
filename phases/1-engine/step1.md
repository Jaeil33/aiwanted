# Step 1: engine-count

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` (ADR-002)
- 이전 step 산출물: `src/engine/matchup.ts`, `src/engine/transitions.ts`, `src/engine/effects.ts`, `src/engine/index.ts`
- 계약: `src/types/domain.ts`(`PitchCode`, `PitchSample`, `EventIndex`), `src/domain/events.ts`, `src/test/fixtures/appData.ts`(`core.countTable`)
- 이식 원본(읽기만): `reference/tmi-prototype/engine.js`의 `countChain`, `calibrateCount`, `outcomeAtCount`, `simulatePA`와 `reference/tmi-prototype/engine.test.js`의 카운트 테스트

이전 step에서 만든 코드를 꼼꼼히 읽고 같은 스타일로 작업하라.

## 작업

### `src/engine/count.ts` (테스트 먼저 `count.test.ts`)
- `export interface CountModel { rates: number[][]; term: number[][] }` — `rates[b*3+s] = [B, T, S, F, X]` 확률, `term[b*3+s] = [K, BB, 인플레이]` 흡수 확률.
- `countChain(table: readonly (readonly number[])[], aBall: number, aStrike: number, aPlay: number): CountModel` — engine.js 그대로. 2스트라이크 파울은 카운트 유지, 3볼에서 볼이면 볼넷, 2스트라이크에서 T·S면 삼진.
- `calibrateCount(pa: ArrayLike<number>, table: readonly (readonly number[])[]): CountModel` — engine.js의 감쇠 뉴턴 그대로: 로그 공간 볼·스트라이크 배율 두 개, 인플레이 배율 1 고정, 유한차분 h=1e-6, 개선될 때까지 스텝 절반 줄이기(최대 40번), u를 [−15, 15]로 자르기, 잔차 노름 1e-12 또는 100회에서 멈춤.
- `outcomeAtCount(cm: CountModel, pa: ArrayLike<number>, balls: number, strikes: number): Float64Array` — 그 카운트에서 타석이 끝날 사건 분포. K·BB는 `term`, 인플레이 몫은 pa의 인플레이 사건 비율대로 나눈다.
- `simulatePA(cm: CountModel, pa: ArrayLike<number>, r: () => number): { event: EventIndex; pitches: PitchSample[] }` — engine.js 그대로. 각 pitch의 balls·strikes는 그 공을 던지기 전 카운트다.
- `nextCount(balls: number, strikes: number, code: PitchCode): { balls: number; strikes: number; ends: 'K' | 'BB' | 'X' | null }` — 한 구 진행 규칙. 앱의 "한 구 던지기"에서 쓴다.

### `src/engine/index.ts`
- count 공개 API를 추가로 내보내고 `index.test.ts`를 갱신한다.

### 테스트
- 픽스처 countTable과 여러 매치업(리그 평균, 삼진형 K 0.35, 볼넷형 BB 0.18, rel 극단값 0.2·3.0 섞음)에서 `calibrateCount` 결과 `term[0][0]`이 pa[K], `term[0][1]`이 pa[BB]와 1e-9 이내. 어떤 값에도 NaN이 없다.
- 타자 출루 확률(1 − K − OUT, `outcomeAtCount` 기준): 3-0 > 0-0 > 0-2.
- 모든 카운트에서 `outcomeAtCount` 합이 1(1e-9).
- `simulatePA`: 고정 seed 20만 타석의 사건 빈도가 pa와 3σ 이내. 모든 투구 기록이 카운트 규칙을 지킨다(볼넷은 네 번째 볼에서만, 2스트라이크 파울은 카운트 유지, 삼진은 세 번째 스트라이크에서만).
- `nextCount`: 3-2 볼 → `BB`, 0-2 파울 → 0-2 유지, 1-2 헛스윙 → `K`, 1-1 루킹 → 1-2, X → `X`.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/1-engine/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 보정을 곱셈 반복식(볼·스트라이크·인플레이 세 배율 동시 조정)으로 바꾸지 마라. 이유: 프로토타입에서 배율이 발산해 NaN이 났고, 두 미지수 뉴턴으로 고쳤다.
- 반이닝·경기 계산을 만들지 마라. 이유: 다음 step의 범위다.
- `src/types`, `src/domain`을 수정하지 마라. 이유: 공용 계약이다.
- 기존 테스트를 깨뜨리지 마라.
