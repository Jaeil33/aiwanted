import importlib

import tmi_pipeline


def test_version_is_a_non_empty_string():
    assert isinstance(tmi_pipeline.__version__, str)
    assert tmi_pipeline.__version__


def test_root_is_the_repository_root():
    assert (tmi_pipeline.ROOT / "CLAUDE.md").is_file()


def test_data_dirs_default_to_data_folder(monkeypatch):
    monkeypatch.delenv("TMI_RAW_DIR", raising=False)
    module = importlib.reload(tmi_pipeline)
    assert module.RAW_DIR == module.ROOT / "data" / "raw"
    assert module.BUILD_DIR == module.ROOT / "data" / "build"


def test_raw_dir_follows_environment_variable(monkeypatch, tmp_path):
    monkeypatch.setenv("TMI_RAW_DIR", str(tmp_path))
    try:
        module = importlib.reload(tmi_pipeline)
        assert module.RAW_DIR == tmp_path
    finally:
        monkeypatch.delenv("TMI_RAW_DIR", raising=False)
        importlib.reload(tmi_pipeline)
