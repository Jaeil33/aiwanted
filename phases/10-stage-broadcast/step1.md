# Step 1: broadcast-scene

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ADR.md` (ADR-005 선수 얼굴·로고 금지, ADR-012)
- `/docs/UI_GUIDE.md` (경기장 캔버스, 색상)
- `docs/design/nightgame/stage.mjs` (관중·조명탑·LED 띠·흙·타자·포수·주심·투수 뒷모습의 구도와 색 참고, import 금지)
- `src/stage/math/camera.ts` (step 0: 새 카메라·`project` null 가능)
- `src/stage/render/background.ts`, `figures.ts`, `overlay.ts`, `types.ts`와 테스트, `src/stage/render/testing.ts`(가짜 컨텍스트)
- `src/stage/math/pose.ts`, `field.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

### `src/stage/render/background.ts`
`buildBackground(b, opts: { lights: number; board: [string, string] })`는 새 카메라로 투영해 아래 순서로 그린다.

1. **관중석**: 밤하늘 그라데이션, 좌우 조명탑, `lights`(0~1) 세기의 빛 번짐, 시드 고정 관중 점(색은 팀 색·흰색·회색).
2. **백스톱 벽**: 검은 LED 띠를 두고, `board` 두 줄을 호박색(#FFB547) 글자로 쓴다.
3. **그라운드**: 홈플레이트 주변 흙 원, 타자석 선, 파울 라인, 홈플레이트, 잔디 줄무늬.
4. **앞쪽 마운드**: 흙과 투수판.
5. **비네트**.

### `src/stage/render/figures.ts`
- **투수**: 뒷모습. 투구 손(`throws`)에 따라 좌우를 뒤집는다. 기존 투수 키프레임(와인드업·릴리스·팔로스루)을 뒷모습용 관절 좌표로 옮기고, 던지는 손 화면 위치를 돌려주는 계약은 유지한다.
- **타자**: 옆모습. 좌타는 1루 쪽 타석이라 화면에서 플레이트 왼쪽, 우타는 오른쪽이다. 스윙 키프레임(`batterKeys`)은 유지하고 좌우 반전만 새 시점에 맞춘다.
- **포수**: 앉은 자세. 미트 목표 위치를 인자로 받는다.
- **주심**: 포수 뒤에 둔다.
- **야수**: 먼 곳에 작게 둔다(선택).
- **유니폼**: `StageScene.bat.home`/`fld.home`에 따라 홈 팀은 흰 바탕에 팀 색 장식, 원정 팀은 회색 바탕에 팀 색 장식이다. 헬멧·모자는 팀 색이다.
- 얼굴 세부·등번호·로고는 그리지 않는다(ADR-005). 윤곽 한쪽에 조명 방향 밝은 선(림 라이트) 하나만 둔다.

### `src/stage/render/overlay.ts`
- **스트라이크 존**: 얇은 chalk 사각형과 3×3 안선(불투명도 0.18).
- **투구 위치 표시**: 번호와 콜 색(볼 `#3FD27E`·스트라이크 `#FFC53D`·파울·인플레이), 공, 잔상.
- **캔버스 글자 제거**: 콜 글자(`drawCall`)와 결과 배너(`drawBanner`), 미니 다이아몬드(`drawMap`)를 캔버스에서 없앤다. 콜·배너는 DOM `Callout`이 그린다(ADR-012). 스코어버그가 주자를 보여준다. 관련 export는 지우고 컨트롤러 호출부는 컴파일만 되게 정리한다(동작 정리는 step 2).

### 테스트
- 가짜 컨텍스트로 확인할 것:
  - 모든 그리기 좌표가 유한하다(NaN·Infinity 없음).
  - 좌타·우타·좌투·우투 반전.
  - 홈·원정 유니폼 색.
  - `lights` 0과 1의 알파 차이.
  - `board` 두 줄이 `fillText`로 한 번씩 그려진다.
  - 캔버스에 콜 단어("볼", "스트라이크", "홈런")를 `fillText`하지 않는다.
- 투수 손 위치 반환 계약.

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/stage
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - 선수 얼굴·등번호·구단 로고를 그리지 않는가(ADR-005)?
   - 금지 목록(글로우 애니메이션 등)을 지켰는가?
   - 렌더러가 확률·게임 규칙을 계산하지 않는가?
3. `npm run build:artifact`로 단일 HTML을 만든다. 파일 크기를 summary에 적는다(렌더 결과의 눈 확인은 메인 세션이 한다).
4. `phases/10-stage-broadcast/index.json`의 step 1을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 이미지 파일·스프라이트 시트를 추가하지 마라. 이유: 단일 HTML 크기와 권리(ADR-005). 캔버스 도형으로 그린다.
- `src/app`·`src/components`를 고치지 마라. 이유: 화면 phase(11-screens)의 범위다.
- 기존 테스트를 깨뜨리지 마라(지운 콜·배너·미니맵 그리기 테스트는 새 계약 테스트로 바꾼다).
