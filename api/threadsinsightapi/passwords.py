"""密碼雜湊（scrypt，Python 標準庫）。

儲存格式：`scrypt$<n>$<r>$<p>$<salt>$<hash>`（salt 與 hash 為 base64），參數跟著雜湊一起存，
日後調高強度時舊密碼仍能驗證。比對一律用固定時間比較，避免從回應時間推測內容。
"""

import base64
import hashlib
import hmac
import secrets
from functools import cache

SCHEME = "scrypt"
N = 2**14  # CPU／記憶體成本；約 50 毫秒一次
R = 8
P = 1
SALT_BYTES = 16
KEY_BYTES = 32
MAX_MEMORY = 64 * 1024 * 1024

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128  # 設上限，避免超長輸入拖慢雜湊


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _derive(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=n, r=r, p=p, maxmem=MAX_MEMORY, dklen=KEY_BYTES
    )


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(SALT_BYTES)
    digest = _derive(password, salt, N, R, P)
    return f"{SCHEME}${N}${R}${P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    """格式不對或任何解析錯誤都當成不符，不丟例外。"""
    try:
        scheme, n, r, p, salt, digest = stored.split("$")
        if scheme != SCHEME:
            return False
        expected = base64.b64decode(digest)
        actual = _derive(password, base64.b64decode(salt), int(n), int(r), int(p))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


@cache
def _dummy_hash() -> str:
    return hash_password(secrets.token_urlsafe(16))


def burn_time(password: str) -> None:
    """帳號不存在時也做一次同樣成本的比對，讓「帳號存在與否」無法從回應時間看出來。"""
    verify_password(password, _dummy_hash())
