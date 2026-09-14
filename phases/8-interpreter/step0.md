# Step 0: context-rosters

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` (AI, 효과)
- `/docs/ADR.md` (ADR-003, ADR-013)
- `src/types/domain.ts` (`PromptContext`, `SceneContext`)
- `src/game/scene.ts`, `src/game/scene.test.ts` (`buildSceneSetup`가 `promptContext`를 만든다)
- `src/ai/prompts.ts`, `src/ai/rules.ts`, `src/ai/test-helpers.ts` (PromptContext를 쓰는 곳)
- `src/types/data.ts` (`CoreData.players`, `SceneRecord.lineups`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 배경

해석기가 "누구 이야기인가"를 알려면 두 팀 타순을 팀별로 알아야 한다. 장면 밖 선수 이름도 알아야 한다. 지금 `PromptContext.lineupNames`는 두 팀 이름이 섞인 문자열 배열이다. 그래서 수비 팀 선수 이야기가 지금 타자에게 적용됐다(감사: 상대 팀 선수의 잠 부족이 공격 팀 타자 집중력▼로 들어감).

## 작업

### `src/types/domain.ts`
```ts
export interface RosterEntry {
  id: string;
  name: string;
  /** 타순 1~9 */
  slot: number;
}

export interface KnownPlayer {
  name: string;
  /** 팀 이름(PromptContext.battingTeam/fieldingTeam과 같은 표기) */
  team: string;
  kind: 'H' | 'P';
}

// PromptContext에 필드 추가 (기존 필드는 유지)
battingLineup: RosterEntry[];
fieldingLineup: RosterEntry[];
/** 장면 두 팀 타순·투수 밖의 데이터 선수(이름 인식용) */
otherPlayers: KnownPlayer[];
```

### `src/game/scene.ts`
- `buildSceneSetup`이 장면 시점 공격·수비 팀 타순으로 `battingLineup`·`fieldingLineup`을 채운다. 선수 기록이 없으면 이름은 id다.
- `otherPlayers`는 `core.players` 중 두 타순과 장면 투수를 뺀 선수들이다. `team`은 팀 코드를 장면 팀 이름 표기로 바꾼다(장면 두 팀이 아니면 `src/domain/teams.ts` 이름).
- `lineupNames`는 호환을 위해 그대로 둔다.

### 테스트
- `scene.test.ts`에서 확인할 것:
  - 공격·수비 타순이 팀별로 나뉜다.
  - slot이 1~9다.
  - `otherPlayers`에 타순 선수·장면 투수가 없다.
  - 팀 이름 표기가 맞다.
- `src/ai/test-helpers.ts`의 PromptContext 픽스처에 새 필드를 가상 이름으로 채운다. 기존 AI 테스트가 그대로 통과해야 한다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/game src/ai
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - `src/types`에는 타입만 있는가?
   - `src/game`·`src/ai`가 순수 모듈인가?
   - 기존 필드를 지우지 않았는가?
3. `phases/8-interpreter/index.json`의 step 0을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 해석 규칙(`rules.ts`)·프롬프트 동작을 바꾸지 마라. 이유: 다음 step들의 범위다. 이번 step은 컨텍스트만 넓힌다.
- 테스트 픽스처에 실존 선수 이름을 쓰지 마라. 이유: 공개 저장소(CLAUDE.md).
- 기존 테스트를 깨뜨리지 마라.
