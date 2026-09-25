"""TS 파서(`src/live/relay.ts`)와 대조할 기준값을 낸다.

`relay.py`가 읽은 타석·투구를 경기마다 압축해 JSON으로 쓴다. 쓰는 쪽은 `scripts/check-relay-parity.ts`다.
원자료를 읽기만 하고 네트워크를 부르지 않는다.

사용: python -m tmi_pipeline.parity <out.json> [--raw DIR] [--limit N]
"""

import argparse
import json
import sys
from pathlib import Path

from . import RAW_DIR
from .io import relay_game_paths
from .relay import load_game, plate_appearances, pitch_row, walk_pitches


def game_reference(game: dict) -> list[dict]:
    """한 경기의 타석을 대조용으로 줄인다. TS `plateAppearances`가 내야 하는 값과 같다."""
    out = []
    for pa in plate_appearances(game):
        rows = [
            pitch_row(t, pts, balls, strikes)
            for t, pts, balls, strikes in walk_pitches(pa.options, pa.pts_by_id)
            if pts is not None
        ]
        out.append({
            "index": pa.index,
            "inning": pa.inning,
            "half": pa.half,
            "batter": pa.batter_id,
            "pitcher": pa.pitcher_id,
            "batOrder": pa.bat_order,
            "outs": pa.state["outs"],
            "bases": pa.state["bases"],
            "away": pa.state["away"],
            "home": pa.state["home"],
            "event": pa.event,
            "runs": pa.runs_in,
            "complete": pa.complete,
            "rows": rows,
        })
    return out


def build(raw_dir: Path, limit: int | None = None) -> dict:
    paths = relay_game_paths(raw_dir)
    if limit is not None:
        paths = paths[:limit]
    games = {}
    for path in paths:
        game = load_game(path)
        games[(game.get("game") or {}).get("gameId", path.stem)] = game_reference(game)
    return {"games": games}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="tmi_pipeline.parity")
    parser.add_argument("out")
    parser.add_argument("--raw", default=str(RAW_DIR))
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args(argv)

    raw_dir = Path(args.raw)
    if not relay_game_paths(raw_dir):
        print(f"[parity] 중계 원자료가 없습니다: {raw_dir}", file=sys.stderr)
        return 2

    data = build(raw_dir, args.limit)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    pas = sum(len(v) for v in data["games"].values())
    print(f"[parity] 경기 {len(data['games'])}개, 타석 {pas}개 → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
