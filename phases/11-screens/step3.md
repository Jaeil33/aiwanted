# Step 3: tmi-sheet

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/PRD.md` (핵심 기능 2·4·7), `/docs/UI_GUIDE.md` (TMI 시트, 움직임, 문구)
- `/docs/ADR.md` (ADR-003, ADR-009, ADR-011, ADR-013)
- `docs/design/nightgame/index.html`·`style.css`·`app.mjs` (화면 3 TMI 카드 — 시각 기준, import 금지)
- `src/app/screens/PlayScreen.tsx` (step 2: 임시 TMI 시트, TMI 칸), `src/app/GameProvider.tsx` (`submitTmi`, `judge`, `removeTmi`, `setMode`, `dismissRefusal`)
- `src/game/session.ts` (8-interpreter step 8: `refusal`), `src/game/selectors.ts` (`entryChips`, `battingWin`), `src/game/effects.ts`, `src/game/engineClient.ts`
- `src/components/TmiComposer.tsx`, `InterpretationCard.tsx` (기존 동작 참고 — 이 step에서 대체)
- 9-ui-system 컴포넌트: `Sheet`, `FoilFrame`, `Chip`, `Tabs`, `Button`; `src/domain/format.ts`, `src/domain/knobs.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

### `src/app/useCardEffects.ts`
```ts
/** TMI 카드마다 그 카드 효과만 넣었을 때 장면 시작 상태의 공격 팀 승리확률 전·후(0~1) */
export function useCardEffects(): ReadonlyMap<string, { before: number; after: number } | null>;
```
- base는 효과 없음·현실 모드이고, 카드별로는 `compileSessionEffects([entry])`에 현재 모드를 쓴다.
- 엔진 클라이언트 캐시를 쓴다. 카드가 바뀌면 옛 결과를 버린다. 거부 카드는 계산하지 않는다.

### `src/components/TmiCard.tsx`
```tsx
export function TmiCard(props: {
  entry: TmiEntry;
  chips: EntryChip[];
  teamName: string;                                   // 공격 팀 이름
  effect: { before: number; after: number } | null;   // null이면 "계산 중…"
  verdict: VerdictResult | null;
  judging: boolean; canJudge: boolean; canRemove: boolean;
  onJudge(): void; onRemove(): void;
  flipKey: number;                                    // 바뀌면 뒤집기 재생
}): JSX.Element;
```
- 크기 312×344px(최대 폭 100%). `FoilFrame`의 등급은 가장 강한 근거(measured > plausible > fun)다.
- 카드 순서:
  1. 머리: "TMI 카드 · AI 해석/규칙 해석"과 등급 칩
  2. 인용 문장
  3. 효과 행: 파트마다 아이콘(손잡이 who별 인라인 SVG), "투수 체력 ▼", 대상 이름표, 세기 7칸 막대. 실측 파트는 "기온 35°C"
  4. 효과: "<팀> 승리확률 전% → 후%"와 큰 %p(`formatDeltaPp`, 카운트업 700ms)
  5. 이유 한 줄과 "진짜야?"
- 판정이 오면 카드 아래에 판정 칩(진짜 효과·애매해요·쓸모없음·잴 수 없음), 헤드라인, 본문, 출처 라벨을 펼친다.
- "빼기"는 텍스트 버튼이다(접근 이름 "“문장” 빼기").
- 뒤집기: 뒷면("TMI" 표시)에서 앞면으로 `rotateY` 850ms. 동작 줄이기면 없다.

### `src/components/RefusalCard.tsx`
- `{ text, reason, onDismiss }`. `--out` 1px 테두리, 인용 문장, 거부 이유, 바꿔 볼 예시 칩 3개(음식·잠·날씨), "닫기".

### `src/app/screens/TmiSheet.tsx` (앱 계층, `useGame` 사용)
- `Sheet`(dimStage)를 쓴다. 제목은 "TMI 걸기"다.
- **머리**: 작은 승률 판. 공격 팀 승리확률 TMI 없음 → TMI 전부, 변화 칩, 모드 칩.
- **카드**: `session.refusal`이 있으면 `RefusalCard`를 맨 위에 둔다. 그 아래 TMI 카드는 최신이 위다.
- **입력 줄**:
  - 라벨 "TMI 한 줄", `maxLength` 80, 글자 16px, 버튼 "TMI 걸기", "카드 N / 3", "N / 80자"
  - 제출은 해석 중이 아니고 편집 가능하며 3장 미만일 때만 한다.
  - 입력은 새 카드가 실제로 추가됐을 때만 비운다. 거부·실패면 그대로 둔다.
  - 해석 중이면 버튼은 "해석 중…"이고 카드 자리에 "카드를 뽑는 중…"(스피너 없음)을 둔다.
  - 첫 공 뒤(잠김)에는 입력·예시·모드를 잠그고 "처음부터 다시 하면 TMI를 바꿀 수 있어요."를 띄운다.
- **예시 칩**(가로 스크롤): 기존 예시 규칙(투수·타자 이름 조사)을 따르고, 누르면 입력만 채운다.
- **모드**: `Tabs` 현실 / 만화(6배). 만화면 toon 칩 "효과 6배 과장".
- **알림**: `session.notice`를 aria-live 한 줄로 보여준다.

### `src/app/screens/PlayScreen.tsx`
- 임시 시트 구성을 `TmiSheet`로 바꾼다.
- TMI 칸에 `useCardEffects`의 %p를 채운다.

### 테스트
- **TmiCard**: 등급 테두리, 파트 행(손잡이·실측), 효과 %p, 계산 중, 판정 펼침, 빼기 접근 이름, flipKey 재생 클래스.
- **RefusalCard**: 이유·닫기.
- **useCardEffects**: 카드별 평가, 모드 변경, 거부 제외.
- **TmiSheet**:
  - 제출 성공 시 입력 비움, 거부 시 입력 유지와 RefusalCard
  - 3장 제한, 잠김 문구, 해석 중 표시, 예시 칩, 모드 전환, 알림
- **PlayScreen**: 칸의 %p.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/app src/components src/game
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - 카드의 모든 숫자가 엔진 평가·evidence에서 오는가?
   - AI/규칙 출처 라벨과 근거 등급·모드가 보이는가?
   - 입력이 거부 뒤에 남는가?
3. `phases/11-screens/index.json`의 step 3을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- AI 응답의 숫자를 카드에 쓰지 마라. 이유: CLAUDE.md(확률은 엔진).
- "AI 해석" 라벨을 규칙 결과에 붙이지 마라. 이유: 제출물 허위 표기 위험(ADR-003).
- 옛 `TmiComposer`·`InterpretationCard` 파일을 지우지 마라. 이유: step 5에서 한꺼번에 정리한다.
- 기존 테스트를 깨뜨리지 마라.
