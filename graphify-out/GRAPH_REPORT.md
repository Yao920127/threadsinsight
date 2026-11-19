# Graph Report - threadsinsight  (2026-11-20)

## Corpus Check
- 152 files · ~149,007 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 22 file(s) not represented in the graph (top: .css 9, .Dockerfile 4, (none) 2)

## Summary
- 1788 nodes · 4465 edges · 90 communities (78 shown, 12 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 258 edges (avg confidence: 0.9)
- Token cost: 233,785 input · 0 output

## Community Hubs (Navigation)
- AI 策略建議與 Claude 用戶端
- 清除建置快取腳本
- E2E 測試與登入夾具
- 策略規則引擎與測試
- 前端頁面錯誤處理
- 資料清洗測試
- 分析管線與合成資料
- 前端互動指標
- NLP 歸因測試
- API 信封與錯誤型別
- 合成貼文產生器
- 資料庫列轉 JSON
- 登入錯誤訊息
- 註冊登入規則與端點
- 假資料庫連線
- 任務服務與任務 API
- 歸因區塊與 HTML 輸出
- 多帳號比較指標
- 統計計算測試
- 假任務儲存庫
- 任務 API 前端驗證
- 密碼雜湊與假帳號
- PostgreSQL 存取層
- 文字特徵擷取
- API 應用與錯誤處理
- 任務列表介面
- 任務 API 快取測試
- 登入端點測試
- 比較頁進入點
- 帳號儲存測試
- 互動分群
- API 輸入驗證測試
- 前端型別與列舉
- 日誌事件測試
- 長條圖與報告
- 策略建議區塊
- 假帳號儲存
- 關鍵字統計
- 內容庫載入測試
- 使用者金鑰管理
- TypeScript 設定
- AI 建議端點測試
- 請求追蹤與日誌
- 資料庫與部署決策（ADR-001）
- CSV 匯出
- 產生器測試
- 帳號正規化
- 日誌格式測試
- Railway 部署與系統元件
- 統計區塊與熱點時段
- AI 協作與開發紀錄
- 測試共用設定
- 多帳號比較頁
- 容器強化設定
- 任務端點整合測試
- 登入錯誤型別
- 視覺設計規範
- 互動分數與三層分群
- web 服務設定
- migrate 服務設定
- 架構決策與安全標頭
- 測試用登入身分
- ADR-002 PostgreSQL 與 RLS
- 決策紀錄與 NLP 取樣
- 從 Supabase 遷移
- TF-IDF 特有詞
- 請求次數限制
- 健康檢查與模擬端點
- 分析任務流程說明
- 專案指南與測試替身
- Postgres 容器設定
- 部署除錯紀錄
- 雙語產生器一致性
- 雙協定啟動點
- 登入頁與入口
- 快取與容錯降級
- scripts TS 設定
- e2e TS 設定
- compose 頂層設定
- 映像建置設定
- 健康檢查設定
- API 環境變數
- Vite+ 工具鏈指南
- 網站圖示
- Vite 環境型別
- 資料庫遷移腳本
- jieba 繁體詞典
- 受保護頁面
- Python 套件設定

## God Nodes (most connected - your core abstractions)
1. `CleanPost` - 44 edges
2. `escapeHtml()` - 42 edges
3. `generate_mock_dataset()` - 34 edges
4. `Store` - 32 edges
5. `envelope()` - 30 edges
6. `generateMockDataset()` - 28 edges
7. `clean_post()` - 26 edges
8. `vite-plus` - 26 edges
9. `FakePool` - 23 edges
10. `log_event()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `RLS 權限控管（只放行本人資料）` --semantically_similar_to--> `RLS 是最後一道防線`  [INFERRED] [semantically similar]
  threadsinsight_prd-1.md → docs/architecture.md
- `分析任務` --implements--> `分析任務端點 /api/tasks`  [INFERRED]
  docs/floorplan/index.html → threadsinsightapi.md
- `產生示範貼文` --implements--> `Mock Dataset 8 項規則`  [INFERRED]
  docs/floorplan/index.html → threadsinsightapi.md
- `分析貼文` --implements--> `NLP 內容歸因 rule_based_v1（text_features.py、attribution.py）`  [INFERRED]
  docs/floorplan/index.html → threadsinsightapi.md
- `AI 策略建議` --implements--> `AI 策略建議端點 POST /api/tasks/{id}/ai-strategy`  [INFERRED]
  docs/floorplan/index.html → threadsinsightapi.md

## Import Cycles
- 1-file cycle: `src/compare.ts -> src/compare.ts`

## Hyperedges (group relationships)
- **RLS-based per-user data isolation** — claude_user_transaction, claude_owner_transaction, claude_save_analysis_results, readme_row_level_security, claude_test_doubles [EXTRACTED 0.95]
- **Strategy generation: AI with rule-engine fallback** — claude_ai_strategy, readme_claude_haiku_strategy, readme_rule_engine, readme_key_handling, ai_log_ai_source_badge [INFERRED 0.85]
- **Why synthetic data: feasibility tests to Mock Dataset rules** — readme_data_access_feasibility_tests, ai_log_three_tier_fallback, readme_mock_dataset, readme_synthetic_data_rules, claude_cross_language_generator [INFERRED 0.85]
- **分析管線：生成→清理→分群→NLP→策略** — threadsinsightapi_cleaning_pipeline, threadsinsightapi_grouping, threadsinsightapi_stats, threadsinsightapi_nlp_rule_based_v1, threadsinsightapi_strategy_rule_engine [EXTRACTED 1.00]
- **以 RLS 達成使用者資料隔離** — docs_architecture_rls_last_line_of_defense, docs_architecture_set_local_role_rls, threadsinsight_prd_1_rls_policy, docs_floorplan_index_db_schema_rls [INFERRED 0.85]
- **AI 策略建議與規則引擎降級** — threadsinsightapi_ai_strategy_endpoint, threadsinsightapi_strategy_rule_engine, threadsinsight_prd_1_rule_engine_fallback, docs_floorplan_index_claude_ai [INFERRED 0.85]

## Communities (90 total, 12 thin omitted)

### Community 0 - "AI 策略建議與 Claude 用戶端"
Cohesion: 0.06
Nodes (39): analysis(), FakeClient, FakeMessages, _output(), _response(), _run(), test_ai_enabled(), test_client_uses_prd_timeout_and_retries() (+31 more)

### Community 1 - "清除建置快取腳本"
Cohesion: 0.05
Nodes (47): args, dryRun, KNOWN_FLAGS, { removed, failed }, root, unknown, CACHE_PATHS, cleanCache() (+39 more)

### Community 2 - "E2E 測試與登入夾具"
Cohesion: 0.05
Nodes (50): ACCOUNTS, authPost(), createTaskViaApi(), deleteAccount(), E2E_EMAIL_DOMAIN, E2E_EMAIL_PREFIX, expectNoHorizontalScroll(), loginViaUi() (+42 more)

### Community 3 - "策略規則引擎與測試"
Cohesion: 0.08
Nodes (31): _post(), test_every_category_has_readable_wording(), test_link_post_type_counts_as_the_link_signal(), test_min_segment_posts_scales_with_total(), test_question_goes_above_existing_hashtag_lines(), test_spaced_inserts_spaces_between_cjk_and_latin(), TestBuildStrategy, TestInsights (+23 more)

### Community 4 - "前端頁面錯誤處理"
Cohesion: 0.08
Nodes (45): isUnauthorized(), handleUnauthorized(), handleError(), account, accountEmail, aiKeyClear, aiKeyForm, aiKeyInput (+37 more)

### Community 5 - "資料清洗測試"
Cohesion: 0.10
Nodes (18): _record(), TestCleanPost, TestCleanPosts, TestExtractFeatures, TestToTaipei, clean_post(), clean_posts(), CleanResult (+10 more)

### Community 6 - "分析管線與合成資料"
Cohesion: 0.09
Nodes (20): CleaningReport, MockDataset, seed_for(), Analysis, analyze(), analyze_dataset(), from_storage(), _number() (+12 more)

### Community 7 - "前端互動指標"
Cohesion: 0.10
Nodes (38): vite-plus, average(), buildHourSlots(), buildTopPosts(), buildWeekdays(), countBy(), GroupedPost, hourOf() (+30 more)

### Community 8 - "NLP 歸因測試"
Cohesion: 0.12
Nodes (24): _generated(), _grouped(), _post(), test_run_nlp_adds_text_features_and_topic_stats(), TestAttribute, TestObservations, TestSampling, _pipeline() (+16 more)

### Community 9 - "API 信封與錯誤型別"
Cohesion: 0.11
Nodes (27): ApiError, ApiErrorKind, buildHeaders(), EnvelopeRequest, isAbortOrTimeout(), requestEnvelope(), RequestOptions, fetchMockPosts() (+19 more)

### Community 10 - "合成貼文產生器"
Cohesion: 0.11
Nodes (14): compose_content(), _build_post(), _build_timestamps(), _build_unique_contents(), generate_mock_dataset(), _js_round(), MockPost, to_taipei_iso() (+6 more)

### Community 11 - "資料庫列轉 JSON"
Cohesion: 0.10
Nodes (6): jsonable(), _plain(), get_task_repository(), _one(), PostgresTaskRepository, TaskRepository

### Community 12 - "登入錯誤訊息"
Cohesion: 0.09
Nodes (27): authErrorMessage(), EMAIL_TAKEN, INVALID_CREDENTIALS, loginReasonMessage(), SESSION_EXPIRED, HOME_PATH, LOGIN_PATH, LOGIN_REASONS (+19 more)

### Community 13 - "註冊登入規則與端點"
Cohesion: 0.12
Nodes (14): TestRules, _clear_session(), _client_ip(), Credentials, delete_me(), login(), logout(), me() (+6 more)

### Community 14 - "假資料庫連線"
Cohesion: 0.12
Nodes (6): FakeConnection, FakeCursor, FakePool, repo(), TestTaskRepository, TestTransactions

### Community 15 - "任務服務與任務 API"
Cohesion: 0.10
Nodes (12): TaskFailedError, _choose_client(), CreateTaskBody, delete_task(), _failed(), get_task(), list_tasks(), post_ai_strategy() (+4 more)

### Community 16 - "歸因區塊與 HTML 輸出"
Cohesion: 0.15
Nodes (26): engagementOf(), GROUP_LABELS, renderOption(), formatRate(), renderAttributionSection(), renderGroupCard(), renderKeywords(), renderStructure() (+18 more)

### Community 17 - "多帳號比較指標"
Cohesion: 0.13
Nodes (23): AnalysisTask, SegmentStats, accountLabel(), AccountMetrics, compareFileName(), compareJson(), EXPORT_FIELDS, ExportValue (+15 more)

### Community 18 - "統計計算測試"
Cohesion: 0.14
Nodes (17): _post(), test_generated_dataset_produces_meaningful_terms(), test_keywords_exclude_mock_template_words(), test_post_types_cover_all_types_in_fixed_order(), test_top_hashtags_count_posts_case_insensitively(), test_weekday_hour_matrix_is_monday_first_in_taipei_time(), TestAverages, TestLengthBuckets (+9 more)

### Community 19 - "假任務儲存庫"
Cohesion: 0.15
Nodes (5): FakeTaskRepository, stored_task(), _utc(), ReportRows, TaskNotFoundError

### Community 20 - "任務 API 前端驗證"
Cohesion: 0.16
Nodes (22): isAnalysisTask(), isDeleted(), isNullableString(), isTaskId(), isTaskList(), isTaskWithReport(), TASK_STATUSES, TaskList (+14 more)

### Community 21 - "密碼雜湊與假帳號"
Cohesion: 0.16
Nodes (8): TestPasswords, new_session_token(), _b64(), burn_time(), _derive(), _dummy_hash(), hash_password(), verify_password()

### Community 22 - "PostgreSQL 存取層"
Cohesion: 0.14
Nodes (4): database_url(), RepositoryError, shared_pool(), get_account_store()

### Community 23 - "文字特徵擷取"
Cohesion: 0.16
Nodes (13): test_count_sentences(), test_has_cta(), test_question_is_detected_with_full_and_half_width_marks(), TestSentiment, TestTopic, strip_entities(), classify_topic(), count_sentences() (+5 more)

### Community 24 - "API 應用與錯誤處理"
Cohesion: 0.19
Nodes (12): is_cross_site(), _on_auth_error(), _on_email_taken(), _on_invalid_credentials(), _on_invalid_input(), _on_invalid_signup(), _on_repository_error(), _on_task_not_found() (+4 more)

### Community 25 - "任務列表介面"
Cohesion: 0.13
Nodes (18): isInProgress(), TaskStatus, cacheNoticeText(), dateTimeFormat, formatTaipeiDateTime(), parseTaskAction(), renderActions(), renderTask() (+10 more)

### Community 26 - "任務 API 快取測試"
Cohesion: 0.18
Nodes (4): Store, create(), TestCreate, TestRerunAndDelete

### Community 27 - "登入端點測試"
Cohesion: 0.14
Nodes (6): fresh_client(), signup(), TestEndpointsRequireLogin, TestLogin, TestSessionLifecycle, TestSignup

### Community 28 - "比較頁進入點"
Cohesion: 0.13
Nodes (20): accounts, bootstrap(), compare(), isValidSelection(), MIN_SELECTION, countText, form, loadTasks() (+12 more)

### Community 29 - "帳號儲存測試"
Cohesion: 0.17
Nodes (7): TestAccountStore, PostgresAccountStore, _user(), EmailTakenError, owner_transaction(), _transaction(), user_transaction()

### Community 30 - "互動分群"
Cohesion: 0.17
Nodes (16): _groups(), _post(), test_all_equal_scores_are_all_high(), test_edge_group_size_rounds_half_up(), test_matches_generator_tiers_for_whole_blocks(), test_preserves_input_order_and_other_fields(), test_result_does_not_depend_on_input_order(), test_splits_ten_posts_into_3_4_3_by_score() (+8 more)

### Community 32 - "前端型別與列舉"
Cohesion: 0.25
Nodes (21): CleaningReport, ENGAGEMENT_GROUPS, POST_TYPES, SENTIMENTS, TOPICS, isCleanDataset(), isCleaningReport(), isCleanPost() (+13 more)

### Community 33 - "日誌事件測試"
Cohesion: 0.15
Nodes (6): as_json(), events(), logs(), TestRequestId, TestTaskLogs, new_request_id()

### Community 34 - "長條圖與報告"
Cohesion: 0.28
Nodes (16): Bucket, PostStats, renderBarChart(), renderBanner(), renderKpi(), renderKpis(), renderReport(), renderTopPosts() (+8 more)

### Community 35 - "策略建議區塊"
Cohesion: 0.18
Nodes (18): StrategyInsight, StrategyRewrite, AI_ERROR_NOTICE, AI_STATUS_ID, AI_TIMEOUT_NOTICE, aiStatusText(), fallbackReason(), MODEL_LABELS (+10 more)

### Community 36 - "假帳號儲存"
Cohesion: 0.16
Nodes (4): FakeAccountStore, AccountStore, AuthUser, token_hash()

### Community 37 - "關鍵字統計"
Cohesion: 0.16
Nodes (8): test_template_words_come_from_the_content_library(), TestKeywords, _candidate_tokens(), segment(), template_words(), tokenize(), _tokenizer(), top_keywords()

### Community 38 - "內容庫載入測試"
Cohesion: 0.21
Nodes (9): test_loads_shared_library(), test_rejects_library_with_empty_topic(), test_rejects_library_with_missing_keys(), _golden_cases(), ContentLibrary, load_library(), template_phrases(), TierStyle (+1 more)

### Community 39 - "使用者金鑰管理"
Cohesion: 0.18
Nodes (9): clearUserKey(), getUserKey(), isValidKeyFormat(), maskKey(), saveUserKey(), storage(), STORAGE_KEY, MemoryStorage (+1 more)

### Community 40 - "TypeScript 設定"
Cohesion: 0.11
Nodes (17): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 42 - "請求追蹤與日誌"
Cohesion: 0.17
Nodes (5): _request_context(), _clean(), elapsed_ms(), log_event(), timed()

### Community 43 - "資料庫與部署決策（ADR-001）"
Cohesion: 0.15
Nodes (11): save_analysis_results 資料庫函式（security invoker）, Supabase（已棄用）, Delete Task Confirm Dialog, 驗收標準 AC-1～AC-5, 資料表設計（profiles／analysis_tasks／posts／analysis_summaries）, F2 分析任務管理（建立、查看、重跑、刪除）, F3 Mock Dataset 資料取得與清理, 產品需求規格書（PRD）：ThreadsInsight v1.3 (+3 more)

### Community 44 - "CSV 匯出"
Cohesion: 0.19
Nodes (14): compareCsv(), CSV_COLUMNS, CsvValue, exportContent(), exportFileName(), ExportFormat, MIME_TYPES, dataset (+6 more)

### Community 45 - "產生器測試"
Cohesion: 0.25
Nodes (10): generate(), test_accepts_small_counts_as_prefix(), test_batch_metadata(), test_dataset_is_immutable(), test_default_and_max_counts(), test_engagement_tiers_are_separated(), test_matches_typescript_golden_output(), test_posts_follow_mock_rules() (+2 more)

### Community 46 - "帳號正規化"
Cohesion: 0.23
Nodes (6): test_normalizes_supported_forms(), test_rejects_invalid_input(), _extract_from_url(), InvalidUsernameError, _looks_like_url(), normalize_username()

### Community 47 - "日誌格式測試"
Cohesion: 0.20
Nodes (4): TestFormatters, configure_logging(), JsonFormatter, TextFormatter

### Community 48 - "Railway 部署與系統元件"
Cohesion: 0.23
Nodes (14): migrate 服務（私有網路套用 db/migrations）, Railway 雲端部署（web／api／migrate／floorplan／Postgres）, 自建 Email＋密碼登入（scrypt）, AI 策略建議, 分析貼文, 會員與登入, Claude AI（Claude Haiku 5.5）, 開發工具腳本 (+6 more)

### Community 49 - "統計區塊與熱點時段"
Cohesion: 0.26
Nodes (11): TermCount, findPeakSlot(), heatLevel(), PeakSlot, renderAverages(), renderHeatmap(), renderStatsSection(), renderTermList() (+3 more)

### Community 50 - "AI 協作與開發紀錄"
Cohesion: 0.17
Nodes (9): AI collaboration development log, Unfinished items (cross-browser, email features, HSTS), ui/html.ts escapeHtml for all dynamic text, observability.log_event (field redaction), CSV / JSON export, Known limitations (no email verification, no HSTS, Chromium only), In-process rate limiting, Structured JSON logging with request_id (+1 more)

### Community 51 - "測試共用設定"
Cohesion: 0.17
Nodes (3): accounts(), store(), fake_repository()

### Community 52 - "多帳號比較頁"
Cohesion: 0.15
Nodes (12): Compare Task Picker (2–4 tasks), 多帳號比較頁 /compare（無新增後端）, 跟主伺服器溝通（API 用戶端與驗證）, 多帳號比較, 分析儀表板, 登入, 報告畫面, 對外的請求入口 (+4 more)

### Community 53 - "容器強化設定"
Cohesion: 0.15
Nodes (13): cap_drop, depends_on, env_file, expose, read_only, restart, security_opt, tmpfs (+5 more)

### Community 55 - "登入錯誤型別"
Cohesion: 0.18
Nodes (3): AuthError, InvalidCredentialsError, require_user()

### Community 56 - "視覺設計規範"
Cohesion: 0.27
Nodes (11): compare.html Multi-account Compare Page, Atmospheric Pastel Gradient Orbs, badge-pill Component, Color Tokens (canvas #f5f5f5, warm ink), Waldenburg Light 300 + Inter Type Pairing, ElevenLabs-inspired Editorial Design System, Ink Pill Primary / Outline Secondary CTA, top-nav Component (+3 more)

### Community 57 - "互動分數與三層分群"
Cohesion: 0.22
Nodes (8): F4 互動分群與 NLP 深度分析引擎, 互動分群（grouping.py）, 輔助中繼資料（data_source、source_note、generated_at、media_type）, GET /api/mock-posts 端點, NLP 內容歸因 rule_based_v1（text_features.py、attribution.py）, 貼文核心欄位（post_url、is_synthetic、views_count…）, threadsinsightapi 合成資料（Mock Dataset）規格書, 基礎統計（stats.py、keywords.py）

### Community 58 - "web 服務設定"
Cohesion: 0.20
Nodes (10): condition, api, web, cap_drop, depends_on, ports, read_only, restart (+2 more)

### Community 59 - "migrate 服務設定"
Cohesion: 0.20
Nodes (10): condition, db, PGDATABASE, PGHOST, PGPASSWORD, PGUSER, depends_on, environment (+2 more)

### Community 60 - "架構決策與安全標頭"
Cohesion: 0.20
Nodes (9): 架構決策紀錄（ADR-001／ADR-002）, 本機 docker compose 部署與容器加固, Playwright E2E（對線上版、自建測試帳號）, nginx 安全標頭與嚴格 CSP, 結構化 JSON 日誌與 request_id, 瀏覽器實際操作測試, 伺服器測試, 自動化測試 (+1 more)

### Community 62 - "ADR-002 PostgreSQL 與 RLS"
Cohesion: 0.28
Nodes (4): 資料表與權限規則, F1 使用者註冊、登入與權限控管, RLS 權限控管（只放行本人資料）, 會員與登入端點 /api/auth/*

### Community 63 - "決策紀錄與 NLP 取樣"
Cohesion: 0.25
Nodes (3): Decision log (2026-11-19 to 2026-11-20), jieba traditional dictionary dict.txt.big, NLP attribution sampling (3-5 posts per group, correlational)

### Community 64 - "從 Supabase 遷移"
Cohesion: 0.29
Nodes (5): db.owner_transaction (users, sessions), require_user dependency (ti_session cookie), save_analysis_results DB function (security invoker), db.user_transaction (SET LOCAL ROLE + app.user_id), Self-built Email + password auth (scrypt, HttpOnly cookie)

### Community 65 - "TF-IDF 特有詞"
Cohesion: 0.32
Nodes (3): TestTfidf, tfidf_by_group(), WeightedTerm

### Community 66 - "請求次數限制"
Cohesion: 0.32
Nodes (3): Clock, test_rate_limiter_allows_up_to_the_limit_per_window(), RateLimiter

### Community 68 - "分析任務流程說明"
Cohesion: 0.36
Nodes (7): ai_strategy.generate_ai_strategy (never raises, falls back), pipeline.py: generate_mock_dataset -> analyze_dataset, task_service.py task state flow, 24-hour task cache, Analysis task pipeline (generate, clean, segment, NLP, stats, strategy), Claude Haiku 5.5 content strategy suggestions, Rule engine strategy fallback

### Community 69 - "專案指南與測試替身"
Cohesion: 0.25
Nodes (8): CLAUDE.md project guidance, Test doubles (FakeAccountStore, FakeTaskRepository, fake Anthropic client), Vite+ vp CLI toolchain, docs/architecture.md (ADR-001, ADR-002), Playwright E2E against live site, Floorplan architecture diagram site, threadsinsight_prd-1.md (PRD), Railway deployment (nginx + FastAPI + Postgres, GitHub sync)

### Community 70 - "Postgres 容器設定"
Cohesion: 0.25
Nodes (8): environment, image, restart, volumes, POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, db

### Community 71 - "部署除錯紀錄"
Cohesion: 0.29
Nodes (5): AI-produced errors and fixes, AI vs rule-engine source badge and cache keyed by key source, Dual-stack socket in api/serve.py for Railway health check, Railway migrate service on private network, nginx $http_host fix for Origin check

### Community 72 - "雙語產生器一致性"
Cohesion: 0.38
Nodes (4): shared/mock-content-library.json, threadsinsightapi.md (API and Mock Dataset spec), External data access feasibility tests (2026-11-19), Mock Dataset (deterministic synthetic data)

### Community 74 - "登入頁與入口"
Cohesion: 0.29
Nodes (7): Three Vite entries (index, login, compare), Account notes panel (hashed passwords, isolation, synthetic data), login.html login page, src/login.ts module entry, Mock Dataset badge and footer disclosure, password-form (sign-in / sign-up), Multi-account compare (/compare)

### Community 75 - "快取與容錯降級"
Cohesion: 0.29
Nodes (4): Analyze Form (username, count 1–50, force), 例外情境與容錯處理, AI 策略建議端點 POST /api/tasks/{id}/ai-strategy, 策略觀察規則引擎（strategy.py）

### Community 76 - "scripts TS 設定"
Cohesion: 0.29
Nodes (6): compilerOptions, resolveJsonModule, types, extends, include, ../tsconfig.json

### Community 77 - "e2e TS 設定"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../tsconfig.json

### Community 78 - "compose 頂層設定"
Cohesion: 0.40
Nodes (4): name, services, volumes, threadsinsight_db

### Community 79 - "映像建置設定"
Cohesion: 0.60
Nodes (5): build, context, dockerfile, build, build

### Community 80 - "健康檢查設定"
Cohesion: 0.40
Nodes (5): healthcheck, interval, retries, test, timeout

### Community 82 - "API 環境變數"
Cohesion: 0.50
Nodes (4): environment, COOKIE_SECURE, DATABASE_URL, THREADSINSIGHT_AI

### Community 83 - "Vite+ 工具鏈指南"
Cohesion: 0.67
Nodes (3): Vite+ Review Checklist, Vite+ Unified Toolchain (vp), vpx TS Script Runner

### Community 84 - "網站圖示"
Cohesion: 0.67
Nodes (3): ThreadsInsight Favicon (TI orb logo), Orb Radial Gradient (mint-lavender-peach), TI Monogram (Georgia serif)

## Ambiguous Edges - Review These
- `Strict CSP and security headers` → `login.html login page`  [AMBIGUOUS]
  login.html · relation: conceptually_related_to

## Knowledge Gaps
- **37 isolated node(s):** `../tsconfig.json`, `threadsinsightapi`, `../tsconfig.json`, `RFC-4180`, `RFC-4180` (+32 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 507 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Analyze Form (username, count 1–50, force)` connect `快取與容錯降級` to `視覺設計規範`, `分析管線與合成資料`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Are the 33 inferred relationships involving `CleanPost` (e.g. with `_generated()` and `_grouped()`) actually correct?**
  _`CleanPost` has 33 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../tsconfig.json`, `threadsinsightapi`, `../tsconfig.json` to the rest of the system?**
  _37 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AI 策略建議與 Claude 用戶端` be split into smaller, more focused modules?**
  _Cohesion score 0.056179775280898875 - nodes in this community are weakly interconnected._
- **Why does `例外情境與容錯處理` connect `快取與容錯降級` to `資料庫與部署決策（ADR-001）`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `Store` (e.g. with `_insert_in_progress()` and `TestAiStrategy`) actually correct?**
  _`Store` has 5 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Strict CSP and security headers` and `login.html login page`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._