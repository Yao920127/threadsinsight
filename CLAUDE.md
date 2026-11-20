# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ThreadsInsight：輸入 Threads 帳號，以**確定性合成資料（Mock Dataset）**產生貼文並分析互動、NLP 歸因與內容策略。前端 Vite+ / TypeScript（無框架），後端 Python FastAPI，資料庫是 PostgreSQL（RLS），登入為自建 Email＋密碼（ADR-002）。產品需求在 `threadsinsight_prd-1.md`，API 與合成資料規格在 `threadsinsightapi.md`，架構決策在 `docs/architecture.md`（ADR-001、ADR-002）。線上版部署在 Railway（見 README「線上版」）。

## 指令

前端工具鏈是 Vite+ 的全域 CLI `vp`（不是 Vite 本身，套件管理用 bun）。`vp <name>` 是內建指令，`vp run <name>` 才是 `package.json` 的 script。執行 TS 腳本用 `vpx <file>`，不要加 tsx／ts-node。Vite+ 文件在 `node_modules/vite-plus/docs`。

```bash
# 開發（本機不跑資料庫；需要整套網站時用 docker compose）
vp install && uv sync
cp .env.example .env
docker compose up --build         # Postgres + 遷移 + API + 網站，:8080（選用）
vp run api:dev                    # FastAPI :8000（需要 DATABASE_URL 才能登入與存任務）
vp dev                            # 前端 :5173，/api 代理到 8000

# 檢查與測試
vp check                          # 格式 + lint + 型別（DESIGN.md 的格式錯誤是使用者的檔案，刻意不改）
vp test                           # Vitest；單檔：vp test src/ui/taskList.test.ts；單一測試：vp test -t "名稱"
vp run api:test                   # pytest + 覆蓋率；單一測試：uv run pytest api/tests/test_tasks_api.py::TestCreate::test_force_bypasses_cache
uv run ruff check api && uv run ruff format api
vp run e2e                        # Playwright，對線上版執行；E2E_BROWSER_CHANNEL=chrome 用本機 Chrome
vp run e2e:local                  # 對本機 docker compose（:8080）執行
vp exec playwright test -c e2e -g "名稱"   # 單一 E2E 測試
vp run build                      # tsc + 建置三個頁面
vp run mock:golden                # 重新產生跨語言 golden 檔（改產生器後）
vp run samples                    # 重新產生 data/、reports/ 範例（可加 帳號 --count N）
```

`vp run <script> -- args` 會把 `--` 原樣傳給腳本；給 Playwright 傳參數請用 `vp exec playwright …`。

## 架構重點

### 資料流與權限

- 登入（`auth_api.py`、`accounts.py`）：Email＋密碼，scrypt 雜湊（`passwords.py`）。登入狀態是 `ti_session` cookie（HttpOnly、Secure、SameSite=Strict），資料庫 `sessions` 只存 SHA-256。`require_user`（`dependencies.py`）從 cookie 查出使用者。前端請求一律 `credentials: "same-origin"`，沒有 Authorization 標頭。
- 業務資料一律經 `db.user_transaction`：交易一開始 `SET LOCAL ROLE threadsinsight_app` 並以 `set_config('app.user_id', …)` 帶上使用者，**RLS 決定看得到什麼**；不要自行加 `user_id` 條件做授權，也不要用擁有者身分查業務表。`users`、`sessions` 只能經 `db.owner_transaction`（受限角色沒有權限）。別人的任務在 RLS 下等同不存在，一律回 404。
- 會修改資料的請求帶著不同 Origin 會被 `app.py` 擋下（403）；nginx 以 `$http_host`（含埠號）轉送 Host，比對才正確。
- 重跑任務時，替換貼文與彙總並標為 completed 由資料庫函式 `save_analysis_results`（`security invoker`）在單一交易內完成，見 `db/migrations/`。遷移由 `docker/migrate.sh` 套用（Railway 的 `migrate` 服務與 docker compose 共用），已套用版本記在 `schema_migrations`；**已部署的遷移檔不能改，要改結構就新增檔案**。

### 分析管線（`api/threadsinsightapi/`）

- `pipeline.py`：`generate_mock_dataset` → `analyze_dataset`（clean → percentile 分群 → `run_nlp` → `compute_stats` → `build_strategy` 規則引擎）。
- `task_service.py` 把管線包成任務狀態流程 pending → generating → analyzing → completed／failed，在請求內同步執行。24 小時快取查 `completed_at`；停在進行中超過 3 分鐘的任務，於讀取列表時標為 failed（依 `started_at`）。
- `report.py`：`report_data`（API 回應格式）、`to_storage`／`from_storage`（資料庫欄位對應）。**不變式：從資料庫讀回的報告必須與當場分析的結果完全相同**，測試以往返比對確保。`published_at` 讀回後要轉回 `+08:00`，numeric 欄位讀回時要轉回 int。
- `ai_strategy.py`：Claude Haiku 5.5（`claude-haiku-5-5`）結構化輸出。`generate_ai_strategy` 不丟例外，任何失敗（逾時、拒答、截斷、輸出不合格）都退回規則引擎結果並附 `notice`。使用者可用 `X-User-Anthropic-Key` 標頭帶自己的金鑰。成功結果存回該任務的 `analysis_summaries.strategy_insights`。

