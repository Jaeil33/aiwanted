"""파이프라인 CLI: 등록된 stage를 돌려 data/raw 원자료로 data/build 생성물을 만든다.

사용: npm run data -- [--only snapshot,context] [--raw DIR] [--out DIR]
"""

import argparse
import json
from pathlib import Path
from typing import Callable

import tmi_pipeline

# stage 이름 → fn(raw_dir, out_dir) -> 요약 dict. 등록 순서가 실행 순서다(뒤 stage가 앞 stage 산출물을 읽는다).
STAGES: dict[str, Callable[[Path, Path], dict]] = {}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tmi_pipeline.build", description="TMI 야구 데이터 파이프라인")
    parser.add_argument("--only", default=None, help="쉼표로 구분한 stage 이름 (기본: 등록된 전부)")
    parser.add_argument("--raw", type=Path, default=None, help="원자료 폴더 (기본: RAW_DIR, 환경변수 TMI_RAW_DIR)")
    parser.add_argument("--out", type=Path, default=None, help="생성물 폴더 (기본: BUILD_DIR)")
    args = parser.parse_args(argv)

    raw_dir = args.raw if args.raw is not None else tmi_pipeline.RAW_DIR
    out_dir = args.out if args.out is not None else tmi_pipeline.BUILD_DIR

    if args.only:
        wanted = [name.strip() for name in args.only.split(",") if name.strip()]
        unknown = [name for name in wanted if name not in STAGES]
        if unknown:
            print(f"알 수 없는 stage: {', '.join(unknown)}")
            print(f"사용 가능한 stage: {', '.join(STAGES) if STAGES else '(없음)'}")
            return 2
        selected = [name for name in STAGES if name in wanted]
    else:
        selected = list(STAGES)

    for name in selected:
        summary = STAGES[name](raw_dir, out_dir)
        print(f"[{name}] {json.dumps(summary, ensure_ascii=False, default=str)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
