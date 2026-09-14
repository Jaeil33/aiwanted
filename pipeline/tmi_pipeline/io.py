"""원자료·생성물 JSON 입출력과 원자료 경로 규칙.

원자료(`RAW_DIR`) 구조:
  naver/relay/<gameId>.json                   문자중계
  naver/schedule/sched_full_YYYY-MM.json      월별 일정·결과
  naver/stats/stats_<시즌>_<HITTER|PITCHER>_all.json  시즌 기록
"""

import json
from pathlib import Path
from typing import Any


def load_json(path: Path | str) -> Any:
    """UTF-8 JSON 파일을 읽는다."""
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path: Path | str, obj: Any) -> None:
    """UTF-8·한글 그대로·구분자 압축으로 쓴다. 부모 폴더가 없으면 만든다."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def relay_game_paths(raw_dir: Path) -> list[Path]:
    """문자중계 경기 파일(이름순). 폴더가 없으면 빈 목록."""
    return sorted((Path(raw_dir) / "naver" / "relay").glob("*.json"), key=lambda p: p.name)


def schedule_paths(raw_dir: Path) -> list[Path]:
    """월별 일정 파일 `sched_full_YYYY-MM.json`(이름순 = 시간순)."""
    return sorted((Path(raw_dir) / "naver" / "schedule").glob("sched_full_*.json"), key=lambda p: p.name)


def season_stats_path(raw_dir: Path, season: int, kind: str) -> Path:
    """시즌 기록 파일 경로. kind는 "HITTER" 또는 "PITCHER"."""
    return Path(raw_dir) / "naver" / "stats" / f"stats_{season}_{kind}_all.json"


def load_schedule_games(raw_dir: Path) -> list[dict]:
    """모든 월 파일의 경기를 합친다. 같은 gameId는 뒤 파일의 값을 쓰고 처음 나온 자리를 지킨다."""
    by_id: dict[str, dict] = {}
    for path in schedule_paths(raw_dir):
        payload = load_json(path)
        for game in (payload.get("result") or {}).get("games") or []:
            by_id[game["gameId"]] = game
    return list(by_id.values())
