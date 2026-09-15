# Step 3: collector

## 읽어야 할 파일

- `/CLAUDE.md`, `/docs/ARCHITECTURE.md`(데이터 흐름), `/docs/ADR.md`(ADR-005, ADR-017, ADR-021)
- `phases/14-live-data/step0.md`의 "배경: 네이버 응답 모양"
- `pipeline/tmi_pipeline/io.py`, `weather.py`(네트워크·캐시 방식), `build.py`와 테스트
- `scripts/run-python.ts`, `package.json`
- `phases/15-data-v2/index.json`의 summary

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라. 테스트를 먼저 쓴다(pytest, 네트워크 없이).

## 작업

### `pipeline/tmi_pipeline/collect.py`
```
python -m tmi_pipeline.collect --from YYYY-MM-DD --to YYYY-MM-DD [--raw-dir PATH] [--dry-run]
```
- 표준 라이브러리 `urllib`만 쓴다. 헤더: 일반 브라우저 `User-Agent`, `Accept: application/json`. Origin·Referer는 보내지 않는다. 제한 시간 10초, 요청 사이 최소 1.2초, 재시도 없음(실패는 로그와 종료 코드 1, 이미 받은 것은 남긴다).
- 일정: 기간의 경기 목록을 받아 `data/raw/naver/schedule/sched_full_YYYY-MM.json`에 gameId 기준으로 합친다(기존 파일 모양 `{"code", "success", "result": {"games": [...]}}` 유지).
- 중계: `RESULT`이고 취소가 아닌 경기 중 `data/raw/naver/relay/<gameId>.json`이 없는 것만. 파라미터 없는 relay로 `inn`을 알아낸 뒤 1..inn 이닝을 받아 `textRelays`를 `no`로 합치고, 기존 원자료 모양 `{ "game": <일정의 경기>, "textRelays": [...] }`에 `homeLineup`·`awayLineup`(마지막 payload 머리)을 더해 임시 파일에 쓴 뒤 이름을 바꾼다.
- `--dry-run`은 받을 목록과 요청 수만 출력한다.
- `package.json` scripts: `"collect": "tsx scripts/run-python.ts -m tmi_pipeline.collect"`.

### 테스트(pytest)
- 가짜 opener로: 헤더에 Origin 없음, 요청 간격(가짜 시계), 이미 있는 경기 건너뛰기, 취소·경기 전 제외, 이닝 합치기(중복 no), 원자 쓰기(중간 실패 시 파일 없음), 일정 합치기, dry-run 요청 수.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 로컬 수동 점검(네트워크 가능할 때): `npm run collect -- --from 2026-09-14 --to 2026-09-14 --dry-run` 결과를 summary에. 실제 수집은 하지 않는다(사용자 확인 뒤 메인 저장소에서 실행).
3. 체크리스트: `git status`에 `data/`가 없는가? 수집 코드가 `pipeline` 밖(앱·서버 함수)에 새지 않았는가?
4. `phases/15-data-v2/index.json`의 step 3과 `phases/index.json`의 15-data-v2 상태를 업데이트한다.

## 금지사항

- 테스트에서 실제 네트워크를 부르지 마라.
- 수집한 원자료를 커밋하지 마라. 이유: ADR-005.
- 시즌 전체를 한 번에 수집하는 기본값을 두지 마라(기간 필수). 이유: 요청 수가 수천 개가 된다.
