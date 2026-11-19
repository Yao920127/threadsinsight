"""ASGI 進入點：`uv run uvicorn index:app --app-dir api --reload`

啟動時讀取專案根目錄的 .env（由 .env.example 複製而來），已存在的環境變數優先、不會被覆蓋。
測試直接 import threadsinsightapi.app，不經過這裡，因此不會讀到本機金鑰。
"""

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)

from threadsinsightapi.app import app  # noqa: E402  先載入 .env 再建立 app
from threadsinsightapi.observability import configure_logging  # noqa: E402

configure_logging()

__all__ = ["app"]
