"""Threads username 正規化。行為與 src/mock/normalizeUsername.ts 一致。"""

import re
from urllib.parse import urlsplit

_USERNAME_PATTERN = re.compile(r"[a-z0-9._]{1,30}")
_THREADS_HOSTS = frozenset({"threads.com", "www.threads.com", "threads.net", "www.threads.net"})


class InvalidUsernameError(ValueError):
    """輸入不是合法的 Threads username 或帳號 URL。"""


def _looks_like_url(value: str) -> bool:
    return "/" in value or "://" in value or value.startswith("www.")


def _extract_from_url(value: str) -> str:
    with_scheme = value if "://" in value else f"https://{value}"
    try:
        parts = urlsplit(with_scheme)
        hostname = parts.hostname
    except ValueError as error:
        raise InvalidUsernameError(f"Invalid Threads username or URL: {value}") from error
    if hostname not in _THREADS_HOSTS:
        raise InvalidUsernameError(f"Invalid Threads username URL host: {hostname}")
    first_segment = next((segment for segment in parts.path.split("/") if segment), "")
    if not first_segment.startswith("@"):
        raise InvalidUsernameError(f"Threads URL does not contain a username: {value}")
    return first_segment[1:]


def normalize_username(raw: str) -> str:
    """將 username 正規化為小寫。

    接受 `demo_user`、`@demo_user` 或 `https://www.threads.com/@demo_user`。
    """
    trimmed = raw.strip()
    if _looks_like_url(trimmed):
        candidate = _extract_from_url(trimmed)
    else:
        candidate = trimmed[1:] if trimmed.startswith("@") else trimmed
    username = candidate.lower()
    if not _USERNAME_PATTERN.fullmatch(username):
        raise InvalidUsernameError(f"Invalid Threads username: {raw!r}")
    return username
