# Step 4: result-screen

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/PRD.md` (핵심 기능 6), `/docs/UI_GUIDE.md` (결과, 움직임, 문구)
- `/docs/ADR.md` (ADR-005 출처, ADR-009 모드 라벨을 이미지 안에, ADR-011, ADR-015)
- `docs/design/nightgame/index.html`·`style.css`·`app.mjs` (화면 4 결과 — 시각 기준, import 금지)
- `src/app/screens/ResultScreen.tsx`(자리 표시), `src/app/router.ts`, `src/app/platform.ts`, `src/app/GameProvider.tsx`
- `src/game/selectors.ts` (`butterflyPp`, `battingWin`, `entryChips`), `src/game/share.ts`, `src/game/session.ts` (`final`, `log`)
- `src/engine/index.ts` (`expectedCounts`), `src/app/useSceneEvaluations.ts` (`useEvaluationPair`)
- 9-ui-system 컴포넌트(`FoilFrame`, `Button`, `Chip`), 10-stage-broadcast `BallparkStage`(variant 'backdrop')
- `phases/5-app/step5.md` (옛 결과·공유 설계 — 동작 요구는 여기서 옮기고 모양은 UI_GUIDE를 따른다)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 작업

### `src/components/MultiverseDots.tsx`
- `{ bat: number; tie: number; fld: number; batColor: string; fldColor: string; label: string; playKey: number }`. 세 값의 합은 1000이다.
- 캔버스에 40×25 점을 공격 팀 승 → 무승부(#4A545B) → 수비 팀 승 순서로 칠한다. DPR 대응.
- `playKey`가 바뀌면 1,400ms easeOutCubic으로 채운다. 동작 줄이기면 즉시다.
- `role="img"`, aria-label은 "평행우주 1,000경기: KT 540승 133무 327패"다.

### `src/components/shareCard.ts`
- `ShareCardData { title; date; matchup; tmiTexts: string[]; butterflyText; modeLabel; expectedLine; footer }`
- `wrapText(ctx, text, maxWidth): string[]`
- `drawShareCard(ctx, data)`: 1080×1350.
  - 바탕: `--ground`, 위쪽 경기장 톤 그라데이션 띠(단색 계열).
  - 글자: 상단 "TMI 야구"와 날짜·매치업, 상황 제목(Gasoek One 계열 글꼴 이름 + 대체 글꼴), TMI 문장 최대 3개 줄바꿈.
  - 가운데 큰 나비효과 숫자는 `#FFCF6B`다.
  - **모드 라벨 상자는 항상 그린다**(만화면 "만화 모드 · 효과 6배 과장").
  - 1,000경기 요약 한 줄을 넣는다.
  - 하단: "쓸모없는 변수, 진짜 쓸모없을까?"와 출처 "기록·중계: 네이버 스포츠(KBO) · 확률: TMI 야구 엔진".
  - 실제 결과는 넣지 않는다.
- `shareCardData(args)`: 세션·setup·게이지로 문구를 만든다.

### `src/app/platform.ts` 확장
- `shareImage(file: { blob: Blob; filename: string; title: string }): Promise<'saved' | 'shared' | 'downloaded' | 'declined' | 'unavailable'>`. 순서대로 시도한다.
  1. `downloads.save`: 거절 코드면 'declined', 다른 오류면 다음 방법.
  2. `navigator.canShare({ files })`면 `navigator.share`: AbortError면 'declined'.
  3. object URL과 `<a download>`: 'downloaded'.
  4. 모두 불가: 'unavailable'.
- `copyText(text): Promise<boolean>`.

### `src/components/ShareButton.tsx`
- "결과 카드 공유": 캔버스 → `drawShareCard` → `toBlob` → `shareImage`. 결과 문구는 "저장했어요", "공유했어요", "내려받았어요", "저장을 취소했어요", "이 화면에서는 저장할 수 없어요"다.
- "링크 복사": `copyText(link)`. 문구는 "링크를 복사했어요" / "복사할 수 없어요"다. 결과 문구는 aria-live다.

### `src/app/screens/ResultScreen.tsx` (자리 표시 교체, `GameFrame` 안)
- `session.final`이 없으면 장면이 있을 때 play, 없으면 home으로 보낸다.
- 위 250px `BallparkStage` variant 'backdrop'에 스크림을 덮는다. 그 위 헤드라인:
  1. 눈썹글 "경기 종료 · N회초/말"
  2. `--callout` 64px: "<팀> 승리" / "무승부", 끝내기면 "끝내기!" 줄 추가
  3. 최종 점수(`--num` 28px)와 결정 장면 한 줄(마지막 로그 headline)
- **평행우주 1,000경기**: 장면 시작 base·tmi 평가(`useEvaluationPair(scene.state, true, true)`)의 `expectedCounts`를 공격 팀 기준 승·무·패로 바꾼다. `MultiverseDots`는 TMI 기준으로 그리고, 범례에 "TMI 없이 N"과 차이를 쓴다.
- **나비효과 판**(`FoilFrame`): 첫 TMI 짧은 문장 → 손잡이 칩, 큰 `formatDeltaPp(butterflyPp)`, 모드 칩.
- **봉인된 실제 결과**: "실제 경기는 어떻게 끝났을까요?"와 "실제 결과 열기" 버튼. 열면 `actual.result`, 실제 최종 점수, 네이버 승리확률 전→후(값이 둘 다 있을 때만), 출처 "네이버 스포츠(KBO)"를 보여준다.
- **도크**: "같은 TMI로 다시"(resetPlay → play 라우트) / `ShareButton`. 그 위 텍스트 버튼: "TMI 바꾸기"(resetPlay → play 라우트 → TMI 시트 열기), "다른 장면"(home), "판정소"(evidence).
- **공유 링크**: `origin + path + formatRoute({ screen: 'play', sceneId, share: { sceneId, texts, mode } })`.

### 테스트
- **MultiverseDots**: 칠하는 순서·개수(가짜 ctx), 동작 줄이기, aria-label.
- **shareCard**: 가짜 ctx(`fillText` 기록, `measureText` = 글자 수 × 20)로 확인할 것
  - 모드 라벨·TMI 문장·출처가 그려진다
  - wrapText가 줄을 나눈다
  - 실제 결과 문구가 없다
- **platform.shareImage**: 네 경로. **copyText**.
- **ShareButton**: 클릭 결과 문구.
- **ResultScreen**:
  - final 없으면 이동한다
  - 승리·무승부·끝내기 헤드라인
  - 1,000경기 합이 1000이다
  - 봉인 열기 전에는 실제 결과가 DOM에 없다
  - 다시 치르기가 resetPlay를 부른다
  - 출처는 열린 판에만 있다

## Acceptance Criteria

```bash
npm run lint
npm run build
npx vitest run src/app src/components src/game
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다.
   - 결과 숫자가 모두 엔진(`expectedCounts`, 게이지)에서 오는가?
   - 공유 이미지에 모드 라벨과 출처가 항상 들어가는가(ADR-005, ADR-009)?
   - 다운로드·공유·클립보드 접근이 `platform.ts`에만 있는가?
3. `phases/11-screens/index.json`의 step 4를 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- 공유 카드에 선수 사진·구단 로고·실제 결과를 넣지 마라. 이유: ADR-005, 스포일러.
- 외부 이미지 생성·업로드 서비스를 부르지 마라. 이유: 데이터 반출. 캔버스로 충분하다.
- 봉인 전에 실제 결과를 DOM에 렌더링하지 마라(숨김 처리도 금지). 이유: 스포일러.
- 기존 테스트를 깨뜨리지 마라.
