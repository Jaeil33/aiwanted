# Step 1: scene-rebuild

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` (데이터 흐름, 핵심 계약)
- `/docs/ADR.md` (ADR-005, ADR-014)
- `pipeline/tmi_pipeline/relay.py` (step 0에서 `pitcher_id`·`pitcher_ids`·`complete`·`Substitution` 추가)
- `pipeline/tmi_pipeline/snapshot.py`, `pipeline/tmi_pipeline/contract.py`
- `pipeline/tests/test_snapshot.py`, `pipeline/tests/test_contract.py`, `pipeline/tests/fixture_games.py`
- `src/types/data.ts` (`SceneRecord`), `src/data/appData.ts` (앱이 검증하는 장면 모양)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다.

## 배경 (2026-09-15 감사)

- **타선 오류**: `snapshot.py`의 타선이 "슬롯별 마지막 타자"라서 대주자·수비 교체가 빠진다. 16개 장면 모두 1~4칸이 틀렸다.
- **제목 오류**: 장면 제목 "마무리와 승부"는 사실이 아니다(그 투수는 마무리가 아니었다). "대타 한 방", "제구 싸움"은 결과를 암시한다.
- **id 스포일러**: `walkoff-slam`, `walkoff-walk` 같은 id가 결과를 드러낸다.
- **투수 교체**: 한 장면은 타석 도중 투수가 바뀌었다.

## 작업

### `pipeline/tmi_pipeline/snapshot.py`
1. **타선**: 장면 시점 출전 선수로 계산한다.
   - 양 팀 선발 타순에서 시작해, 대상 타석 이전의 `substitutions(game)`을 시간순으로 적용한다.
   - `slot`이 있는 교체는 그 팀 `lineup[slot - 1] = in_id`로 바꾼다.
   - 대주자로 들어와 누상에 있는 선수도 타순에 들어간다.
   - 교체로 들어온 선수의 이름·기록은 기존 `_substitution_names`·선수 기록 규칙을 따른다.
2. **슬롯**: 타순 슬롯(`slotAway`·`slotHome`)은 `complete` 타석만 세어 계산한다.
3. **투수**: 장면 투수는 대상 타석의 `pitcher_id`(첫 투구)다.
   - 타석 도중 투수가 바뀌었으면(`len(pitcher_ids) > 1`) `actual.notes` 끝에 "N구째부터 <이름> 등판"을 더한다. 이름은 교체 기록에서 찾고, 없으면 id를 쓴다.
4. **id**: 모든 장면 id는 `f"{gameId}-{pa_index}"`다. `CURATED` 목록은 id 문자열 대신 경기 id와 타석을 찾는 규칙으로 고른다. 기존 선정 장면 4개가 그대로 뽑혀야 한다.
5. **제목**: `situation_text(inning, half, outs, bases)`에 기록으로 확인되는 꼬리표만 붙인다.
   - 타자가 대타로 들어온 선수(교체 kind `pinch_hitter`)면 ", 대타"
   - 11회면 ", 마지막 이닝"
   - 그 밖의 결과·역할 추정 문구(마무리, 한 방, 제구 싸움, 끝내기)는 쓰지 않는다.
6. **`leverage`**: 계속 실제 |WPA|로 두고 장면 선정에만 쓴다. 계산하는 곳에 "장면 선정용, 화면 표시 금지(ADR-014)" 주석을 단다.

### 테스트
- 합성 픽스처로 확인할 것:
  - 대주자·수비 교체가 타선에 반영된다.
  - 누상 대주자가 타순에 있다.
  - 교체 직후 첫 투구 투수가 장면 투수다.
  - 타석 도중 교체 문구가 붙는다.
  - id에 결과 단어가 없다.
  - 제목 규칙(대타, 11회)이 맞다.
  - 미완료 타석은 슬롯 계산에서 빠진다.
- 앱 계약(`contract.py`)이 새 장면 모양도 통과한다.

## Acceptance Criteria

```bash
npm run test:py
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 실데이터로 앱 데이터를 다시 만든다. git worktree면 앞에 `TMI_RAW_DIR="C:/Users/김재일/Desktop/aiwanted/data/raw"`를 붙여 `npm run data`를 실행한다. 새 `data/build/app/scenes.json`을 메인 폴더의 기존 파일(`C:/Users/김재일/Desktop/aiwanted/data/build/app/scenes.json`, 읽기만)과 비교해 아래를 summary에 적는다.
   - 투수가 바뀐 장면(기대 2개: `20260818WOLT02026`, `20260825NCLG02026`)
   - 장면별로 바뀐 타선 칸 수
   - 새 id·제목
   - 선정 장면 4개가 남아 있는지
3. 아키텍처 체크리스트를 확인한다.
   - `snapshot.py`와 그 테스트 밖을 고치지 않았는가?
   - 앱 데이터 모양(`src/types/data.ts`)을 바꾸지 않았는가?
4. `phases/7-scene-data/index.json`의 step 1을 업데이트한다.
   - 성공: `"status": "completed"`, `"summary"`
   - 3회 실패: `"status": "error"`, `"error_message"`
   - 사용자 개입 필요: `"status": "blocked"`, `"blocked_reason"`

## 금지사항

- `data/`를 커밋하지 마라. 이유: 원자료 권리(ADR-005).
- 장면 JSON 필드를 추가·삭제·이름 변경하지 마라. 이유: 앱 로더(`appData.ts`)와 타입이 같은 모양을 검증한다.
- 제목에 결과를 암시하는 말(끝내기, 한 방, 결승)을 넣지 마라. 이유: 실제 결과는 경기가 끝날 때까지 가린다.
- 픽스처에 실존 선수 이름을 쓰지 마라. 이유: 공개 저장소.
- 기존 테스트를 깨뜨리지 마라.
