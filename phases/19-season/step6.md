# Step 6: pa-session

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ARCHITECTURE.md`(상태 관리), `/docs/ADR.md`(ADR-013, ADR-014, ADR-016, ADR-032)
- `src/game/session.ts`와 테스트, `src/app/GameProvider.tsx`와 테스트, `src/game/situation.ts`(step 5)
- `phases/13-situation/step2.md`(이 step이 흡수한 원안)

테스트를 먼저 쓴다.

## 원안에서 달라지는 것

원안은 `paSession.ts`를 **새 reducer로** 만들고 16-broadcast-ui가 화면을 옮기는 그림이었다.
step 5와 같은 이유로 뒤집는다: 세션이 `sceneId` 대신 `Situation`을 들게 고친다. reducer는 한 벌만 남는다.

`headline.ts`에 `oddsHeadline`·`winLine`·`toonLine`을 새로 만들지 않는다. 같은 일을
`src/game/broadcast.ts`(`tierReadout`, 경기·이닝·타석 3단)가 이미 하고 있고, 새 화면도 그 판을 그대로 쓴다.
두 벌을 만들면 어느 쪽이 맞는지 알 수 없게 된다. `thousandSplit`은 `result.ts`의 `splitThousand`가 이미 있다.

## 작업

### `src/game/session.ts`
- `sceneId: string | null` → `situation: Situation | null` + `extra: SituationExtra`.
- `openScene` → `openSituation { situation, extra?, seed, tmis?, mode? }`. 시작 상태는 `situation.state`.
- `resetPlay`에서 `startState`를 뺀다(세션이 상황을 들고 있다).

### `src/app/GameProvider.tsx`
- `setup`은 `buildSituationSetup(data.core, session.situation, session.extra)`.
- `actions.openSituation(situation, extra, share)` 추가. `openScene(sceneId, share)`는 장면을 상황으로 바꿔 그걸 부르는 다리로 남긴다(step 10에서 삭제).
- 해석·판정 프롬프트 맥락도 열린 상황에서 만든다(`data.scenes`를 다시 뒤지지 않는다).

### `src/game/paList.ts` (새 파일, 순수)
```ts
export function paList(game: LiveGame, opts?: { highlights?: number }): PaListRow[];
export function halfBlocks(rows): HalfBlock[];
export function gamesOfTeam(games, team: TeamCode | null): GameSummary[];
export function gamesByDate(games): DateGroup[];
```
- `PaListRow`에 **실제 결과 문장을 담지 않는다**. 목록에서 결과를 보여 주면 되돌려볼 재미가 없다(플레이 화면도 실제 결과를 숨긴다).
- 추천 승부처는 네이버 승리확률이 그 타석에서 움직인 폭으로 고르되 **그 숫자는 내보내지 않는다**(ADR-014: 고르기에만 쓴다). 같은 폭이면 앞선 타석이 먼저다.
- 승리확률을 모르는 타석은 고르지 않는다.

## Acceptance Criteria

- `npm run test`·`npx tsc -b`·`npm run lint`·`npm run build` 통과, 기존 테스트 수가 줄지 않는다.
- 화면 동작이 그대로다(App·PlayScreen·ResultScreen·GameProvider 테스트).

## 금지사항

- 확률 판 파생 값을 두 벌로 만들지 마라(`broadcast.ts` 하나만 쓴다).
- 승부처 지수를 화면에 내보내지 마라(ADR-014).
- 이어서 플레이 규칙(`canEditTmi` 완화·pa 효과 범위)은 여기서 건드리지 마라. step 8이다.
