import json

import pytest

from tmi_pipeline import ROOT, contract

MEASURED_IDS = [
    "temp_c", "wind_ms", "rain_pre3h", "day_game", "weekend",
    "travel_km", "after_off_day", "starter_short_rest", "starter_long_rest", "home",
]


def test_measured_path_is_the_shared_json():
    assert contract.MEASURED_PATH == ROOT / "src" / "domain" / "measured.json"
    assert contract.MEASURED_PATH.is_file()


def test_load_measured_reads_the_json_as_is():
    defs = contract.load_measured()
    assert [d["id"] for d in defs] == MEASURED_IDS
    assert defs == json.loads(contract.MEASURED_PATH.read_text(encoding="utf-8"))


def test_only_home_is_not_applicable():
    assert [d["id"] for d in contract.load_measured() if not d["applicable"]] == ["home"]


def test_measured_by_id():
    by_id = contract.measured_by_id()
    assert list(by_id) == MEASURED_IDS
    assert by_id["wind_ms"]["perLabel"] == "바람이 5m/s 강해질 때"


@pytest.mark.parametrize(
    ("variable", "value", "expected"),
    [
        ("temp_c", 30, 1.0),
        ("temp_c", 50, 2.0),  # 40으로 잘림
        ("temp_c", -20, -3.0),  # -10으로 잘림
        ("temp_c", 20, 0.0),
        ("wind_ms", -3, 0.0),
        ("travel_km", 600, 1.5),
        ("day_game", 5, 1.0),
        ("day_game", -1, 1.0),
        ("day_game", 0, 0.0),
    ],
)
def test_transform_value_follows_the_typescript_rule(variable, value, expected):
    assert contract.transform_value(contract.measured_by_id()[variable], value) == expected


def test_linear_without_bounds_is_not_clamped():
    defn = {"id": "x", "transform": {"kind": "linear", "center": 0, "per": 2}}
    assert contract.transform_value(defn, 10) == 5.0
    assert contract.transform_value(defn, -10) == -5.0


def test_unknown_transform_kind_raises():
    with pytest.raises(ValueError):
        contract.transform_value({"id": "x", "transform": {"kind": "log"}}, 1)


def test_event_order_matches_event_vector():
    assert contract.EVENT_ORDER == ["K", "BB", "HR", "3B", "2B", "1B", "OUT"]


def test_pitch_types_match_typescript():
    assert contract.PITCH_TYPES == ["직구", "투심", "커터", "슬라이더", "스위퍼", "커브", "체인지업", "포크", "기타"]


def test_pitch_result_code_maps_naver_results_to_pitch_row_codes():
    assert contract.PITCH_RESULT_CODE == {"B": 0, "T": 1, "S": 2, "V": 2, "F": 3, "W": 3, "H": 4}
