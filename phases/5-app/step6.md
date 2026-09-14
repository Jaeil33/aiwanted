# Step 6: evidence-about

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/PRD.md` (핵심 기능 7 판정소, 8 만든 이유)
- `/docs/ADR.md` (ADR-002, ADR-003, ADR-004, ADR-005, ADR-009)
- `/docs/UI_GUIDE.md` (전부, 특히 차트는 SVG·토큰 색)
- 이전 step 산출물: `src/app/App.tsx`, `src/app/GameProvider.tsx`, `src/app/screens/EvidenceScreen.tsx`·`AboutScreen.tsx`(자리 표시), `src/components/*`(스타일 방식)
- 계약: `src/types/data.ts`(`EvidenceData`, `EvidenceItem`, `TrustData`), `src/domain/measured.ts`, `src/domain/format.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 모든 파일은 테스트를 먼저 쓴다.

## 작업

### `src/components/EvidenceTable.tsx`
- props: `{ evidence: EvidenceData | null }`
- null이면 "판정 데이터가 아직 없어요. 파이프라인으로 evidence.json을 만들면 보여요."
- 행(적용 가능한 변수 먼저, `home`은 맨 아래 "기준점" 표시): 변수 라벨 + perLabel, 득점 변화 `+2.1%`(runsPctPerUnit)와 95% 구간 막대(가로축 −10%~+10%, 0 기준선, 구간 밖이면 끝에 화살표 표시), 2026 검증 칩("2026 예측 개선 있음"/"없음" — test.ciLow > 0), 판정 칩(`real` "진짜 효과", `maybe` "애매해요", `useless` "쓸모없음"), note.
- 표 머리에 "득점 변화는 팀 득점 기준, 막대는 95% 구간".
- 표는 자체 `overflow-x: auto` 컨테이너, `font-variant-numeric: tabular-nums`.

### `src/components/TrustPanel.tsx`
- props: `{ trust: TrustData | null }`
- null이면 "엔진 신뢰도 리포트가 아직 없어요."
- Brier 점수 막대 3개(TMI 야구 엔진 / 네이버 승리확률 / 항상 50%) — "낮을수록 정확해요", 값은 소수 셋째 자리. 로그 손실은 작은 표로.
- 보정 차트(SVG): 대각선, 구간별 예측 평균(x)·실제 홈 승률(y) 점(크기는 n), 축 라벨 0·50·100%.
- note와 "2025 시즌 기록만으로 만든 엔진을 2026년 8월 1일~9월 13일 중계 타석에 적용"이라는 설명(`games`, `plateAppearances` 숫자 포함).

### `src/app/screens/EvidenceScreen.tsx` (자리 표시 교체)
- 제목 "판정소", 부제 "쓸모없는 변수, 진짜 쓸모없을까?"
- 소개: "기온·바람·이동 거리처럼 기록에 남는 변수는 2021~2025년 경기로 효과를 재고, 2026년 경기로 정말 맞는지 확인했어요. 기록에서 효과가 보여도 다음 해 경기 예측까지 좋아지는지는 따로 확인해요."
- `evidence.method` 문단, 학습·검증 경기 수, 전체 변수를 함께 넣었을 때의 2026 개선량(joint).
- 판정 요약 한 줄: `home`(기준점)을 뺀 items의 판정 개수를 파일에서 세어 "진짜 효과 N개 · 애매해요 N개 · 쓸모없음 N개"로 보여 준다(숫자를 코드에 적지 않는다).
- `EvidenceTable`, 이어서 "엔진은 믿을 만한가" 제목과 `TrustPanel`.
- "장면으로 돌아가기" 링크(열린 장면이 있으면 play, 없으면 home).

### `src/app/screens/AboutScreen.tsx` (자리 표시 교체)
- 제목 "만든 이유"
- 섹션(각 제목 + 짧은 문단):
  - "위기에 약한 투수는 정말 있을까": 만든 사람이 LG Aimers 투수 제구 예측 대회에서 모델링과 가설 검증을 맡아 134번의 실험을 했고, 사람들이 믿는 멘탈·클러치 변수 5개(클러치, 3볼 카운트, 주자 상황, 득점권, 후반기)를 넣었더니 모두 효과가 없거나 오히려 점수를 떨어뜨렸다는 경험. 그래서 반대로 "쓸모없는 변수를 마음껏 넣어 보고, 진짜 효과는 기록으로 판정하는 게임"을 만들었다.
  - "어떻게 계산하나": 타석(타자와 투수 기록을 리그 대비로 맞대결) → 이닝(아웃·주자·타순을 모두 따라가는 정확 계산) → 경기(11회 무승부 규칙). 무작위 반복이 아니라 정확한 계산이라 0.1%p 차이도 흔들리지 않는다.
  - "AI는 무엇을 하나": Claude가 자유 문장을 14개 조절 항목과 실측 변수로 번역하고, "진짜야?"에서 기록표를 조회해 설명한다. 확률 숫자는 AI가 만들지 않고 엔진이 계산한다. AI를 쓸 수 없으면 규칙 사전으로 대신한다.
  - "근거 등급과 모드": 실측(기록으로 추정)·그럴듯함·상상, 현실 모드와 만화 모드(효과 6배 과장).
  - "데이터와 한계": 네이버 스포츠 KBO 기록·중계(2026년 8월 1일~9월 13일 140경기 중계, 2021~2026 일정), Open-Meteo 날씨. 선수 교체·도루는 계산하지 않고, 이후 이닝은 팀 불펜 평균으로 던지며, 주루 확률은 고정값이다. 선수 사진·로고는 쓰지 않는다.
- 판정소 링크.

### 테스트
- EvidenceTable: null 안내, 행 순서(home 맨 아래), 퍼센트·판정 칩 문구, 구간 막대 SVG 존재.
- TrustPanel: null 안내, Brier 세 값 표시, 보정 점 개수 = calibration 길이.
- EvidenceScreen: 픽스처 evidence·trust로 제목·소개·표·패널, 장면 없을 때 home 링크.
- AboutScreen: 다섯 섹션 제목, "134번", "멘탈·클러치 변수 5개" 문구, 이름 같은 개인 정보가 없음.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 표·차트 숫자가 evidence.json·trust.json 값만 쓰는가? (하드코딩 금지)
   - UI_GUIDE 차트 규칙(토큰 색, 축 라벨, 가로 스크롤은 표 컨테이너만)을 지키는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/5-app/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 팀원 이름, 대회 순위, 노션 내용 등 개인·팀 정보를 넣지 마라. 이유: 공개 작품이고 팀원 동의가 없다.
- 효과 크기나 Brier 값을 코드에 적어 넣지 마라. 이유: 데이터 파일이 유일한 출처다(ADR-004).
- 새 패키지를 설치하지 마라. 이유: ADR-007.
- 기존 테스트를 깨뜨리지 마라.
