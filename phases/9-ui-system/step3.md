# Step 3: game-frame

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/UI_GUIDE.md` (화면 구성, 데스크톱)
- `/docs/ADR.md` (ADR-005 출처 표시, ADR-011)
- `src/app/App.tsx`, `src/app/App.module.css`, `src/app/App.test.tsx`, `src/main.test.tsx`
- `src/app/screens/*.tsx` (지금 화면들 — 이번 step에서는 틀 안에 그대로 넣는다)
- step 1·2 컴포넌트: `TabBar`, `Button`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

### `src/app/App.tsx`
사이트형 `Frame`(머리말 로고·내비·푸터)을 게임용 틀 두 가지로 바꾼다.

```tsx
/** 로비·판정소·만든 이유: 상단 바 52px(브랜드) + 본문 + 출처 한 줄 + 하단 TabBar */
function MenuFrame(props: { current: 'lobby' | 'evidence' | 'about'; children: ReactNode }): JSX.Element;
/** 플레이·결과: 머리말·푸터·탭바 없는 전체 화면 */
function GameFrame(props: { children: ReactNode }): JSX.Element;
```

- **라우트별 틀**: home은 MenuFrame 'lobby', evidence·about은 각자의 MenuFrame, play·result는 GameFrame이다. 데이터 없음 안내는 MenuFrame 안에 둔다.
- **브랜드**: "TMI 야구", `--ui` 900 17px, '야구'만 `--flood`. `#/` 링크이고 `h1`이다.
- **출처 한 줄**: MenuFrame에만 둔다. "기록·중계: 네이버 스포츠(KBO) · 날씨: Open-Meteo · 확률: TMI 야구 엔진 계산값", `--dim` 11px. 게임 화면의 출처는 11-screens에서 결과·만든 이유·공유 카드에 넣는다.
- **게임 열**: 두 틀 모두 가운데 최대 480px, 폭 100%, 최소 높이 100dvh다. 1024px 이상에서는 양옆 `--ground` 위에 열 외곽 그림자 `0 40px 80px -30px rgba(0,0,0,.8)`와 1px `--hair-2` 테두리를 준다. 2단 레이아웃은 없다.
- **본문 여백**: MenuFrame 본문은 좌우 18px, GameFrame은 0(화면이 알아서 둔다)이다.
- 기존 `Shell`의 라우팅·장면 열기 로직은 그대로 둔다.

### `src/app/App.module.css`
- 새 틀 스타일은 토큰만 쓴다.
- 옛 `.header`·`.nav`·`.footer` 규칙은 지운다.

### 테스트 (`src/app/App.test.tsx` 갱신)
- home·evidence·about에 TabBar가 있고 `aria-current`가 맞다. 출처 한 줄이 있다.
- play·result 라우트에는 머리말 내비·탭바·출처가 없다.
- 데이터 없음 안내가 그대로 보인다.
- 기존 라우팅 테스트(모르는 장면 → 홈, 결과 직접 진입 → 홈)가 통과한다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/app src/main.test.tsx
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - 출처 표시가 사라진 화면이 없도록 11-screens에 넘길 곳을 summary에 적었는가(ADR-005)?
   - 페이지 가로 스크롤이 생기지 않는가?
3. `phases/9-ui-system/index.json`의 step 3을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 화면(`src/app/screens`)의 내용을 새로 만들지 마라. 이유: 11-screens의 범위다. 틀 교체로 깨지는 테스트만 고친다.
- 라우트 주소(`#/`, `#/scene/:id`, `#/result`, `#/evidence`, `#/about`)를 바꾸지 마라. 이유: 공유 링크 호환(ARCHITECTURE 상태 관리).
- 기존 테스트를 깨뜨리지 마라.
