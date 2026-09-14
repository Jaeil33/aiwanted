# Step 2: safety-v2

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (실존 선수 민감 TMI 거부 규칙)
- `/docs/ADR.md` (ADR-003, ADR-005, ADR-013)
- `/docs/UI_GUIDE.md` (문구: 거부)
- `src/ai/safety.ts`, `src/ai/safety.test.ts`
- `src/ai/text.ts` (step 1: `prepareText`)
- `src/types/domain.ts` (step 0: `PromptContext.battingLineup`·`fieldingLineup`·`otherPlayers`)
- `src/ai/interpret.ts`, `api/_lib/handlers.ts` (`checkSensitive`를 쓰는 곳 — 이번 step에서는 호환 함수만 유지)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 배경 (감사 결과, 메인 세션이 재확인함)

지금 `checkSensitive`는 부분 문자열 목록으로 판정해서 두 방향 모두 틀린다.

- **과잉 거부**: "관중이 맥주를 마셨다", "마약김밥 먹고 왔다", "자살 스퀴즈 사인이 나왔다", "타격감이 죽었다", "이별 노래가 등장곡이다", "벙어리장갑을 끼고 왔다"를 막는다.
- **거부 누락**: 선수의 감기 몸살과 체온, 전날 소주, 승부조작 의혹, 가족 사망은 통과시킨다.

## 작업

### `src/ai/safety.ts`
```ts
export type SafetyLevel = 'block' | 'review' | 'allow';
export type SensitiveCategory =
  | 'crime' | 'alcohol' | 'gambling' | 'violence' | 'drugs'
  | 'illness' | 'injury' | 'death' | 'privacy' | 'sexual' | 'slur';

export interface SafetyAssessment {
  level: SafetyLevel;
  category: SensitiveCategory | null;
  /** 사용자에게 보일 문구(allow면 빈 문자열) */
  reason: string;
  /** 판정에 쓴 표현(디버그·테스트용) */
  matched: string | null;
}

export function assessSafety(prepared: PreparedText, ctx: PromptContext | null): SafetyAssessment;

/** 호환: assessSafety(prepareText(text), null).level === 'block' */
export function checkSensitive(text: string): { blocked: boolean; reason: string };
```

규칙:
1. **범주 사전**: 어간·활용·은어·영어를 담는다. 판단은 단어 경계와 문맥으로 하고, 부분 문자열만으로 막지 않는다. 범주별 예:
   - 음주: 소주·맥주·폭탄주·과음·술자리·숙취·취했다
   - 도박·범죄: 도박·토토·승부조작·음주운전·체포·전과
   - 약물: 마약·대마
   - 폭력: 폭행·학폭
   - 질병: 감기·몸살·코로나·암·우울증·공황장애, 약 복용, 체온 "열이 N도"
   - 부상: 인대·햄스트링·골절·담 걸림·통증
   - 사망: 사망·돌아가셨다·부고
   - 사생활: 연애·열애·여자친구·남자친구·이혼·모텔·집 주소
   - 성적 내용
   - 비하: 욕설·혐오 표현. 초성 욕설 포함
2. **허용 관용구·사물**(먼저 확인): 마약김밥, 마약떡볶이, 자살 스퀴즈, 타격감이 죽었다, 구위가 죽었다, 방망이가 죽었다, 이별 노래, 누드김밥, 벙어리장갑, 대머리독수리, 등신대, "도박 같은"(비유).
3. **주체 확인**:
   - 사람: 장면 선수·`otherPlayers` 이름(성+이름, 이름만, "성+선수"), 선수·스태프 역할어(투수, 타자, 선수, 포수, 감독, 코치), 선수 가족(어머니, 아내 등)
   - 사람이 아닌 주체: 관중·팬·치어리더·캐스터, 동물·반려동물, 음식, 사물
4. **판정**:
   - 민감어가 사람 주체에 걸리면 block이다.
   - 비하 표현은 주체와 상관없이 block이다.
   - 민감어가 사람이 아닌 주체에만 걸리면 allow다(예: "관중이 맥주를 마셨다", "반려견이 아프다").
   - 민감어가 있는데 주체를 모르면 review다(예: 주어 없는 "어젯밤 소주 3병").
5. **문구**: UI_GUIDE를 따른다. block은 "선수 건강·사생활·범죄 이야기는 계산하지 않아요. 음식·잠·날씨·징크스로 바꿔 보세요."를 쓰고, 비하는 "사람을 깎아내리는 말은 계산하지 않아요."를 쓴다.
6. `ctx`가 null이면 이름 목록 없이 역할어·가족어만으로 주체를 판단한다.

### 테스트 (`src/ai/safety.test.ts` 다시 쓰기)
- 가상 이름 컨텍스트(김타자, 박투수, 최수비)로 확인할 것:
  - 범주별 block 사례 3개 이상
  - 허용 관용구 전부
  - 사람 아닌 주체 allow 사례 8개 이상
  - 주체 불명 review 사례
  - 비하 block
- 체온("열이 39도") vs 날씨("기온 39도"). 날씨는 allow다.
- `checkSensitive` 호환 결과
- "키우던 강아지가 죽었다"는 이제 allow다. 기존 테스트의 이 기대를 바꾼다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/ai
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - `src/ai`가 순수 모듈인가?
   - 실존 선수 이름이 테스트에 없는가?
   - CLAUDE.md의 거부 범주(범죄·음주·도박·폭력·질병·부상·사망·사생활·성적 내용·비하)를 모두 덮는가?
3. `phases/8-interpreter/index.json`의 step 2를 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- `interpret.ts`·`api/`의 호출 흐름을 바꾸지 마라. 이유: step 6·7에서 review 흐름과 함께 바꾼다. 이번 step은 `checkSensitive` 호환만 유지한다.
- 테스트·사전 주석에 실존 선수 이름과 민감한 문장을 함께 쓰지 마라. 이유: 공개 저장소.
- 부분 문자열 하나만으로 block하지 마라. 이유: 과잉 거부(마약김밥, 자살 스퀴즈)가 감사에서 확인됐다.
- 기존 테스트를 깨뜨리지 마라(safety 기대값을 바꾸는 것은 이 step의 목적이므로 허용).
