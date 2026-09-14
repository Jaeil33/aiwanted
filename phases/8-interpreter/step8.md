# Step 8: session-refusal

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` (상태 관리)
- `/docs/ADR.md` (ADR-013)
- `/docs/UI_GUIDE.md` (문구, TMI 시트)
- `src/game/session.ts`, `src/game/session.test.ts`
- `src/app/GameProvider.tsx`, `src/app/GameProvider.test.tsx`
- `src/ai/interpret.ts` (step 6: `InterpretOutcome.note`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 배경 (감사)

- 거부된 TMI가 "계산 거부" 카드로 TMI 3칸 중 1칸을 차지한다.
- 효과 없는 카드에도 "진짜야?" 버튼이 남는다.
- 입력창은 제출 즉시 비워져서, 거부 뒤에 고치려면 다시 쳐야 한다.

## 작업

### `src/game/session.ts`
- `SessionState`에 `refusal: { text: string; reason: string } | null`을 더한다. 초기값은 null이다.
- `interpretDone`에서 `entry.interpretation.refused`면 `tmis`에 넣지 않고 `refusal = { text: entry.text, reason }`로 둔다. `interpreting`은 끈다.
- 거부가 아니면 기존대로 넣고 `refusal`을 null로 지운다.
- `interpretStart`, `removeTmi`, `openScene`, `resetPlay`, `dismissRefusal`(새 액션)은 `refusal`을 지운다.
- 거부가 아닌 entry의 `parts`가 0개면 넣지 않고 note를 남긴다. 규칙상 생기지 않아야 하지만 방어한다.

### `src/app/GameProvider.tsx`
- `submitTmi`의 결과 note를 `session.notice`로 보여준다(기존 흐름 유지).
- 거부 결과는 위 액션으로 들어간다.
- 컨텍스트 actions에 `dismissRefusal`을 더한다.

### 테스트
- 세션: 거부는 칸을 차지하지 않는다. `refusal`의 설정·해제, 3칸 제한과의 상호작용, 빈 효과 방어.
- GameProvider: 가짜 해석 결과로 거부 뒤 `tmis`가 비고 `refusal`이 채워지는지, 다음 제출에서 지워지는지 확인한다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/game src/app
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - `src/game`이 순수 모듈인가?
   - 상태는 `GameProvider`의 reducer 하나인가?
3. `phases/8-interpreter/index.json`의 step 8을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 화면 컴포넌트(`src/components`, `src/app/screens`)의 모양을 바꾸지 마라. 이유: TMI 시트는 11-screens에서 새로 만든다. 기존 화면이 새 상태에서 깨지지 않게 하는 최소 수정(타입 맞추기)만 허용한다.
- localStorage 같은 브라우저 저장소를 쓰지 마라. 이유: ARCHITECTURE 상태 관리 규칙.
- 기존 테스트를 깨뜨리지 마라.
