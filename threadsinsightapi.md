# `threadsinsightapi` 合成資料（Mock Dataset）規格書

- **API 服務名稱**：`threadsinsightapi`
- **目標對齊平台**：`https://www.threads.com`
- **資料取得策略**：**一律使用 Mock Dataset 規則（合成擬真資料）**
- **端點**：
  - `GET /api/mock-posts?username={username 或帳號 URL}&count={1–50}`：完整分析報告（含規則引擎策略），不呼叫 LLM。
  - `GET /api/ai-strategy?username=…&count=…`：Claude Haiku 5.5 策略建議（見第 2.2 節）。
  - 回應格式皆為 `{ "success", "data", "error" }`，並附 `X-Data-Source: mock_dataset` 標頭。
- **文件版本**：2026-11-19 修訂，貼文數範圍由「至少 30 篇（上限 50）」改為「1–50 篇（預設 30）」，並補充小樣本的互動層級保證。

---

## 1. 輸入規格與數量門檻

- **目標輸入**：Threads 帳號名稱（`username`）或完整帳號 URL。
- **數量範圍**：每次請求生成並回傳 **1–50 篇**不重複合成貼文（`count` 參數，預設 30 篇）。超出範圍或非整數時回傳 `400`，不自動修正數值。
- **前綴一致性**：同一帳號一律先生成 50 篇再取前 `count` 篇，較少篇數的結果必為較多篇數結果的前綴。

---

## 2. 每篇貼文必備的核心欄位

`threadsinsightapi` 產出的每筆貼文資料，必須包含以下核心欄位與合成標記：

| 欄位名稱                                 | 資料型別            | 產出與內容說明                                                      | 後續清理與分析用途                                                  |
| :--------------------------------------- | :------------------ | :------------------------------------------------------------------ | :------------------------------------------------------------------ |
| **貼文 URL**（`post_url`）               | `string`            | 固定使用不可點擊的偽協議格式：`mock://threads/@{username}/post/{n}` | 作為唯一識別碼，用來驗證與移除重複貼文，並防止假連結誤導。          |
| **合成標記**（`is_synthetic`）           | `boolean`           | 固定為 `true`                                                       | 逐筆明確標示該紀錄為合成資料。                                      |
| **發文時間**（`published_at`）           | `string (ISO-8601)` | 統一為 `Asia/Taipei (UTC+8)` 時區之近期時間戳                       | 統計星期幾、幾點發文最多，分析發文時段分布。                        |
| **文字內容**（`content`）                | `string`            | 通用社群範例主題內文（涵蓋職場、生活、科技、觀點等）                | 計算字數、hashtag、mention、URL 數量，並進行 NLP 主題與關鍵字分析。 |
| **曝光數**（`views_count`）              | `number \| null`    | 模擬真實貼文瀏覽次數（依比例設定部分貼文為 `null` 模擬未公開情況）  | 計算總瀏覽數與互動率，並驗證清理管線對 `null` 值的容錯處理。        |
| **like 數**（`likes_count`）             | `number`            | 按讚數量（具高／中／低三層級差異分布）                              | 計算平均按讚數，並作為互動分群（高／中／低三組）的核心指標。        |
| **reply 數**（`replies_count`）          | `number`            | 回覆留言數量（具高／中／低三層級差異分布）                          | 計算平均回覆數，並與按讚數共同作為互動分群的核心指標。              |
| **repost / quote 數**（`reposts_count`） | `number`            | 轉發與引用次數                                                      | 計算平均轉發數與總互動數（讚、回覆、轉發與引用加總）。              |

### 2.1 清理後附加欄位（PRD F3 第 2 步）

端點回傳前先經清理管線（`api/threadsinsightapi/cleaning.py`），每篇貼文另附下列欄位，整批外層附 `cleaning` 統計（`input_count`、`output_count`、`duplicates_removed`、`invalid_removed`）：

