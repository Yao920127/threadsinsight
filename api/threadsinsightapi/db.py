"""PostgreSQL 連線（psycopg 3 連線池）。

- `user_transaction`：一般請求用。交易一開始就切換成權限受限的 threadsinsight_app 角色，
  並以 set_config 告訴資料庫目前的使用者，RLS 依此只放行本人的資料（ADR-002）。
- `owner_transaction`：只給帳號與登入狀態使用（users、sessions），一般請求的角色碰不到這兩張表。

連線失敗、逾時都轉成 RepositoryError（API 回 503），訊息不含連線字串或密碼。
"""

import os
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime
from decimal import Decimal
from functools import cache
from typing import Any
from uuid import UUID

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout

APP_ROLE = "threadsinsight_app"
POOL_MIN_SIZE = 1
POOL_MAX_SIZE = 5
POOL_TIMEOUT_SECONDS = 10.0

Row = dict[str, Any]


class RepositoryError(Exception):
    """資料庫無法使用或回應不符預期（回 503）；訊息不含連線資訊或使用者資料。"""


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RepositoryError("DATABASE_URL is not set")
    return url


@cache
def shared_pool() -> ConnectionPool:
    pool = ConnectionPool(
        database_url(),
        min_size=POOL_MIN_SIZE,
        max_size=POOL_MAX_SIZE,
        timeout=POOL_TIMEOUT_SECONDS,
        kwargs={"row_factory": dict_row},
        open=False,
    )
    pool.open(wait=False)
    return pool


@contextmanager
def _transaction(pool: ConnectionPool) -> Iterator[psycopg.Cursor[Row]]:
    try:
        with pool.connection() as conn, conn.transaction(), conn.cursor() as cur:
            yield cur
    except (psycopg.OperationalError, PoolTimeout) as error:
        raise RepositoryError(f"database unavailable: {type(error).__name__}") from error


@contextmanager
def user_transaction(pool: ConnectionPool, user_id: str) -> Iterator[psycopg.Cursor[Row]]:
    with _transaction(pool) as cur:
        cur.execute(f"set local role {APP_ROLE}")
        cur.execute("select set_config('app.user_id', %s, true)", (user_id,))
        yield cur


@contextmanager
def owner_transaction(pool: ConnectionPool) -> Iterator[psycopg.Cursor[Row]]:
    with _transaction(pool) as cur:
        yield cur


def _plain(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    return value


def jsonable(row: Row) -> Row:
    """資料庫回傳的時間、UUID、numeric 轉成 JSON 可用的字串與數字（與 API 回傳格式一致）。"""
    return {key: _plain(value) for key, value in row.items()}