### 合成資料的不變式

- 產生器以正規化帳號為種子（`generator.seed_for`），同帳號結果固定；較少篇數的結果是較多篇數的前綴。每 10 篇固定 3 高、4 中、3 低互動。
- 產生器有 Python（`api/threadsinsightapi/generator.py`）與 TS（`src/mock/`）兩份實作，共用 `shared/mock-content-library.json`，並以 `shared/fixtures/mock-golden.json` 確保兩邊輸出一致。改其中一邊就要同步另一邊並重產 golden。
- `data_source = 'mock_dataset'`、`is_synthetic = true`、網址必須是 `mock://threads/@…`：這些規則同時寫成資料庫約束與前端驗證（`src/api/validators.ts`）。不得產生指向 threads.com 的網址。

### 前端（`src/`）

- 三個 Vite 入口（見 `vite.config.ts` 的 rollupOptions）：`index.html` → `main.ts`（分析與任務）、`login.html` → `login.ts`、`compare.html` → `compare.ts`。正式環境由 nginx 對應 `/login`、`/compare`。
- 沒有框架：用 HTML 字串樣板，所有動態文字必須經過 `ui/html.ts` 的 `escapeHtml`；重繪的區塊以事件委派處理。API 回應在邊界以 `api/validators.ts`、`api/tasks.ts` 驗證後才使用。
- 部署版的 CSP 不允許行內腳本、行內樣式或 `eval`（`docker/nginx/security-headers.inc.template`）。動態樣式只能用 CSSOM，例如 `report.ts` 的 `applyBarRatios`，不要寫 `style="…"`。
- 受保護的頁面都用 `auth/protectedPage.ts` 初始化：`<html data-auth="pending">` 會先隱藏內容；API 回 401 時呼叫 `handleUnauthorized()`。
- 純邏輯（指標、比較、格式化、錯誤訊息）與 DOM 分開，純邏輯都有單元測試。

### 測試替身

- `api/tests/conftest.py` 每個測試都會覆寫兩個 FastAPI dependency：`get_account_store` 換成記憶體版 `FakeAccountStore`（預先有兩個帳號，`auth_support.auth_headers(USER_A／USER_B)` 帶它們的 cookie），`get_task_repository` 換成模擬 RLS 的 `FakeTaskRepository`（`fake_repository.py`，也模擬資料庫以 UTC 字串、浮點數回傳的格式）。`test_db.py` 以假連線池檢查每個交易都切換角色並帶使用者 ID。
- **單元測試不連資料庫**，SQL 寫錯它抓不到：改了 `db/migrations/` 或 `task_repository.py`／`accounts.py` 的查詢，要用 docker compose 或線上 E2E 實際驗證。
- Anthropic client 以 `tests_support.fake_success_client` 等假實作注入。測試不連網路，也不呼叫付費 API。
- E2E（`e2e/`）預設對線上版執行。每個測試以 API 自建 `e2e-…@example.com` 帳號（`useSession` 把 cookie 放進瀏覽器），結束時呼叫 `DELETE /api/auth/me` 刪除。註冊／登入每 IP 每分鐘 30 次，fixture 遇到 429 會等待重試。共用 `fixtures.ts` 的 `page` 會自動檢查 JS 錯誤與 CSP 違規。線上版不設伺服器 AI 金鑰，E2E 不會產生 AI 費用。
- Playwright 的字串型 `waitForFunction` 會被 CSP 擋下（需要 eval），請改用 locator 斷言。

### 日誌

`observability.py` 輸出一行一筆的 JSON。每個請求有 `request_id`（同時放在 `X-Request-ID` 標頭）。記錄事件請用 `log_event(logger, "事件名", **欄位)`：欄位只收基本型別，`token`、`email`、`content` 等欄位名會被丟掉。不要記錄查詢字串、提示內容或貼文內文。

## 專案限制

- **只使用合成資料**：不以登入的工作階段爬取 Threads，不混入真實貼文。
- **不使用真實帳號名稱**：程式、測試、文件與範例一律用虛構帳號，例如 `demo_user`、`another_demo`。
- **金鑰處理**：使用者在網頁輸入的 Anthropic 金鑰只存在 `sessionStorage`，以標頭傳送，不寫入資料庫、日誌或網址。`VITE_` 開頭的變數會打包進前端，不可放任何密鑰。日誌不記密碼、cookie、Email（`log_event` 會丟掉 `password`、`email` 等欄位名）。
- **jieba 0.42.1**：使用內附的繁體詞典 `api/threadsinsightapi/data/dict.txt.big`。pytest 已濾掉它的 SyntaxWarning；coverage 必須維持 `core = "sysmon"`，否則測試會從約 1 秒變成約 30 秒。
- **溝通語言**：與使用者溝通、撰寫文件一律用繁體中文（台灣用語）；程式碼、指令與專有名詞維持原文。