| 欄位               | 定義                                                                                  |
| :----------------- | :------------------------------------------------------------------------------------ |
| `engagement_score` | `likes_count + 2 × replies_count`                                                     |
| `char_count`       | 去除網址與所有空白後的字元數                                                          |
| `hashtag_count`    | 去除網址後，`#` 接文字且前面不是文字、`#`、`&` 的次數（排除 `C#`、HTML 實體）         |
| `mention_count`    | 去除網址後，`@` 接 1–30 個 `[a-z0-9._]` 且前面不是文字、`@`、`.` 的次數（排除 email） |
| `url_count`        | `http://`、`https://` 或 `www.` 開頭的網址數                                          |
| `post_type`        | 單一主要類型，優先順序：`image` > `link` > `hashtag` > `mention` > `text_only`        |

分群（`api/threadsinsightapi/grouping.py`，PRD F4 第 2 步）：每篇另附 `engagement_group`（`high`／`medium`／`low`），整批外層附 `grouping`（`high`、`medium`、`low`、`total`、`small_sample`）。依 `engagement_score` 由高到低排名，高、低兩組各取 `round(n × 30%)` 篇（.5 進位，即 `(3n + 5) // 10`），其餘為中組；例如 n=10 → 3/4/3、n=5 → 2/1/2、n=1 → 0/1/0。同分貼文一律同組，落在切點時歸入較高的組，因此高組可能略多於 30%。總篇數 < 10 時 `small_sample = true`。分群只看分數，不讀生成器的 `engagement_tier`。

基礎統計（`api/threadsinsightapi/stats.py`、`keywords.py`，PRD F4 第 1 步）：整批外層附 `stats`。「互動數」指 `likes + replies + reposts`，平均值四捨五入到小數第一位。

- `averages`：平均讚、回覆、轉發、互動數與字數。
- `length_buckets`：依 `char_count` 分為 `0-50`、`51-100`、`101-200`、`201-400`、`401+`（上下限皆含），各附篇數與平均互動數；`post_types` 同理，固定依 `text_only`、`image`、`link`、`hashtag`、`mention` 排列。
- `weekday_hour`：7 列（星期一…星期日）× 24 欄（0…23 時，台北時間）的發文篇數。
- `top_hashtags`、`top_keywords`：各取前 10 名，以「出現在幾篇貼文」計數（同篇重複只算一次），同頻率依 Unicode 碼位排序。hashtag 不分大小寫合併；關鍵字以 Jieba 斷詞，先移除網址、hashtag、mention，只保留 2 字以上、含中文或英文字母且不在停用詞表內的詞。

NLP 內容歸因（`api/threadsinsightapi/text_features.py`、`attribution.py`，PRD F4 第 3 步，方法代號 `rule_based_v1`）：全部以規則與詞典判斷，結果可重現，不呼叫外部模型。

- 每篇另附 `topic`（`career`／`life`／`tech`／`opinion`／`other`，依主題詞典命中數，平手依此順序）、`sentiment`（`positive`／`neutral`／`negative`，以情緒詞典計算 (正向 − 負向) ÷ 情緒詞數，門檻 ±0.2）、`has_question`（含全形或半形問號）、`has_cta`（含「留言」「分享」「想聽聽」「你們」等邀請互動用語）。
- 整批外層附 `nlp`：`topics`（各主題篇數與平均互動數）、`baseline`（全部貼文的結構特徵）、`groups`（高、中、低三組）。
- 抽樣：每組取 `min(5, 該組篇數)` 篇——高互動取分數最高、中互動取最接近該組中位數、低互動取分數最低，同分依原順序；0 篇的組 `insufficient = true` 並略過歸因。
- 各組 `keywords` 為 TF-IDF（每組樣本視為一份文件，idf = ln((1 + N) ÷ (1 + df))，三組共有的詞權重為 0 不列入；只有一組有樣本時退回詞頻），取前 5 個。
- 各組 `observations`：樣本的結構特徵比例與 `baseline` 相差至少 20 個百分點（平均字數相差至少 20%）才列出，屬相關性觀察，不代表因果。

策略觀察（`api/threadsinsightapi/strategy.py`，PRD F4 第 4 步的規則引擎，亦為 LLM 失敗時的備援）：整批外層附 `strategy`（`source = "rule_engine"`）。

