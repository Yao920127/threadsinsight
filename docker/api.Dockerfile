# ThreadsInsight API（FastAPI）。只含執行所需的套件，以非 root 使用者執行。
# 金鑰不寫進映像檔：ANTHROPIC_API_KEY 等由 docker compose 在執行時以環境變數提供。

FROM ghcr.io/astral-sh/uv:0.12.15 AS uv

FROM python:3.12-slim-trixie AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never
WORKDIR /app
# 先只複製相依清單，程式碼變動時不必重新安裝套件
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.12-slim-trixie
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
RUN groupadd --system app && useradd --system --gid app --no-create-home app
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY shared ./shared
COPY api ./api
USER app
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)"]
# api/serve.py：同時接受 IPv4 與 IPv6（Railway 私有網路是 IPv6），埠號取自 PORT（預設 8000）；
# 信任 nginx 轉送的來源資訊，請求由應用程式以 JSON 記錄（不用 uvicorn 的存取紀錄，它含查詢字串）。
CMD ["python", "api/serve.py"]
