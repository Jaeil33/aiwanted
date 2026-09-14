# Step 1: lobby

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/PRD.md` (핵심 기능 1), `/docs/UI_GUIDE.md` (로비, 컴포넌트 규격, 움직임)
- `/docs/ADR.md` (ADR-011, ADR-012, ADR-014)
- `docs/design/nightgame/index.html`·`style.css`·`app.mjs` (화면 1 로비 — 시각 기준, import 금지)
- `src/app/screens/HomeScreen.tsx`와 테스트, `src/components/SceneCard.tsx`, `src/app/App.tsx`(9-ui-system step 3: `MenuFrame`)
- 9-ui-system 컴포넌트: `Button`, `LedMeter`, `TabBar`, `Chip`; 10-stage-broadcast: `BallparkStage`(variant 'lobby', `lightsOn`)
- `src/game/selectors.ts` (7-scene-data step 3: `expectedSwing`), `src/game/engineClient.ts`, `src/app/GameProvider.tsx`, `src/data/appData.ts`(`todaySceneIndex`)
- `phases/7-scene-data`, `phases/9-ui-system`, `phases/10-stage-broadcast`의 index.json summary

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

### `src/app/useSceneSwings.ts`
```ts
/** 장면마다 시작 상태의 승부처 지수(%p). 계산 전 undefined, 계산 불가 null */
export function useSceneSwings(sceneIds: readonly string[]): ReadonlyMap<string, number | null | undefined>;
```
- 게임 컨텍스트의 엔진 클라이언트로 장면 시작 상태를 평가한다(효과 없음·현실, detail true). 결과는 `expectedSwing`이다.
- 오늘의 장면을 먼저, 나머지는 한 번에 하나씩 순서대로 요청한다(동시 요청 금지: 휴대폰 부담). 결과는 모듈 캐시에 둔다.
- 언마운트되면 남은 요청을 버린다.

### `src/components/TicketCard.tsx`
```tsx
export function TicketCard(props: {
  href: string;
  dateLabel: string;       // "8.23 (토)"
  stadium: string;
  awayName: string; homeName: string; awayColor: string; homeColor: string;
  awayScore: number; homeScore: number;   // 장면 시점 점수
  situation: string;       // 장면 제목
  bases: Bases;
  swing: number | null | undefined;       // undefined면 "계산 중", null이면 숨김
}): JSX.Element;
```
- 폭 204px, 반경 10px, 절취선 노치(마스크), 아래 칸 점선.
- 카드 전체가 링크다. 접근 이름은 "날짜 구장 원정 점수 대 홈 점수, 상황".

### `src/app/screens/HomeScreen.tsx` → 로비
위에서 아래로:
1. **경기장**: `BallparkStage` variant 'lobby', 높이 400px. 마운트 때 `lightsOn(1100)`을 부르고, 동작 줄이기면 즉시 켠다. 오늘의 장면 팀으로 scene을 만든다.
2. **히어로**(캔버스 아래쪽 스크림 위):
   - 눈썹글 "오늘의 명장면"과 날짜(요일)·구장
   - 상황 제목(`--callout` 46px)
   - 원정·홈 팀 판(팀 색 선, 이름, "원정/홈", 점수)
   - 승부처 지수 `LedMeter`(max 30, valueText "N.N")
   - 주요 버튼 "경기 입장" → `#/scene/<id>`
3. **다른 명장면**: 제목과 "옆으로 넘겨 보기", 오늘 장면을 뺀 `TicketCard` 가로 스크롤(스크롤 스냅), 날짜 최신순.
- `MenuFrame`의 상단 바·출처·탭바는 그대로 쓴다.
- 실제 결과·최종 점수·`leverage`(실제 |WPA|)는 어디에도 보이지 않는다(ADR-014).
- 날짜 요일은 `Intl.DateTimeFormat('ko-KR', { weekday: 'short', timeZone: 'Asia/Seoul' })`로 계산하는 순수 함수(`src/domain/format.ts`에 추가, 테스트 포함)로 만든다.

### 테스트
- **useSceneSwings**: 가짜 엔진으로 순차 요청, 캐시, 언마운트 취소.
- **TicketCard**: 접근 이름, swing 표시 세 경우, 링크.
- **로비**:
  - 히어로 요소·버튼 링크
  - 티켓 수 = 장면 수 − 1
  - 결과 스포일러(실제 결과 문장·최종 점수·leverage 숫자)가 DOM에 없음
  - 스테이지는 가짜 forwardRef로 모킹
- **요일 함수**.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/app src/components src/domain
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - 확률(승부처 지수)이 엔진 평가에서만 오는가?
   - 결과 스포일러가 없는가?
   - UI_GUIDE 로비 구성과 시안을 따르는가?
3. `phases/11-screens/index.json`의 step 1을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 파이프라인 `leverage`(실제 |WPA|)를 표시하거나 정렬에 쓰지 마라. 이유: 결과 스포일러(ADR-014).
- 장면 평가를 동시에 16개 요청하지 마라. 이유: 휴대폰에서 첫 화면이 멈춘다.
- 기존 SceneCard 파일을 이 step에서 지우지 마라. 이유: step 5에서 한꺼번에 정리한다.
- 기존 테스트를 깨뜨리지 마라(로비로 바뀐 HomeScreen 테스트는 새 기준으로 고친다).