- `insights` 固定 3 點：在發文時段（3 小時一格）、貼文類型、主題、字數區間、是否提問、是否用 hashtag、是否附連結各面向，找出平均互動數（讚 + 回覆 + 轉發）與整體差距最大的組合，取差距最大的前 3 點；「Hashtag 類型」與「使用 hashtag」視為同一訊號，連結亦同，只取一次。
- 門檻：每組至少 `max(2, round(總篇數 × 10%))` 篇、差距至少 10%；不足 3 點時以 `category = "insufficient"` 的「資料不足以判斷」補齊，不硬湊結論。
- `rewrite`：取互動最低的貼文，依所有達門檻的觀察套用改寫規則——連結互動較低時把連結行換成「（連結放在第一則留言）」、提問互動較高且原文沒有提問或邀請互動時在 hashtag 行前加「你們怎麼看？」、hashtag 互動較高且原文沒有 hashtag 時補上同主題互動最高貼文的 hashtag；沒有適用規則時為 `null`。
- 總篇數 < 10 時 `notice` 提示僅供參考。使用全部貼文計算，屬相關性觀察，不代表因果。

清理規則：同一 `post_url` 只保留第一筆；計數欄位缺失補 `0`、`content` 缺失補空字串、`views_count` 保留 `null`；`published_at` 轉為 `+08:00`（無時區者視為台北時間，秒以下截斷）；`is_synthetic` 不為 `true`、必要欄位缺失或型別錯誤的紀錄一律剔除並計入 `invalid_removed`。

### 2.2 AI 策略建議端點（`POST /api/tasks/{id}/ai-strategy`，`api/threadsinsightapi/ai_strategy.py`）

- **對象**：已完成（`completed`）的分析任務；未完成回 `409`，不是本人的任務回 `404`。

- **模型**：`claude-haiku-5-5`，`effort: medium`，`max_tokens: 16000`（含思考），以結構化輸出（Pydantic）取得 3 點觀察與改寫範例；不使用 assistant prefill 與 temperature（Haiku 5.5 不支援）。
- **送出內容**：只有彙總數據、規則引擎發現與少數合成貼文內文（互動最高 3 篇與最低 1 篇），不含 `mock://` 網址；系統提示註明資料為合成，不得說成真實帳號的表現。
- **逾時與重試**：單次 30 秒逾時，SDK 自動重試 2 次（指數退避）。
- **降級**：逾時、API 錯誤、拒答（`stop_reason == "refusal"`）、截斷或輸出不合格（不是恰好 3 點、欄位過長或空白、含真實 Threads 網址、改寫含網址）時，回傳規則引擎結果（`source = "rule_engine"`），`notice` 說明原因，例如「AI 深度建議生成逾時，目前已顯示系統規則引擎產出之基礎策略觀察。」。
- **成功時**：`source = "llm"`、`model = "claude-haiku-5-5"`，`insights[].category = "ai"`、`lift = null`，`rewrite` 改寫互動最低的貼文。
- **金鑰來源**（優先順序由高到低）：
  1. 使用者在網頁「AI 建議設定」輸入的金鑰，以 `X-User-Anthropic-Key` 標頭送出（不放網址）；格式須為 `sk-ant-` 開頭加 20–200 個英數字、底線或連字號，不符回 `400`（不回顯金鑰）。後端每次請求以此金鑰建立新的 client，不記錄、不回傳。
  2. 伺服器環境變數 `ANTHROPIC_API_KEY`（或 `ANTHROPIC_AUTH_TOKEN`），可寫在專案根目錄的 `.env`（由 `.env.example` 複製），啟動時讀取，既有環境變數優先。
  3. 兩者皆無：回傳規則引擎結果，`notice` 提示可在網頁輸入金鑰。
- **開關**：`THREADSINSIGHT_AI=off` 一律停用（含網頁輸入的金鑰）；`on` 強制以伺服器憑證啟用；預設 `auto`。
- **金鑰錯誤**：401／403 時退回規則引擎，`notice` 說明「API 金鑰無效或沒有權限」。
- **回應標頭**：一律 `Cache-Control: no-store`。
- **保存與限流**：成功結果寫入該任務的 `analysis_summaries.strategy_insights`，之後開啟同一任務直接回傳、不再呼叫；帶 `?refresh=true`（例如換了金鑰）才重新產生。失敗結果不保存。實際呼叫每位登入使用者每分鐘最多 10 次，超過回 `429`。

