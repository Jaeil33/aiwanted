"""앱의 공용 계약(src/types/data.ts, src/domain)과 같은 값을 파이프라인에서 쓰는 상수와 도우미."""

import json

from . import ROOT

# 실측 변수 정의의 원본. 앱(src/domain/measured.ts)과 같은 파일을 읽는다.
MEASURED_PATH = ROOT / "src" / "domain" / "measured.json"

# 사건 벡터 순서 (src/types/domain.ts EventIndex)
EVENT_ORDER = ["K", "BB", "HR", "3B", "2B", "1B", "OUT"]

# PitchRow type 인덱스의 구종 이름 (src/domain/events.ts PITCH_TYPES)
PITCH_TYPES = ["직구", "투심", "커터", "슬라이더", "스위퍼", "커브", "체인지업", "포크", "기타"]

# 네이버 중계 pitchResult → PitchRow code (0 B·1 T·2 S·3 F·4 X)
PITCH_RESULT_CODE = {"B": 0, "T": 1, "S": 2, "V": 2, "F": 3, "W": 3, "H": 4}

# 같은 선수 id가 타자·투수 둘 다일 때 타자 레코드에 붙이는 꼬리 (ADR-035).
# 투수는 `<id>`, 타자는 `<id>:H`. TS 쪽은 src/data/appData.ts의 hitterOf·pitcherOf가 푼다.
HITTER_KEY_SUFFIX = ":H"

# data/build/app/core.json 크기 예산. 넘으면 build를 멈춘다 (ADR-023·ADR-035).
CORE_SIZE_BUDGET_KB = 200


def load_measured() -> list[dict]:
    """measured.json 전체를 파일 순서대로 읽는다."""
    return json.loads(MEASURED_PATH.read_text(encoding="utf-8"))


def measured_by_id() -> dict[str, dict]:
    """실측 변수 id → 정의."""
    return {defn["id"]: defn for defn in load_measured()}


def transform_value(defn: dict, value: float) -> float:
    """원래 값을 효과 단위로 바꾼다(TS transformValue와 같은 규칙).

    linear는 min·max로 자른 뒤 (v - center) / per, indicator는 0이 아니면 1.
    """
    transform = defn["transform"]
    kind = transform.get("kind")
    if kind == "indicator":
        return 1.0 if value != 0 else 0.0
    if kind == "linear":
        v = float(value)
        if "min" in transform:
            v = max(v, float(transform["min"]))
        if "max" in transform:
            v = min(v, float(transform["max"]))
        return (v - transform["center"]) / transform["per"]
    raise ValueError(f"unknown transform kind {kind!r} for {defn.get('id')!r}")
