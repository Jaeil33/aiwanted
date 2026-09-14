# Step 4: lexicon

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ADR.md` (ADR-003, ADR-004, ADR-013)
- `src/domain/knobs.ts` (`KNOB_META`의 who·hint, `SUBJECTS_FOR`), `src/domain/measured.json`
- `src/types/domain.ts` (`KnobId`, `Subject`, `Scope`, `Evidence`, `MeasuredId`)
- `src/ai/text.ts` (step 1: `PreparedText`, `Clause`, `NumberUnit`)
- `src/ai/rules.ts` (지금 규칙 목록 — 옮길 개념 참고), `reference/tmi-prototype/app.js` 31~34행(빠졌던 맞바람·습도·조명 규칙, 읽기만)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 배경 (감사)

지금 규칙은 손잡이 14개 중 6개만 쓴다. power·eye·speed·stuff·defense는 한 번도 나오지 않는다. 부정어("피곤하지 않다")와 은어("물방망이")의 방향도 무시한다.

## 작업

### `src/ai/lexicon.ts` (새 파일, 순수 데이터 + 매칭)
```ts
export interface Concept {
  id: string;                 // 예: 'food-heavy', 'sleep-short', 'slang-wet-bat'
  category: ConceptCategory;  // 'food' | 'sleep' | 'mood' | 'gear' | 'jinx' | 'family' | 'travel' | 'weather' | 'crowd' | 'command' | 'slang' | 'body' | 'luck'
  patterns: readonly RegExp[];  // 정리된 문장·토큰에서 찾는다
  knob: KnobId;
  defaultSubject: Subject;      // SUBJECTS_FOR[KNOB_META[knob].who]에 들어 있어야 한다
  strength: 1 | 2 | -1 | -2;    // 긍정 문장일 때 세기
  negation: 'flip' | 'cancel';  // 부정어가 붙으면 방향을 뒤집을지 효과를 없앨지
  evidence: 'plausible' | 'fun';
  scope: Scope;
  measured?: { variable: MeasuredId; defaultValue: number; unit?: NumberUnit };
  comment: string;              // 템플릿: {what} 찾은 표현, {who} 대상 이름표
  why: string;                  // 60자 이하
}

export interface ConceptMatch {
  concept: Concept;
  matched: string;
  negated: boolean;
}

export const CONCEPTS: readonly Concept[];
export function matchConcepts(clause: Clause, prepared: PreparedText): ConceptMatch[];
/** 긍정 1, 부정 -1, 모름 0 (대체 해석용 분위기 사전) */
export function sentimentOf(text: string): -1 | 0 | 1;
```

사전 범위(최소 기준):
- **손잡이 14개 모두**: 개념 3개 이상, 전체 70개 이상.
- **음식**: 과식·곱빼기, 매운 음식, 커피·에너지 음료, 보양식, 굶음, 라면·치킨·피자 같은 야식.
- **잠**: 못 잠·설침·밤샘, 푹 잠·숙면, 낮잠.
- **기분**: 설렘, 긴장, 화남, 자신감, 들뜸.
- **장비**: 새 배트, 새 글러브, 새 신발, 새 유니폼, 헬멧.
- **징크스**: 속옷, 면도·수염, 루틴, 부적.
- **가족**: 출산, 생일, 응원 편지.
- **이동**: 버스·비행기·원정길. `travel_km`으로 잇는다.
- **날씨·환경**: 비·장마 → `rain_pre3h`/slick, 강풍·바람 → `wind_ms`/carry, 폭염·더위·기온 → `temp_c`/carry, 추위, 습도 → slick, 미세먼지·안개·조명·햇빛·석양 → glare.
- **응원**: 떼창, 만원 관중, 야유, 응원가.
- **명령**:
  - 홈런 쳐 → power▲ 타자
  - 안타 쳐 → contact▲
  - 볼넷 골라 → eye▲
  - 도루해 → speed▲
  - 삼진 잡아 → stuff▲ 투수
  - 제구 잡아 → control▲
  - 수비 잘해 → defense▲
- **은어**:
  - 물방망이 → contact▼
  - 불방망이 → power▲
  - 유리멘탈·새가슴 → nerve▼, 강철멘탈 → nerve▲
  - 칼제구 → control▲, 난조 → control▼
  - 광속구 → stuff▲
  - 발야구 → speed▲
  - 철벽 수비 → defense▲
- **몸 상태(민감하지 않은 것만)**: 피곤·졸림 → stamina/focus▼, 컨디션 최고 → ▲, 몸이 무거움 → ▼, 땀 → slick.
- **운**: 로또·행운·징조 → mood.

규칙:
- 부정어(안·못·않·없·전혀·아니)는 매칭 표현 앞뒤 6글자 안에서 찾는다. "못 잤다"처럼 개념 자체에 부정이 들어간 패턴은 부정으로 세지 않는다.
- 한 절에서 같은 개념은 한 번만 센다. 서로 다른 개념은 여러 개 돌려준다(매칭 위치 순서).
- 모든 `defaultSubject`는 해당 손잡이의 `SUBJECTS_FOR` 안에 있어야 한다. 테스트로 강제한다.
- 실측 개념의 `variable`은 `measured.json`에서 `applicable: true`인 id만 쓴다.

### 테스트 (`src/ai/lexicon.test.ts`)
- 손잡이별 개념 수 3개 이상, 전체 70개 이상.
- 모든 개념의 대상·실측 변수가 유효하다.
- 대표 문장 60개 이상에서 개념이 매칭된다(영어·이모지 토큰 포함, 가상 이름).
- 부정어 flip·cancel.
- 은어 방향.
- 분위기 사전 긍정·부정·모름.
- 결정성.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/ai
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - 사전이 확률 숫자를 담지 않는가(세기·실측 입력값만)?
   - `src/ai`가 순수 모듈인가?
3. `phases/8-interpreter/index.json`의 step 4를 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"` (개념 수, 손잡이별 분포 포함)
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 민감 주제(음주·질병·부상·사생활 등)를 개념으로 넣지 마라. 이유: 안전 판정(step 2)이 먼저 거른다. 사전에 있으면 거부 누락처럼 보인다.
- `rules.ts`를 고치지 마라. 이유: step 5에서 조립한다.
- 테스트에 실존 선수 이름을 쓰지 마라. 이유: 공개 저장소.
- 기존 테스트를 깨뜨리지 마라.
