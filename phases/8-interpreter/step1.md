# Step 1: text-prep

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` (AI)
- `/docs/ADR.md` (ADR-013)
- `src/ai/rules.ts`, `src/ai/safety.ts`, `src/ai/interpret.ts` (`clipTmi`), `src/ai/normalize.ts` (`stripControl`)
- `src/ai/index.ts`, `src/ai/index.test.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 배경

감사에서 "비 옴", "it's raining", "ㅈㄴ 피곤", "짜장면 머거따", "커피 5잔", "3시간 잤다"가 모두 효과 없음이었다. 규칙이 원문 글자 그대로만 비교했기 때문이다.

## 작업

### `src/ai/text.ts` (새 파일, 순수)
```ts
export type NumberUnit = 'hour' | 'minute' | 'cup' | 'bottle' | 'bowl' | 'celsius' | 'km' | 'ms' | 'count' | 'percent' | 'day';

export interface NumberMention {
  value: number;
  unit: NumberUnit | null;
  /** 원문에서 찾은 글자 그대로 */
  raw: string;
}

export interface Clause {
  /** 정리된 절 문장 */
  text: string;
  /** 이 절의 주어로 보이는 말(없으면 null) — 대상 추론(step 3)이 쓴다 */
  subjectHint: string | null;
}

export interface PreparedText {
  original: string;
  /** 정리된 전체 문장 */
  normalized: string;
  /** 강도 표시(ㅈㄴ, 개-, 완전, 존나 등)를 찾았을 때 1(살짝)·2(강하게), 없으면 0 */
  intensity: 0 | 1 | 2;
  /** 영어·이모지·초성·오타를 한국어 개념어로 바꿔 덧붙인 토큰(사전 매칭용) */
  tokens: string[];
  numbers: NumberMention[];
  /** 최대 3개 */
  clauses: Clause[];
}

export function prepareText(input: string): PreparedText;
```

규칙:
- **정규화**: 제어 문자 제거, NFKC, 전각 숫자·문자는 반각으로, 유니코드 마이너스(U+2212)는 `-`로, 라틴 문자는 소문자로, 공백은 하나로 줄인다.
- **반복 줄이기**: 같은 글자 3번 이상은 2번으로 줄인다("ㅋㅋㅋㅋ" → "ㅋㅋ").
- **초성·구어·오타 사전**: 모듈 안 데이터 표로 둔다(예: ㅈㄴ·존나·개(접두)·완전·핵 → 강도 2, 살짝·조금·약간 → 강도 1, 머거따→먹었다, 곱배기→곱빼기, 잠못잠→잠 못 잠, 넘→너무).
- **영어·이모지 사전**: 한국어 개념어 토큰을 만든다(coffee→커피, beer→맥주, rain/raining→비, hot→더위, cold→추위, tired/sleepy→피곤, slept→잠, ramen→라면, 🌧️☔→비, 🔥→뜨거움, 😴→졸림, 🍜→라면, 🍺→맥주, 🍗→치킨, ⚾→야구). 개념 사전(step 4)이 쓸 토큰이라 대표 한국어 한 단어로 통일한다.
- **숫자와 단위**: "3시간", "5잔", "소주 2병", "35도", "35°C", "5m/s", "400km", "3일", "80%"에서 값과 단위를 뽑는다. 체온 문맥("열이 39도")은 `celsius`로 두되 raw에 "열"이 포함되게 해서 안전 판정이 구분할 수 있게 한다.
- **절 나누기**: 쉼표, "그리고", "는데", "+", "&", ";", 연결 어미 "~고 "(예: "먹고 ")를 기준으로 최대 3개로 나눈다. 넘치면 마지막 절에 합친다. 주어("~는/은/이/가" 앞 명사)가 없는 절은 앞 절의 subjectHint를 이어받는다.
- 입력이 공백뿐이면 빈 문장·빈 절을 돌려준다(예외를 던지지 않는다).
- `src/ai/index.ts`에서 `prepareText`와 타입을 내보내고 `index.test.ts`를 갱신한다.

### 테스트 (`src/ai/text.test.ts`)
- 정규화: 전각, 유니코드 마이너스, 반복, 대소문자
- 강도 0·1·2
- 영어·이모지·초성·오타 토큰
- 숫자 단위 10종 이상
- 절 나누기와 주어 이어받기(최대 3)
- 공백 입력
- 80자 문장 성능: 1,000번 호출이 200ms 안에 끝난다

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/ai
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - `src/ai`가 순수 모듈인가(DOM·fetch·타이머·Math.random 없음)?
   - 기존 `rules.ts` 동작을 바꾸지 않았는가?
3. `phases/8-interpreter/index.json`의 step 1을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 이 step에서 `rules.ts`·`safety.ts`를 고치지 마라. 이유: 다음 step에서 새 모듈을 조립한다.
- 형태소 분석기 같은 새 패키지를 설치하지 마라. 이유: ADR-007 허용 의존성. 사전과 정규식으로 한다.
- 테스트에 실존 선수 이름을 쓰지 마라. 이유: 공개 저장소.
- 기존 테스트를 깨뜨리지 마라.