### 2.3 登入驗證（`api/threadsinsightapi/auth.py`，PRD F1、AC-1）

- **適用範圍**：`/api/mock-posts` 與 `/api/ai-strategy` 都必須登入；請求帶 `Authorization: Bearer <Supabase access token>`。
- **驗證方式**：以 `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` 的公鑰驗證簽章（快取 5 分鐘），只接受 `ES256`／`RS256`；同時檢查 `iss = {SUPABASE_URL}/auth/v1`、`aud = authenticated`、`exp`（容許 10 秒時差）、`role = authenticated`，`sub` 必須是 UUID。anon key、service role key 與 HS256 token 一律拒絕。
- **未登入或憑證無效**：回 `401`，信封 `error` 固定為 `"Authentication required"`，附 `WWW-Authenticate: Bearer` 與 `Cache-Control: no-store`；登入檢查先於參數驗證，未登入者看不到參數錯誤。
- **驗證服務無法連線**（取不到 JWKS）：回 `503`，`error` 為 `"Authentication service unavailable"`。
- **隱私**：token 不寫入日誌、不出現在回應中；驗證後保留在請求內，供之後以使用者身分查詢資料庫（RLS）。

### 2.4 分析任務端點（`api/threadsinsightapi/tasks_api.py`，PRD F2）

所有任務端點都以「使用者自己的登入憑證」經 PostgREST 存取資料庫，RLS 決定可見範圍；別人的任務一律視同不存在（`404`）。回傳的任務欄位：`id`、`target_username`、`requested_count`、`status`、`data_source`、`post_count`、`error_message`、`created_at`、`started_at`、`completed_at`（不含 `user_id`）。

| 方法與路徑                   | 說明                                                                                                                                          | 成功回應 `data`                 |
| :--------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------ |
| `POST /api/tasks`            | 本文 `{username, count = 30, force = false}`。24 小時內同帳號、同篇數已有完成任務且未 `force` 時回 `200` 與快取；否則建立任務並執行，回 `201` | `{task, report, cached}`        |
| `GET /api/tasks`             | 本人任務，依建立時間新到舊，最多 100 筆                                                                                                       | `{tasks}`                       |
| `GET /api/tasks/{id}`        | 任務與報告（未完成時 `report = null`）                                                                                                        | `{task, report, cached: false}` |
| `POST /api/tasks/{id}/rerun` | 保留任務 ID 重新執行，舊貼文與彙總在同一交易內替換                                                                                            | `{task, report, cached: false}` |
| `DELETE /api/tasks/{id}`     | 刪除任務，貼文與彙總連帶刪除                                                                                                                  | `{id}`                          |

- **狀態流程**：`pending → generating → analyzing → completed`，每一步都寫回資料庫；管線例外時標為 `failed`（`error_message = "Pipeline failed"`），回 `500`、`error = "Analysis failed"`，`data.task` 為失敗的任務。
- **卡住的任務**（PRD 例外情境 8）：讀取列表或單一任務時，把停在 `pending`／`generating`／`analyzing` 超過 3 分鐘（依 `started_at`）的任務標為 `failed`（`error_message = "Timed out after 3 minutes"`）。重跑會更新 `started_at`。
- **報告一致性**：`report` 與 `GET /api/mock-posts` 同格式；從資料庫讀回的報告與當場分析完全相同（`published_at` 一律換回 `+08:00`）。
- **寫入方式**：結果由資料庫函式 `save_analysis_results`（`security invoker`）在單一交易內寫入 `posts`、`analysis_summaries` 並把任務標為 `completed`。
- **錯誤**：參數不合法 `400`（不建立任務）；資料庫無法連線 `503`、`error = "Database unavailable"`；建立與重跑每位使用者每分鐘最多 30 次，超過 `429`。

### 2.5 共用回應標頭與健康檢查

- **所有回應**：`X-Request-ID`（與後端日誌的 `request_id` 相同；請求帶合法的 `X-Request-ID` 時沿用）、`Cache-Control: no-store`、`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`。
- **`GET /api/health`**：不需登入、不連資料庫，回 `{"status": "ok"}`，供容器健康檢查使用，不寫入請求日誌。

---

## 3. 輔助中繼資料（Metadata）

