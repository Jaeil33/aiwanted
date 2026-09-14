# Step 5: result-share

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/PRD.md` (핵심 기능 6 결과)
- `/docs/UI_GUIDE.md` (전부)
- `/docs/ADR.md` (ADR-005 출처, ADR-009 만화 모드 라벨을 이미지 안에)
- 이전 step 산출물: `src/app/GameProvider.tsx`, `src/app/platform.ts`, `src/app/router.ts`, `src/app/useSceneEvaluations.ts`, `src/app/screens/PlayScreen.tsx`, `src/app/screens/ResultScreen.tsx`(자리 표시), `src/components/*`
- `src/game/selectors.ts`(`butterflyPp`, `battingWin`, `entryChips`), `src/game/share.ts`, `src/game/session.ts`, `src/engine/index.ts`(`expectedCounts`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 모든 파일은 테스트를 먼저 쓴다.

## 작업

### `src/app/useStartEvaluations.ts`
- 장면 시작 상태(`setup.scene.state`, 장면 투수, `first: true`)의 base·tmi evaluation을 엔진 클라이언트로 구한다(`useSceneEvaluations`와 같은 캐시·옛 결과 무시 규칙).

### `src/components/ResultSheet.tsx`
- props: `{ battingTeam: string; fieldingTeam: string; battingColor: string; final: { winner: Side | 'tie'; walkoff: boolean; state: GameState }; awayName; homeName; batSide: Side; base: GaugeLike | null; tmi: GaugeLike | null; mode: Mode; entries: TmiEntry[]; actual: SceneRecord['actual']; naverBefore: number | null; onReplay(); onChangeTmi(); onHome(); onEvidence(); shareSlot?: ReactNode }`
- 내용(위에서 아래로):
  - 결과 배너: "롯데 승리" / "무승부", 끝내기면 "끝내기!" 표시. 최종 점수 "KIA 4 : 8 롯데", 연장이면 "11회말".
  - "같은 장면을 1,000번 치르면": 두 줄 — "TMI 없음 · KIA 277승 35무 688패", "TMI 걸고 · KIA 284승 35무 681패"(공격 팀 기준, `expectedCounts`).
  - 나비효과: 큰 LED 숫자 `formatDeltaPp(butterflyPp)`와 모드 칩, 설명 "TMI 한 줄이 KIA 승리확률을 이만큼 바꿨어요."
  - 실제 결과 공개: "실제로는 이렇게 끝났어요" + `actual.result`, 네이버 승리확률 "62.0% → 100%"(값이 둘 다 있을 때만, 출처 "네이버 스포츠").
  - TMI 목록(문장 + `entryChips`).
  - 버튼: "같은 TMI로 다시 치르기", "TMI 바꾸기", "다른 장면", "판정소 보기", 그리고 `shareSlot`.

### `src/components/shareCard.ts`
- `export interface ShareCardData { title: string; date: string; matchup: string; tmiTexts: string[]; butterflyText: string; modeLabel: string; expectedLine: string; footer: string }`
- `wrapText(ctx, text: string, maxWidth: number): string[]`
- `drawShareCard(ctx: CanvasRenderingContext2D, data: ShareCardData): void` — 1080×1350. 밤하늘 바탕, 상단 "TMI 야구"와 날짜·매치업, 상황 제목, TMI 문장(최대 3개 줄바꿈), 가운데 큰 나비효과 숫자(`--led` 색), **모드 라벨 상자를 항상 그린다**(만화면 "만화 모드 · 효과 6배 과장"), 1,000번 요약 한 줄, 하단 문구 "쓸모없는 변수, 진짜 쓸모없을까?"와 출처 "기록·중계: 네이버 스포츠(KBO) · 확률: TMI 야구 엔진". 실제 결과는 넣지 않는다(친구에게 스포일러).
- `shareCardData(args): ShareCardData` — 세션·setup·게이지에서 카드 문구를 만든다.

### `src/app/platform.ts` 확장
- `Platform.shareImage(file: { blob: Blob; filename: string; title: string }): Promise<'saved' | 'shared' | 'downloaded' | 'declined' | 'unavailable'>` — (1) `downloads.save({ filename, data: blob })`(거절 코드 `declined` → 'declined', 그 외 오류 → 다음 방법), (2) `navigator.canShare?.({ files })`면 `navigator.share`(AbortError → 'declined'), (3) object URL + `<a download>` 클릭 → 'downloaded', 모두 불가 → 'unavailable'.
- `Platform.copyText(text: string): Promise<boolean>` — `navigator.clipboard?.writeText`.

### `src/components/ShareButton.tsx`
- props: `{ data: ShareCardData; filename: string; link: string; platform: Pick<Platform, 'shareImage' | 'copyText'> }`
- "결과 카드 저장" 버튼: 캔버스를 만들어 `drawShareCard` → `toBlob` → `shareImage`, 결과 문구("저장했어요", "공유했어요", "내려받았어요", "저장을 취소했어요", "이 화면에서는 저장할 수 없어요").
- "링크 복사" 버튼: `copyText(link)` → "링크를 복사했어요" / "복사할 수 없어요". 결과 문구는 `aria-live`.

### `src/app/screens/ResultScreen.tsx` (자리 표시 교체)
- `session.final`이 없으면 play(장면이 있으면) 또는 home으로 보낸다.
- ResultSheet + ShareButton(link = 현재 위치의 origin/path + `formatRoute({ screen: 'play', sceneId, share: { sceneId, texts, mode } })`).
- "같은 TMI로 다시 치르기" → `resetPlay`(seed + 1) 후 play 라우트, "TMI 바꾸기" → 같은 동작 후 입력 영역에 포커스, "다른 장면" → home, "판정소 보기" → evidence.

### 테스트
- ResultSheet: 승리·무승부·끝내기 문구, 1,000번 두 줄 합이 1,000, 나비효과 문구와 만화 모드 칩, 네이버 값이 없으면 그 줄 없음.
- shareCard: 가짜 ctx(`fillText` 기록, `measureText`는 글자 수 × 20)로 모드 라벨·TMI 문장·출처 문구가 그려짐, wrapText 줄바꿈, 실제 결과 문구가 없음.
- platform.shareImage: downloads 성공·declined, navigator.share, 다운로드 링크, 모두 불가.
- ShareButton: 클릭 시 결과 문구, 링크 복사.
- ResultScreen: final 없으면 이동, 다시 치르기가 resetPlay를 부름.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 결과 숫자가 모두 엔진 결과(`expectedCounts`, 게이지)에서 오는가?
   - 공유 이미지에 모드 라벨과 출처가 항상 들어가는가? (ADR-005, ADR-009)
   - 다운로드·공유·클립보드 접근이 `platform.ts`에만 있는가?
3. 결과에 따라 `phases/5-app/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 공유 카드에 선수 사진·구단 로고·실제 결과를 넣지 마라. 이유: ADR-005, 스포일러.
- 외부 이미지 생성·업로드 서비스를 부르지 마라. 이유: 캔버스로 충분하고 데이터 반출이다.
- 판정소·만든 이유 화면을 만들지 마라. 이유: 다음 step의 범위다.
- 기존 테스트를 깨뜨리지 마라.
