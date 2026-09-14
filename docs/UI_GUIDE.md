# UI 디자인 가이드

## 디자인 원칙
1. **중계석처럼 보여야 한다.** 마케팅 페이지가 아니라 야간 경기 중계 그래픽이다. 첫 화면에 경기장·전광판·TMI 입력이 바로 보인다.
2. **숫자 옆에는 항상 이유가 있다.** 확률 변화 옆에 근거 등급 칩(실측/그럴듯함/상상)과 모드 칩(현실/만화)을 둔다.
3. **엄지 하나로 끝난다.** 주요 버튼은 화면 아래쪽, 높이 48px 이상. 한 판에 필요한 조작은 입력 1번과 버튼 2번.
4. **움직임은 야구가 한다.** 애니메이션은 공·투수·타자·주자·전광판 숫자에만 쓴다. UI 장식 애니메이션은 쓰지 않는다.

## AI 슬롭 안티패턴 — 하지 마라
| 금지 사항 | 이유 |
|-----------|------|
| backdrop-filter: blur() | glass morphism은 AI 템플릿의 가장 흔한 징후 |
| gradient-text (배경 그라데이션 텍스트) | AI가 만든 SaaS 랜딩의 1번 특징 |
| "Powered by AI" 배지, 반짝이 이모지 | 기능이 아니라 장식. AI는 해석 카드의 출처 라벨("AI 해석"/"규칙 해석")로만 밝힌다 |
| box-shadow 글로우 애니메이션 | 네온 글로우 = AI 슬롭. LED 숫자도 글로우 없이 색으로만 |
| 보라/인디고 브랜드 색상 | "AI = 보라색" 클리셰 |
| 모든 카드에 동일한 rounded-2xl | 균일한 둥근 모서리는 템플릿 느낌. 반경은 2px(전광판)·6px(칩·버튼)·10px(시트) 세 가지만 |
| 배경 gradient orb (blur-3xl 원형) | 모든 AI 랜딩 페이지에 있는 장식 |
| 01/02/03 같은 장식용 번호 | 순서가 정보일 때만 번호를 쓴다 |
| 모든 섹션 가운데 정렬 | 중계 그래픽은 좌측 정렬. 전광판 숫자만 가운데 |

## 색상 (`src/styles/tokens.css`)
### 배경
| 용도 | 값 |
|------|------|
| 페이지(밤하늘) | `--night` #0A1520 |
| 패널(중계석) | `--booth` #0E1B28 |
| 카드·시트(더그아웃) | `--dugout` #112131 |
| 구분선(펜스 레일) | `--rail` #253B50 |
| 전광판 바탕 | `--board` #05090D |

### 텍스트
| 용도 | 값 |
|------|------|
| 주 텍스트(분필) | `--chalk` #EEF2E9 |
| 본문 | `--chalk-2` #C9D3CC |
| 보조 | `--chalk-3` #8FA1A6 |
| 비활성 | `--chalk-4` #5E7078 |

### 데이터/시맨틱 색상
| 용도 | 값 |
|------|------|
| LED 숫자·주요 버튼 | `--led` #FFB547, 그 위 글자 `--led-ink` #231503 |
| 볼·출루·유리한 변화 | `--ball` #4FD37F |
| 스트라이크·주의 | `--strike` #FFD34E |
| 아웃·불리한 변화·거부 | `--out` #FF5C50 |
| 공격팀 / 수비팀 | `--bat` / `--fld` — 장면마다 팀 컬러로 설정 |
| 근거 등급 실측 / 그럴듯함 / 상상 | #4FD37F / #FFD34E / #B7C4C9 (칩 테두리와 글자) |
| 만화 모드 | #FF8A2A 칩, 점선 테두리 |

### 팀 컬러 (`src/domain/teams.ts`)
KIA `HT` #F0474B · 롯데 `LT` #5C8DF6 · NC `NC` #86A8EE · 한화 `HH` #FF8A2A · LG `LG` #E0457B · 두산 `OB` #A3A7EA · 삼성 `SS` #4C8FF7 · SSG `SK` #EF5261 · KT `KT` #D6D6D6 · 키움 `WO` #C9566C

## 컴포넌트
### 전광판 숫자 (스코어버그, 승률 값)
```
font-family: var(--led-font); color: var(--led); background: var(--board);
border: 1px solid var(--rail); border-radius: 2px; font-variant-numeric: tabular-nums;
```

