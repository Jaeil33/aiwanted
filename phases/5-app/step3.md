# Step 3: play-panels

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/UI_GUIDE.md` (전부)
- `/docs/PRD.md` (핵심 기능 2~5)
- `/docs/ADR.md` (ADR-009 만화 모드 라벨)
- 이전 step 산출물: `src/app/App.tsx`, `App.module.css`, `src/app/GameProvider.tsx`, `src/components/SceneCard.tsx`(스타일 방식 참고), `src/game/selectors.ts`(`TierView`, `entryChips`), `src/game/session.ts`(`PlayLogEntry`)
- 계약: `src/types/domain.ts`(`TmiEntry`, `VerdictResult`, `Mode`, `Evidence`), `src/domain/format.ts`, `src/domain/teams.ts`

이 step은 **표시 컴포넌트만** 만든다. 컴포넌트는 props로 받은 값만 그리고, 상태·엔진·AI를 직접 부르지 않는다. 각 컴포넌트는 `src/components/<이름>.tsx` + `<이름>.module.css` + `<이름>.test.tsx`(먼저).

## 작업

### `Scorebug`
- props: `{ awayName; homeName; awayColor; homeColor; awayScore; homeScore; inning; half: Half; outs; balls; strikes; bases: Bases }`
- 전광판 숫자(점수·B·S·O)는 `--led-font`, 팀 이름 옆 팀 컬러 막대, 초·말 삼각형, 아웃 점 3개, `BasesDiamond`(SVG, 채워진 루는 `--led`).
- 스크린리더용 한 문장: "9회말 2아웃, 주자 만루, 볼 1 스트라이크 2, KIA 4 대 롯데 4".

### `BasesDiamond`
- props `{ bases: Bases; size?: number }` — SVG 마름모 3개, `aria-hidden`.

### `ProbabilityTiers`
- props: `{ tiers: TierView[]; mode: Mode; tones: Array<Evidence | 'refused'>; pending: boolean; batColor: string; fldColor: string }`
- 머리: 모드 칩(`MODE_LABEL`, 만화 모드는 UI_GUIDE의 주황 점선 칩과 "효과 6배 과장" 문구)과 근거 등급 칩(tones 중복 제거, `EVIDENCE_LABEL`).
- 줄마다: 제목, 좌·우 라벨과 퍼센트(`formatPct`), 좌·우 비율 막대(공격 색 | 수비 색, 폭 전환 300ms), 변화 칩(`deltaText`, 양수 `--ball`, 음수 `--out`, 0은 `--chalk-3`), extra 문구.
- `pending`이면 막대는 두고 "계산 중…" 텍스트를 붙인다(스피너 금지).

### `ModeToggle`
- props: `{ mode: Mode; disabled: boolean; onChange(mode: Mode): void }` — 라디오 그룹 두 개("현실 모드", "만화 모드"), 아래 설명: 현실 "추정·설정 크기 그대로 계산해요", 만화 "효과를 6배로 과장해요. 재미용이에요".

### `TmiComposer`
- props: `{ examples: string[]; disabled: boolean; locked: boolean; busy: boolean; count: number; max: number; notice: string; onSubmit(text: string): void }`
- 입력(`maxLength` 80, 16px, 남은 글자 수 "80자 중 12자"), 예시 칩(누르면 입력에 채움), 버튼 "TMI 걸기"(빈 입력·busy·locked·count ≥ max면 비활성), busy면 버튼 옆 "해석 중…".
- locked면 "처음부터 다시 하면 TMI를 바꿀 수 있어요." 안내. notice는 `aria-live="polite"` 줄.
- 제출하면 입력을 비운다. `<label>`과 `id`를 갖춘다.

### `InterpretationCard`
- props: `{ entry: TmiEntry; chips: ReturnType<typeof entryChips>; verdict: VerdictResult | null; judging: boolean; canRemove: boolean; canJudge: boolean; onRemove(): void; onJudge(): void }`
- 인용 문장, 출처 라벨("AI 해석"/"규칙 해석"), 해설(comment), 칩 목록(tone별 색: 실측 초록·그럴듯함 노랑·상상 회청·거부 빨강), 거부면 reason.
- 버튼 "진짜야?"(canJudge일 때) → judging이면 "기록을 뒤지는 중…". verdict가 있으면 판정 칩(`real` "진짜 효과", `maybe` "애매해요", `useless` "쓸모없음", `unmeasurable` "잴 수 없음") + headline + body + 출처("AI 판정"/"기록표 판정").
- 삭제 버튼 "빼기"(canRemove일 때).

### `PlayControls`
- props: `{ canPitch: boolean; canFinish: boolean; busy: boolean; finished: boolean; onPitch(); onFinishPa(); onFinishGame(); onReset() }`
- 버튼 "한 구 던지기"(Primary), "이 타석 끝까지", "경기 끝까지", "처음부터"(Text). 휴대폰에서는 화면 아래 고정 바(`position: sticky; bottom: 0`, 배경 `--booth`, 위 테두리 `--rail`), 1024px 이상은 일반 흐름. busy면 `aria-busy`.

### `PlayLog`
- props: `{ entries: PlayLogEntry[] }` — 최신이 위. 줄: "9회말 · 이름 vs 이름 · 헤드라인 · 5:4", 승부처(highlight) 표시는 왼쪽 `--led` 2px 선. 비었으면 "아직 던진 공이 없어요".

### `WpChart`
- props: `{ points: Array<{ label: string; value: number }>; baseline: number | null; teamName: string; color: string }` — 공격 팀 승리확률(0~1). SVG `viewBox`로 반응형, 0·50·100% 눈금과 라벨, 50% 선, 선 + 마지막 점 강조, baseline은 점선 수평선과 라벨 "TMI 없음", `<title>`/`aria-label`에 "KIA 승리확률 31.2%에서 100%로" 같은 요약. 점이 1개면 점만.

### 테스트
- 각 컴포넌트: 주어진 props의 텍스트·숫자 형식, 버튼 비활성 조건, 클릭 핸들러 호출, 스크린리더 문장(Scorebug), 만화 모드 칩 문구, 예시 칩이 입력을 채움, 제출 후 비움, 판정 칩 문구, WpChart 요약 문장과 점 개수.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 컴포넌트가 엔진·AI·게임 상태를 직접 import하지 않는가? (타입과 `src/domain` 포맷터만)
   - UI_GUIDE 색·반경(2/6/10px)·타이포·애니메이션 규칙을 지키는가? 안티패턴이 없는가?
   - 모든 인터랙티브 요소에 보이는 포커스와 이름(label/aria-label)이 있는가?
3. 결과에 따라 `phases/5-app/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 차트·아이콘·UI 라이브러리를 설치하지 마라. 이유: ADR-007.
- 확률을 컴포넌트 안에서 계산하지 마라(퍼센트 포맷만). 이유: CLAUDE.md CRITICAL.
- 이모지를 아이콘으로 쓰지 마라. 이유: UI_GUIDE.
- 화면(`src/app/screens`)을 수정하지 마라. 이유: 다음 step의 범위다.
- 기존 테스트를 깨뜨리지 마라.
