# Step 3: targets

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` (효과: 대상 확정)
- `/docs/ADR.md` (ADR-003, ADR-013)
- `src/types/domain.ts` (`Subject`, `PromptContext`의 `battingLineup`·`fieldingLineup`·`otherPlayers` — step 0)
- `src/ai/text.ts` (step 1: `PreparedText`, `Clause.subjectHint`)
- `src/ai/rules.ts` (지금의 대상 판단 `:160-184` 근처), `src/engine/effects.ts` (Subject를 선수·진영에 적용하는 방식)
- `src/domain/teams.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 배경 (감사)

지금 대상 판단은 "문장에 투수 단어가 있으면 투수, 없으면 타자" 한 줄이라 여러 경우가 틀린다.

- **역할어·질문 오판**: "주심이 잠을 설쳤다", "코치가 짜장면", "짜장면 먹으면 못 던져?"가 모두 타자▼가 됐다.
- **수비 팀 선수 오판**: 수비 팀 선수 이야기가 지금 타자에게 적용됐다.
- **응원 방향 오판**: 원정 팬 응원가가 홈팀▲가 됐다.
- **받는 사람 오판**: 다른 팀 선수가 보낸 응원 문자가 상대 팀▲가 됐다.

## 작업

### `src/ai/targets.ts` (새 파일, 순수)
```ts
export interface TargetResolution {
  subject: Subject;
  /** 해설에 쓸 이름표. 예: "김타자", "박투수", "원정 팀", "주심" */
  label: string;
  via: 'name' | 'recipient' | 'lineup' | 'role' | 'team' | 'verb' | 'default';
  /** 지금 타자·투수 개인이 아니라 팀 전체에만 반영해야 하는 경우 true */
  teamOnly: boolean;
}

export function resolveTarget(clause: Clause, prepared: PreparedText, ctx: PromptContext): TargetResolution;
```

판단 순서(먼저 걸린 것이 이긴다). 절의 `subjectHint`를 먼저 보고, 없으면 절 전체를 본다.

1. **받는 사람**: "X에게/X한테/X 위해" 꼴에서 X가 장면 사람이면 X가 대상이다(via 'recipient'). 보내는 사람은 무시한다.
2. **이름**: 지금 타자·투수의 성+이름, 이름만(두 글자 이상), "성+선수"(장면에서 유일할 때만)는 batter·pitcher다.
3. **타순**:
   - 공격 팀 타순의 다른 선수는 battingTeam(teamOnly)이다.
   - 수비 팀 타순 선수는 fieldingTeam(teamOnly)이다.
   - `otherPlayers` 선수는 그 팀이 장면 팀이면 그 팀(teamOnly)이다. 장면 밖 팀이면 다음 규칙으로 넘어간다.
4. **역할어**:
   - 투수·선발·마무리·불펜·에이스는 pitcher다.
   - 타자·대타·타석에 선 사람은 batter다.
   - 포수·유격수·내야수·외야수·수비는 fieldingTeam이다.
   - 팀을 밝히지 않은 감독·코치·벤치는 battingTeam으로 보고 이름표를 "공격 팀 벤치"로 한다.
   - 주심·심판·캐스터·해설은 everyone이다.
   - 관중·팬·응원단·치어리더는 홈 팀이다. "원정 팬·원정 응원단"은 원정 팀이다. 홈·원정을 battingTeam·fieldingTeam으로 바꿀 때는 `ctx.battingTeam`과 `ctx.homeName`을 비교한다.
   - 선수 가족("투수 어머니", "타자 아내")은 그 선수다.
5. **팀 이름·별칭 사전**: 10개 구단의 공식 이름·영문·별명을 둔다(예: LG·엘지·쌍둥이, KIA·기아·타이거즈·호랑이, 롯데·자이언츠·거인, 한화·이글스·독수리, 두산·베어스·곰, 삼성·라이온즈·사자, SSG·랜더스, KT·위즈·마법사, NC·다이노스·공룡, 키움·히어로즈·영웅). 장면 두 팀이면 그 팀(teamOnly)이고, 아니면 everyone이다.
6. **동사 단서**:
   - 던지다·투구·구속·볼넷 내주다는 pitcher다.
   - 치다·스윙·타격·홈런 치다는 batter다.
   - 달리다·도루는 batter다.
   - 잡다·실책·송구는 fieldingTeam이다.
7. **기본값**: batter(via 'default')다.

### 테스트 (`src/ai/targets.test.ts`)
- 가상 컨텍스트: 원정 공격, 공격 타순 9명·수비 타순 9명, 다른 팀 선수 3명.
- 규칙마다 2개 이상 사례를 둔다. 받는 사람 규칙이 이름 규칙보다 먼저 걸리는 사례도 넣는다.
- 홈 공격 컨텍스트에서 관중·원정 팬 방향이 뒤집히는지 확인한다.
- 절 두 개에서 주어 이어받기를 확인한다.

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
   - Subject 값이 `src/types/domain.ts`의 다섯 가지뿐인가?
   - 테스트에 실존 선수 이름이 없는가?
3. `phases/8-interpreter/index.json`의 step 3을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- `rules.ts`를 고치지 마라. 이유: step 5에서 조립한다.
- 엔진(`src/engine/effects.ts`)의 Subject 적용 규칙을 바꾸지 마라. 이유: 확률 계산 계약이다(ADR-003).
- 테스트에 실존 선수 이름을 쓰지 마라. 이유: 공개 저장소.
- 기존 테스트를 깨뜨리지 마라.