### 카드·시트
```
background: var(--dugout); border: 1px solid var(--rail); border-radius: 10px; padding: 16px;
그림자 없음. 한 화면에 떠 있는 시트는 하나만.
```

### 버튼
```
Primary(TMI 걸기·던지기): background var(--led); color var(--led-ink); border-radius 6px; min-height 48px; font 700 16px var(--body)
Secondary: background transparent; border 1px solid var(--rail); color var(--chalk)
Text: color var(--chalk-3); hover·focus 시 color var(--chalk) + 밑줄
포커스(모든 인터랙티브 요소): outline 2px solid var(--led); outline-offset 2px
비활성: opacity 0.45; cursor not-allowed
```

### 입력 필드 (TMI)
```
background var(--board); border 1px solid var(--rail); border-radius 6px; padding 14px 16px;
font 16px var(--body) (iOS 확대 방지); 남은 글자 수 표시(최대 80자)
```

### 칩
```
근거·모드·예시 TMI: min-height 28px; padding 0 10px; border 1px solid currentColor; border-radius 6px; font 500 13px var(--body)
```

## 레이아웃
- 기준 폭 390px, 좌우 여백 16px. `max-width: 1180px` 컨테이너 안에서 좌측 정렬.
- 휴대폰 순서: 경기장 캔버스(16:9, 전체 폭) → 스코어버그 → 3단 승률 → TMI 입력·해석 카드 → 기록. 조작 버튼은 하단 고정 바.
- 1024px 이상: 좌 1.5fr(경기장·조작·기록) / 우 1fr(TMI·해석·승률) 2단.
- 간격은 8px 단위(8·12·16·24·32). 형제 요소 간격은 `gap`으로 준다.
- 페이지 가로 스크롤 금지. 표·차트만 자체 `overflow-x: auto`.

## 타이포그래피
| 용도 | 스타일 |
|------|--------|
| 화면 제목·결과 배너 | `--display` "Black Han Sans" 28px(휴대폰) / 40px(1024px 이상) |
| 카드 제목 | `--body` 600 15px, `--chalk-2` |
| 본문 | `--body` 400 15px, line-height 1.6, `--chalk-2` |
| 전광판 숫자 | `--led-font` "VT323" 36px(승률) / 28px(점수), tabular-nums |
| 라벨·칩 | `--body` 500 13px, letter-spacing 0.02em |

- Google Fonts `<link>`로 Black Han Sans, IBM Plex Sans KR(400·500·600·700), VT323을 불러온다.
- fallback: 본문 `"Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif`, 숫자 `ui-monospace, Consolas, monospace`.

## 애니메이션
- 허용: 투구·타구·주자·투수·타자 캔버스 연출, 전광판 숫자 롤링(300ms), 결과 배너 등장(200ms, scale 0.96→1), 확률 막대 폭 변화(300ms ease-out).
- `prefers-reduced-motion: reduce`이면 캔버스 연출은 슬로모션 없이 1배속으로, 숫자 롤링과 배너 효과는 끈다.
- 그 외 애니메이션 금지: 페이지 전환 슬라이드, 호버 튀어오름, 회전 스피너(대신 "해석 중…" 텍스트).

## 아이콘
- SVG 인라인, stroke 1.5, `currentColor`. 아이콘 컨테이너(둥근 배경 박스)로 감싸지 않는다.
- 야구 요소(베이스 다이아몬드, 공, 배트)만 아이콘으로 쓰고 일반 UI 아이콘은 최소화한다.

## 문구
- 해설위원 톤의 짧은 한국어. 버튼은 동작 그대로 쓴다: "TMI 걸기", "한 구 던지기", "이 타석 끝까지", "경기 끝까지".
- 확률 변화는 `+0.6%p`, `−0.07%p`, `±0.00%p` 형식. 확률 자체는 소수 첫째 자리까지 `%`.
- 오류는 무엇이 안 됐고 대신 무엇을 했는지 쓴다: "AI 해석을 쓸 수 없어 규칙으로 계산했어요."
- 거부: "실존 선수에게 민감한 내용이라 계산하지 않았어요."
- 출처(푸터): "기록·중계: 네이버 스포츠(KBO) · 날씨: Open-Meteo · 확률: TMI 야구 엔진 계산값"
