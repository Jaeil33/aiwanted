import json

import tmi_pipeline
from tmi_pipeline import build


def _recording_stage(name, calls, summary):
    def run(raw_dir, out_dir):
        calls.append((name, raw_dir, out_dir))
        return summary

    return run


def test_stages_is_a_registry_of_callables():
    assert isinstance(build.STAGES, dict)
    assert all(callable(fn) for fn in build.STAGES.values())


def test_unknown_stage_prints_available_stages_and_returns_2(monkeypatch, capsys, tmp_path):
    calls = []
    monkeypatch.setattr(build, "STAGES", {"alpha": _recording_stage("alpha", calls, {}), "beta": _recording_stage("beta", calls, {})})
    code = build.main(["--only", "alpha,nope", "--raw", str(tmp_path), "--out", str(tmp_path)])
    assert code == 2
    assert calls == []
    out = capsys.readouterr().out
    assert "nope" in out
    assert "alpha" in out and "beta" in out


def test_only_runs_selected_stages_in_registered_order(monkeypatch, capsys, tmp_path):
    calls = []
    monkeypatch.setattr(build, "STAGES", {
        "a": _recording_stage("a", calls, {"rows": 1}),
        "b": _recording_stage("b", calls, {"rows": 2}),
        "c": _recording_stage("c", calls, {"장면": 3}),
    })
    code = build.main(["--only", "c, a", "--raw", str(tmp_path / "raw"), "--out", str(tmp_path / "out")])
    assert code == 0
    assert calls == [("a", tmp_path / "raw", tmp_path / "out"), ("c", tmp_path / "raw", tmp_path / "out")]
    out = capsys.readouterr().out
    assert json.dumps({"rows": 1}) in out
    assert json.dumps({"장면": 3}, ensure_ascii=False) in out
    assert "rows\": 2" not in out


def test_without_only_runs_every_stage_with_default_dirs(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(tmi_pipeline, "RAW_DIR", tmp_path / "raw-default")
    monkeypatch.setattr(tmi_pipeline, "BUILD_DIR", tmp_path / "build-default")
    monkeypatch.setattr(build, "STAGES", {"a": _recording_stage("a", calls, {}), "b": _recording_stage("b", calls, {})})
    assert build.main([]) == 0
    assert calls == [
        ("a", tmp_path / "raw-default", tmp_path / "build-default"),
        ("b", tmp_path / "raw-default", tmp_path / "build-default"),
    ]
