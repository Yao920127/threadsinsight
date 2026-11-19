"""帳號與登入狀態的存取（users、sessions）。

這兩張表只由後端以資料庫擁有者身分存取：一般請求使用的受限角色碰不到密碼雜湊。
正式實作連 PostgreSQL；測試以記憶體版取代（api/tests/fake_accounts.py）。
"""

from datetime import UTC, datetime
from typing import Protocol

import psycopg
from psycopg_pool import ConnectionPool

from threadsinsightapi.auth import (
    SESSION_TTL,
    AuthUser,
    EmailTakenError,
    new_session_token,
    token_hash,
)
from threadsinsightapi.db import RepositoryError, owner_transaction


class AccountStore(Protocol):
    def create_user(self, email: str, password_hash: str) -> AuthUser: ...
    def find_credentials(self, email: str) -> tuple[AuthUser, str] | None: ...
    def create_session(self, user_id: str) -> str: ...
    def user_for_session(self, token: str) -> AuthUser | None: ...
    def delete_session(self, token: str) -> None: ...
    def delete_user(self, user_id: str) -> None: ...


def _user(row: dict) -> AuthUser:
    return AuthUser(id=str(row["id"]), email=row["email"])


class PostgresAccountStore:
    def __init__(self, pool: ConnectionPool) -> None:
        self._pool = pool

    def create_user(self, email: str, password_hash: str) -> AuthUser:
        try:
            with owner_transaction(self._pool) as cur:
                cur.execute(
                    "insert into users (email, password_hash) values (%s, %s) returning id, email",
                    (email, password_hash),
                )
                row = cur.fetchone()
        except psycopg.errors.UniqueViolation as error:
            raise EmailTakenError from error
        if row is None:  # insert … returning 一定回傳一列，防萬一
            raise RepositoryError("user insert returned nothing")
        return _user(row)

    def find_credentials(self, email: str) -> tuple[AuthUser, str] | None:
        with owner_transaction(self._pool) as cur:
            cur.execute("select id, email, password_hash from users where email = %s", (email,))
            row = cur.fetchone()
        return (_user(row), row["password_hash"]) if row else None

    def create_session(self, user_id: str) -> str:
        token = new_session_token()
        with owner_transaction(self._pool) as cur:
            # 順便清掉過期的登入狀態，表格不會無限成長
            cur.execute("delete from sessions where expires_at < now()")
            cur.execute(
                "insert into sessions (token_hash, user_id, expires_at) values (%s, %s, %s)",
                (token_hash(token), user_id, datetime.now(UTC) + SESSION_TTL),
            )
        return token

    def user_for_session(self, token: str) -> AuthUser | None:
        with owner_transaction(self._pool) as cur:
            cur.execute(
                "select u.id, u.email from sessions s join users u on u.id = s.user_id "
                "where s.token_hash = %s and s.expires_at > now()",
                (token_hash(token),),
            )
            row = cur.fetchone()
        return _user(row) if row else None

    def delete_session(self, token: str) -> None:
        with owner_transaction(self._pool) as cur:
            cur.execute("delete from sessions where token_hash = %s", (token_hash(token),))

    def delete_user(self, user_id: str) -> None:
        """刪除帳號；任務、貼文、報告與登入狀態都會連帶刪除。"""
        with owner_transaction(self._pool) as cur:
            cur.execute("delete from users where id = %s", (user_id,))
