# Step 0: calendar-score

## 왜

사용자 피드백 1번: **"일정표에서 스코어까지 나타나게."**

19-season step 9는 칸에 승패 한 글자만 뒀다. 이유는 `season.ts` 주석에 적혀 있었다 —
390px 기준 칸 폭이 약 55px이라 스코어가 안 들어간다고 봤다. 실제로 재 보면 `8:7`은
`--num`(Barlow Semi Condensed) 14px로 약 22px, 두 자릿수 `12:10`도 약 36px이다. 들어간다.
안 들어갔던 건 폭이 아니라 칸 높이(52px)였다.

## 작업

### `src/game/season.ts`
- `TeamScore { mine, theirs }`와 `teamScore(game, team)`. **내 팀 점수가 앞이다** —
  달력은 한 팀의 화면이라 원정·홈 순서보다 내 팀 기준이 읽힌다.
- `resultOf`와 달리 **끝난 경기만 보지 않는다.** 진행 중 경기는 승패를 못 적어도 지금 점수는 적는다.
- `CalendarCell.score`를 더한다.

### `src/app/screens/TeamScreen.tsx`
칸 높이 52 → 62px, 세 줄로 나눈다.

```
┌─────────┐
│ 2     승│  날짜 · 승패
│  ● 두산 │  상대(원정이면 @)
│  5:2    │  스코어
└─────────┘
```

승패는 글자로도 적고 칸 바탕에도 옅게 깐다(`color-mix`로 `--up`/`--down` 12~14%).
**색만으로 알리지 않는다** — 칸을 읽어 주는 이름이 `9월 15일 두산 무 3:3`이다.

## 확인

`npx vitest run src/game/season.test.ts src/app/screens/TeamScreen.test.tsx` 32개 통과.
