# Step 3: swing-index

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` (핵심 계약의 "승부처 지수")
- `/docs/ADR.md` (ADR-002, ADR-014)
- `src/engine/game.ts` (`Evaluation`, `AfterEvent`), `src/engine/index.ts`
- `src/game/selectors.ts`, `src/game/selectors.test.ts`, `src/game/index.ts`, `src/game/index.test.ts`
- `src/types/data.ts` (`SceneRecord.leverage`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

### `src/game/selectors.ts`
```ts
/**
 * 승부처 지수(ADR-014): 이번 타석이 끝났을 때 공격 팀 승리 가치가 평균적으로 얼마나 움직이는지(%p).
 * 100 × Σ_e pa[e] × |B(after[e]) − B(지금)|, B = 공격 팀 승리 + 무승부 / 2.
 * after가 비어 있으면(detail: false 평가) null.
 */
export function expectedSwing(ev: Pick<Evaluation, 'batSide' | 'pa' | 'after' | 'winHome' | 'winAway' | 'tie'>): number | null;
```
- 공격 팀은 `ev.batSide`로 정한다(home이면 `winHome`, away면 `winAway`).
- 결과는 유한한 0 이상의 수다. 반올림하지 않는다(표시 형식은 화면이 정한다).
- `src/game/index.ts`에서 내보내고 `index.test.ts`의 값 이름 목록을 갱신한다.

### `src/types/data.ts`
- `SceneRecord.leverage`에 "실제 결과의 |WPA|. 장면 선정용이며 화면에 표시하지 않는다(ADR-014)"라는 JSDoc만 단다. 타입은 바꾸지 않는다.

### 테스트 (`src/game/selectors.test.ts`)
- `after`의 모든 값이 지금과 같으면 0이다.
- 손으로 계산한 합성 평가(사건 7개)와 1e-12 이내로 같다.
- 원정 공격과 홈 공격이 대칭이다.
- 무승부는 절반으로 센다.
- `after`가 비면 null이다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/game
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - `src/game`이 순수 모듈인가(DOM·타이머·난수 없음)?
   - 확률은 엔진 평가값에서만 오는가?
   - `src/types` 변경이 주석뿐인가?
3. `phases/7-scene-data/index.json`의 step 3을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 화면·컴포넌트(`src/components`, `src/app`)를 고치지 마라. 이유: 로비 화면 phase(11-screens)에서 새로 만든다.
- 실제 |WPA|(`leverage`)를 지수 계산에 섞지 마라. 이유: 결과 스포일러다(ADR-014).
- 기존 테스트를 깨뜨리지 마라.
