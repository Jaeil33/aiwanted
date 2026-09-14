# Step 7: api-handlers

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (API 키 규칙)
- `/docs/ADR.md` (ADR-006, ADR-013)
- `api/interpret.ts`, `api/verdict.ts`, `api/_lib/handlers.ts`, `api/_lib/handlers.test.ts`, `api/_lib/anthropic.ts`
- `src/ai/safety.ts` (step 2: `assessSafety`), `src/ai/text.ts` (step 1), `src/ai/json.ts`·`src/ai/normalize.ts` (step 6)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 배경 (감사)

서버 핸들러도 부분 문자열 검사(`checkSensitive`)로 AI를 부르기 전에 막는다(`handlers.ts:293` 근처). 그래서 "마약김밥" 같은 무해한 문장이 배포 경로에서도 거부된다. 반대로 서버는 응답 JSON이 객체이기만 하면 그대로 통과시킨다.

## 작업

### `api/_lib/handlers.ts`
1. **요청 검증 뒤 안전 판정**: `assessSafety(prepareText(text), ctx)`를 쓴다. ctx는 요청 본문의 컨텍스트이고, 없거나 모양이 틀리면 null이다.
   - block이면 AI를 부르지 않고 기존 거부 응답 모양(200, `refused: true`, 문구)을 돌려준다.
   - review·allow면 AI를 부른다.
2. **응답 파싱**: `parseJsonLoose`로 한다(step 6에서 `extractJson`이 이미 이 함수를 쓴다).
3. **서버 쪽 검증**: 서버는 JSON 객체인지까지만 검증한다. 복구는 클라이언트 `normalizeInterpretation`이 한다. 이유: 한 곳에서만 복구해야 결과가 같다.
4. **나머지는 유지한다**: 호출 제한, 제한 시간, 입력 80자 제한, 모델 환경변수, 오류 코드 매핑.

### 테스트 (`api/_lib/handlers.test.ts`)
- 무해한 경계 문장(가상 이름: 관중 맥주, 마약김밥, 자살 스퀴즈)은 가짜 fetch를 부른다.
- 민감 문장(가상 선수 이름 + 질병)은 fetch를 부르지 않고 거부한다.
- 주체 불명 review 문장은 fetch를 부른다.
- 코드펜스로 감싼 응답과 설명문이 붙은 응답을 파싱한다.
- API 키가 응답 본문·오류 문구에 없다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run api src/ai
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - API 키를 `process.env`에서만 읽는가?
   - 재시도가 없는가?
   - 클라이언트와 서버가 같은 안전 판정 함수를 쓰는가?
3. `phases/8-interpreter/index.json`의 step 7을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 실제 Anthropic API를 부르지 마라. 이유: 키가 없고 비용이 든다. 가짜 fetch만 쓴다.
- 응답에 API 키나 원문 오류 본문을 싣지 마라. 이유: CLAUDE.md 키 규칙.
- 기존 테스트를 깨뜨리지 마라(과잉 거부를 기대하던 테스트는 새 규칙으로 고친다).
