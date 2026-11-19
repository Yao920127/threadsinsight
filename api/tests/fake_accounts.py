"""記憶體版 AccountStore：行為與 PostgreSQL 版相同（重複 Email、過期判斷、連帶刪除）。

每個實例預先建立 auth_support 的兩個帳號與它們的登入狀態。
"""

import uuid
from dataclasses import dataclass, field

from auth_support import EMAILS, SESSION_TOKENS

from threadsinsightapi.auth import AuthUser, EmailTakenError, new_session_token, token_hash
from threadsinsightapi.passwords import hash_password

DEFAULT_PASSWORD = "seed-password-1"


@dataclass
class FakeAccountStore:
    users: dict[str, tuple[AuthUser, str]] = field(default_factory=dict)  # email → (user, hash)
    sessions: dict[str, str] = field(default_factory=dict)  # token hash → user id
    deleted_users: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        seed_hash = hash_password(DEFAULT_PASSWORD)
        for user_id, email in EMAILS.items():
            self.users[email] = (AuthUser(id=user_id, email=email), seed_hash)
            self.sessions[token_hash(SESSION_TOKENS[user_id])] = user_id

    def create_user(self, email: str, password_hash: str) -> AuthUser:
        if email in self.users:
            raise EmailTakenError
        user = AuthUser(id=str(uuid.uuid4()), email=email)
        self.users[email] = (user, password_hash)
        return user

    def find_credentials(self, email: str) -> tuple[AuthUser, str] | None:
        return self.users.get(email)

    def create_session(self, user_id: str) -> str:
        token = new_session_token()
        self.sessions[token_hash(token)] = user_id
        return token

    def user_for_session(self, token: str) -> AuthUser | None:
        user_id = self.sessions.get(token_hash(token))
        return next((u for u, _ in self.users.values() if u.id == user_id), None)

    def delete_session(self, token: str) -> None:
        self.sessions.pop(token_hash(token), None)

    def delete_user(self, user_id: str) -> None:
        self.users = {e: v for e, v in self.users.items() if v[0].id != user_id}
        self.sessions = {t: u for t, u in self.sessions.items() if u != user_id}
        self.deleted_users.append(user_id)
