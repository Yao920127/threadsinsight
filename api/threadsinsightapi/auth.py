"""會員登入的規則與登入憑證（ADR-002：自建 Email＋密碼，不依賴外部登入服務）。

- 登入狀態放在 httpOnly cookie，網頁上的 JavaScript 讀不到；cookie 內是隨機值，
  資料庫只存它的 SHA-256，登出或刪帳號時在伺服器端作廢。
- Email 正規化為小寫；密碼長度 8–128 字元。錯誤訊息不透露帳號是否存在。
"""

import hashlib
import os
import re
import secrets
from dataclasses import dataclass
from datetime import timedelta

from threadsinsightapi.passwords import MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH

SESSION_COOKIE = "ti_session"
SESSION_TTL = timedelta(days=7)
TOKEN_BYTES = 32
MAX_EMAIL_LENGTH = 254
_EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]+$")


class AuthError(Exception):
    """未登入或登入狀態無效（回 401）。訊息給開發者看，不含 cookie 內容。"""


class InvalidCredentialsError(Exception):
    """Email 或密碼錯誤（回 401）；不區分是帳號不存在還是密碼錯。"""


class EmailTakenError(Exception):
    """註冊時 Email 已被使用（回 409）。"""


class InvalidSignupError(ValueError):
    """Email 或密碼格式不符（回 400）。"""


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str


def normalize_email(raw: str) -> str:
    email = raw.strip().lower()
    if len(email) > MAX_EMAIL_LENGTH or not _EMAIL.fullmatch(email):
        raise InvalidSignupError("Invalid email address")
    return email


def check_password_rules(password: str) -> None:
    if not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
        raise InvalidSignupError(
            f"Password must be {MIN_PASSWORD_LENGTH}-{MAX_PASSWORD_LENGTH} characters"
        )


def new_session_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def secure_cookies() -> bool:
    """正式環境走 HTTPS，cookie 只在 HTTPS 送出；本機 http 開發時設 COOKIE_SECURE=false。"""
    return os.environ.get("COOKIE_SECURE", "true").lower() != "false"
