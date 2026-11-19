"""所有端點共用的回應信封：{success, data, error}。"""

from typing import Any

from fastapi.responses import JSONResponse

DATA_SOURCE_HEADERS = {"X-Data-Source": "mock_dataset"}
# 回應依使用者與金鑰而不同，一律不允許瀏覽器或代理伺服器快取
NO_STORE = {"Cache-Control": "no-store"}


def envelope(
    status_code: int,
    data: Any = None,
    error: str | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"success": error is None, "data": data, "error": error},
        headers={**DATA_SOURCE_HEADERS, **NO_STORE, **(headers or {})},
    )
