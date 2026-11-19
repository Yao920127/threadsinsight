import pytest

from threadsinsightapi.normalize import InvalidUsernameError, normalize_username


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("demo_user", "demo_user"),
        ("@demo_user", "demo_user"),
        ("  @Demo_User  ", "demo_user"),
        ("https://www.threads.com/@demo_user", "demo_user"),
        ("https://threads.com/@demo_user/", "demo_user"),
        ("https://www.threads.net/@demo.user_01?hl=zh-tw", "demo.user_01"),
        ("https://www.threads.com/@demo_user/post/ABC123", "demo_user"),
        ("www.threads.com/@demo_user", "demo_user"),
    ],
)
def test_normalizes_supported_forms(raw: str, expected: str) -> None:
    assert normalize_username(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "   ",
        "@",
        "bad name",
        "中文帳號",
        "a" * 31,
        "https://example.com/@demo_user",
        "https://www.threads.com/",
    ],
)
def test_rejects_invalid_input(raw: str) -> None:
    with pytest.raises(InvalidUsernameError, match="(?i)username"):
        normalize_username(raw)