為支援儀表板圖表視覺化、快取機制與合規揭露，`threadsinsightapi` 回傳的整批資料外層必須包含以下 Metadata：

- **資料來源**（`data_source`）：固定為 `"mock_dataset"`。
- **採用原因**（`source_note`）：固定記錄採用合成資料的技術說明（例如 `"Scraping blocked (HTTP 401 on graphql/query) & official API unavailable; using deterministic Mock Dataset"`）。
- **生成時間戳**（`generated_at`）：資料生成當下的 `UTC+8` 時間戳（用於 24 小時快取比對）。
- **媒體類型標記**（`media_type`）：每篇貼文標註為 `"text_only"`（純文字）或 `"image"`（包含圖片媒體），對應儀表板的「媒體類型分布」圖表。

---

## 4. Mock Dataset 規則（唯一資料來源規範）

由於線上爬蟲遭驗證牆阻擋且官方 API 申請受限，本專案**一律使用 Mock Dataset 規則**。Mock Dataset 為**合成擬真資料**，並非任何帳號的真實貼文，生成時必須嚴格遵守以下 8 項規則：

1. **整批標示**：API 回傳與資料庫任務表皆標記 `data_source = "mock_dataset"`，並於 `source_note` 清楚記錄原因。
2. **逐筆標示**：每篇貼文皆帶有 `is_synthetic: true` 欄位，匯出 CSV / JSON 時亦須保留此欄位。
3. **不偽造真實網址**：貼文 URL 一律使用 `mock://threads/@{username}/post/{n}` 這類無法點擊、不指向 `threads.com` 的格式，避免報告裡出現看似真實的貼文連結。
4. **不冒用帳號內容**：文字內容採用預先設計的通用範例主題庫，不模仿目標帳號本人的語氣，也不聲稱該內容為目標帳號所發布。
5. **可重現性（Deterministic Seed）**：以正規化後的 `username` 作為亂數種子（Seed），確保同一帳號每次生成的貼文列表、發文時間與互動數據完全相同，方便測試與 24 小時快取比對。
6. **互動分布真實性**：生成的 `likes_count` 與 `replies_count` 必須呈現**高、中、低**三個明顯層級，以確保後續三群組 NLP 內容歸因引擎能有效區分高互動與低互動特徵。生成器每 10 篇固定配置 3 篇高、4 篇中、3 篇低互動，三層級的按讚數範圍互不重疊；因此篇數 $\ge 10$ 時保證三層級各至少 3 篇，篇數 $< 10$ 時不保證涵蓋全部三層級（分析端的小樣本處理見 PRD F4）。
7. **報告畫面強制揭露**：報告開頭顯示「示範資料（Mock Dataset），非 @{username} 的真實貼文」橫幅，且**不可被使用者關閉**。橫幅位於報告最上方、不隨捲動黏著，以免遮擋閱讀內容。
8. **嚴格隔離不混用**：所有分析任務一律使用合成資料，絕不與任何外部抓取資料混用。

---

## 5. 技術決策依據：已驗證的外部取得限制（2026-11-19）

本專案決定全面採用 Mock Dataset 的實測依據如下（將同步記錄於 `README.md` 與 `AI_LOG.md`）：

| 測試方式                                                             | 實測結果                                                 | 結論                                               |
| :------------------------------------------------------------------- | :------------------------------------------------------- | :------------------------------------------------- |
| 直接讀取個人頁 HTML（未登入）                                        | 回傳 HTTP 200，但頁面內嵌貼文為 0 篇                     | 無法透過靜態 HTML 解析取得貼文                     |
| GraphQL `BarcelonaProfileThreadsTabRefetchableDirectQuery`（未登入） | 第一頁請求即遭擋並回傳 HTTP 401                          | 未登入狀態無法存取公開貼文 API                     |
| 瀏覽器自動化擷取工具（Playwright / api-anything）                    | 觸發登入驗證牆，無法擷取載入貼文的請求                   | 強行使用帳號 Session 爬取有違反平台 ToS 與封號風險 |
| Meta / Threads 官方 Graph API                                        | 申請流程受限，且 API 規範僅允許讀取 Token 擁有者自身帳號 | 無法用於分析任意輸入之公開 Threads 帳號            |
