"""TMI 야구 데이터 파이프라인: data/raw 원자료를 data/build 앱 데이터로 만든다."""

import os
from pathlib import Path

__version__ = "0.1.0"

# 저장소 루트: pipeline/tmi_pipeline/__init__.py에서 두 단계 위
ROOT = Path(__file__).resolve().parents[2]

# 원자료 캐시(네이버·Open-Meteo). 환경변수 TMI_RAW_DIR로 바꿀 수 있다.
RAW_DIR = Path(os.environ["TMI_RAW_DIR"]) if os.environ.get("TMI_RAW_DIR") else ROOT / "data" / "raw"

# 생성물(앱 데이터·검증 결과)
BUILD_DIR = ROOT / "data" / "build"
