import json
from pathlib import Path

import pytest

from threadsinsightapi.content import LIBRARY_PATH, load_library


def test_loads_shared_library() -> None:
    library = load_library()
    assert len(library.topics) == 4
    assert set(library.tier_style) == {"high", "medium", "low"}


def test_rejects_library_with_missing_keys(tmp_path: Path) -> None:
    path = tmp_path / "library.json"
    path.write_text(json.dumps({"topics": []}), encoding="utf-8")
    with pytest.raises(ValueError, match="Malformed"):
        load_library(path)


def test_rejects_library_with_empty_topic(tmp_path: Path) -> None:
    source = json.loads(LIBRARY_PATH.read_text(encoding="utf-8"))
    source["topics"][0]["bodies"] = []
    path = tmp_path / "library.json"
    path.write_text(json.dumps(source), encoding="utf-8")
    with pytest.raises(ValueError, match="empty topic"):
        load_library(path)
