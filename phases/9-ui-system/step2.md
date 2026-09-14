# Step 2: hud-parts

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/UI_GUIDE.md` (색상, 타이포그래피, 컴포넌트 규격, 움직임)
- `/docs/ADR.md` (ADR-009, ADR-011, ADR-012)
- `docs/design/nightgame/index.html`, `style.css`, `app.mjs` (스코어버그·줄다리기 게이지·콜·금속 테두리·LED 미터 모양과 동작 참고)
- `src/styles/tokens.css` (step 0), step 1 컴포넌트(`Chip`, `Tabs`)
- `src/components/BasesDiamond.tsx`, `src/components/Scorebug.tsx`와 테스트, `src/domain/format.ts`(`formatPct`, `formatDeltaPp`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

`src/components/`에 경기장 위 HUD와 게임 순간을 알리는 표시 전용 컴포넌트를 만든다.

```tsx
// Callout.tsx — 볼·스트라이크·결과 콜. playKey가 바뀔 때마다 한 번 재생
export type CalloutTone = 'ball' | 'strike' | 'out' | 'hit' | 'big';
export function Callout(props: { text: string; tone: CalloutTone; playKey: number }): JSX.Element;

// TugGauge.tsx — 줄다리기 게이지
export function TugGauge(props: {
  leftLabel: string; rightLabel: string;
  left: number; right: number; tie: number | null;   // 0~1
  leftColor: string; rightColor: string;
  ghost: number | null;                             // TMI 없음일 때 왼쪽 값(0~1), 표시선 위치
  delta: string | null; deltaTone: 'up' | 'down' | 'flat';
  pending?: boolean;
}): JSX.Element;

// LedMeter.tsx — 20칸 LED 미터(승부처 지수 등)
export function LedMeter(props: { label: string; value: number; max: number; segments?: number; valueText: string }): JSX.Element;

// FoilFrame.tsx — 근거 등급 금속 테두리
export function FoilFrame(props: { grade: Evidence | 'refused'; radius: 'slot' | 'ticket' | 'card'; children: ReactNode; className?: string }): JSX.Element;

// CountDots.tsx — B·S·O 점
export function CountDots(props: { balls: number; strikes: number; outs: number }): JSX.Element;

// Scorebug.tsx — 경기장 위 방송 스코어버그로 다시 만든다(기존 props 유지)
```

동작 규칙:
- **Callout**:
  - `aria-live="polite"`. text가 비면 아무것도 보이지 않는다.
  - 재생: scale 1.5→1, `skewX(-10deg)`, 머무른 뒤 위로 사라짐, 1,150ms. tone 색은 ball `--ball`, strike `--strike`, out `--out`, hit·big `--flood`.
  - 글꼴은 `--callout` 60px(big은 64px)이고 딱딱한 그림자 `0 4px 0 rgba(0,0,0,.55)`를 준다.
  - 같은 playKey로 다시 렌더링하면 재생하지 않는다.
  - 동작 줄이기면 애니메이션 없이 1,150ms 동안 보였다가 사라진다(타이머는 컴포넌트 안 `useEffect`에서만).
- **TugGauge**:
  - 좌우 숫자는 `formatPct`, `--num` 36px이다. 무승부는 가운데에 작게 둔다(null이면 숨김).
  - 막대는 12px로, 왼쪽 `leftColor` | 무승부 빗금 | 오른쪽 `rightColor` 순서다. `flex-basis`가 700ms `--ease-out`으로 바뀐다.
  - ghost 위치에 `--flood` 2px 표시선을 둔다.
  - delta 칩은 step 1 `Chip` kind 'delta'를 쓴다.
  - pending이면 "계산 중…"을 `aria-live`로 알리고 막대는 유지한다.
  - `role="img"`에 `aria-label` 요약을 단다(예: "KT 승리 54.0%, 무승부 13.3%, NC 승리 32.7%, TMI 반영 +0.4%p").
- **LedMeter**: `role="meter"`와 `aria-valuemin/max/now`, `aria-valuetext`를 단다. 켜진 칸 수 = round(value / max × segments)이고 0~segments로 자른다.
- **FoilFrame**: 등급 금속색 conic 테두리(UI_GUIDE 공식)를 쓴다. refused는 `--out` 1px 테두리다. `--foil` 변수는 이 요소에 정의한다.
- **Scorebug**:
  - `--hud` 판, 반경 2px, 오른쪽 모서리 사선(clip-path).
  - 팀 행: 팀 색 3px 선, 공격 팀 이름 `--flood`, 점수 `--num` 19px.
  - 가운데 이닝 ▲▼, `BasesDiamond`, `CountDots`.
  - 기존 `aria-live` 문장은 유지한다.

### 테스트
- Callout: playKey가 바뀔 때만 재생 클래스가 다시 붙는다. 빈 text는 숨긴다. 동작 줄이기 분기(`matchMedia` 모킹).
- TugGauge: 숫자 포맷, flex-basis 비율, ghost 위치, tie null, aria-label, pending.
- LedMeter: 칸 수 경계(0, 초과), aria 값.
- FoilFrame: 등급별 클래스·CSS 변수.
- CountDots: 개수·aria-label.
- Scorebug: 기존 테스트의 문장 계약 유지 + 공격 팀 표시.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/components
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - 확률은 props로만 받고 계산하지 않는가?
   - 모드 라벨·등급 라벨을 붙일 자리가 있는가(ADR-009)?
   - 동작 줄이기를 지키는가?
3. `phases/9-ui-system/index.json`의 step 2를 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- `box-shadow` 글로우, `backdrop-filter`, 그라데이션 글자를 쓰지 마라. 이유: UI_GUIDE 금지 목록.
- `ProbabilityTiers`·`PlayControls` 같은 기존 화면 부품을 지우지 마라. 이유: 11-screens에서 교체한다(Scorebug만 이번 step에서 다시 만든다).
- 기존 테스트를 깨뜨리지 마라.
