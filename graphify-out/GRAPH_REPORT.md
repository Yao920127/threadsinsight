# Graph Report - threadsinsight  (2026-11-20)

## Corpus Check
- 148 files · ~54,434 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 20 file(s) not represented in the graph (top: .css 9, (none) 2, .lock 2)

## Summary
- 1586 nodes · 4042 edges · 69 communities (64 shown, 5 thin omitted)
- Extraction: 94% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 222 edges (avg confidence: 0.91)
- Token cost: 225,749 input · 0 output

## Community Hubs (Navigation)
- 統計與文字特徵
- 資料清理與分群
- 登入憑證驗證
- TS 合成資料產生器
- 報告圖表元件
- 儀表板主程式
- NLP 三群組歸因
- 前端指標計算
- AI client 與任務端點
- 報告存取與任務流程
- 結構化日誌
- Python 合成資料產生器
- docker compose 設定
- 規則引擎策略
- API 入口與錯誤處理
- AI 策略測試替身
- Repository 請求測試
- AI 開關與金鑰設定
- 任務 API 前端客戶端
- 登入頁與導向
- 策略規則測試
- 任務列表 UI
- 比較頁主程式
- 任務建立測試
- PostgREST Repository
- 假資料庫與測試夾具
- Mock 端點測試
- 清除快取腳本
- 回應驗證器
- Haiku 策略生成
- 前端套件相依
- 內容庫與 ASGI 入口
- 登入端點測試
- 策略區塊 UI
- AI 端點測試
- 限流與任務 API 測試
- 使用者金鑰儲存
- CSV／JSON 匯出
- TypeScript 設定
- 日誌測試
- Session 與受保護頁
- 比較表呈現
- 工具鏈與專案限制
- E2E 本機 Supabase
- 產生器測試
- 帳號正規化
- E2E 夾具與情境
- 登入與 RLS 架構決策
- 設計系統與比較頁 UI
- 統計區塊 UI
- 比較匯出
- Mock Dataset 規則
- 分析管線型別
- API 信封錯誤處理
- 分析方法決策
- 任務管理與報告規格
- npm 指令
- 任務列表測試
- 登入錯誤訊息
- 安全與快取決策
- AI 協作紀錄
- Publishable key 設定
- scripts tsconfig
- e2e tsconfig
- 表單驗證
- 套件管理設定
- 網站圖示
- Vite 環境型別
- Python 專案設定

## God Nodes (most connected - your core abstractions)
1. `CleanPost` - 44 edges
2. `escapeHtml()` - 42 edges
3. `generate_mock_dataset()` - 34 edges
4. `Store` - 32 edges
5. `generateMockDataset()` - 28 edges
6. `clean_post()` - 26 edges
7. `vite-plus` - 25 edges
8. `compute_stats()` - 23 edges
9. `post_ai_strategy()` - 23 edges
10. `clean_posts()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `save_analysis_results Transactional Function` --shares_data_with--> `Tasks API Endpoints`  [EXTRACTED]
  docs/architecture.md → threadsinsightapi.md
- `Compare Metrics Computed Client-side` --rationale_for--> `compare.html Multi-account Compare Page`  [EXTRACTED]
  docs/architecture.md → compare.html
- `cases` --calls--> `generateMockDataset()`  [EXTRACTED]
  scripts/generate-mock-golden.ts → src/mock/generateMockDataset.ts
- `Cache Not Keyed by Key Source Bug` --conceptually_related_to--> `24h DB-backed Cache (completed_at)`  [INFERRED]
  AI_LOG.md → docs/architecture.md
- `Structured JSON Logging with Field Whitelist` --conceptually_related_to--> `ADR-001: Database, Auth & Deployment`  [EXTRACTED]
  CLAUDE.md → docs/architecture.md

## Import Cycles
- 1-file cycle: `src/compare.ts -> src/compare.ts`

## Hyperedges (group relationships)
- **Mock Analysis Pipeline Flow** — claude_analysis_pipeline, threadsinsightapi_deterministic_seed, threadsinsightapi_cleaning_rules, threadsinsight_prd_1_three_tier_clustering, threadsinsightapi_nlp_attribution_rule_based_v1, threadsinsightapi_rule_engine_strategy, threadsinsightapi_ai_strategy_endpoint [EXTRACTED 1.00]
- **Synthetic Data Disclosure Enforcement Layers** — threadsinsightapi_mock_dataset_rules, docs_architecture_mock_rules_db_constraints, threadsinsightapi_mock_url_scheme, threadsinsight_prd_1_mock_disclosure_banner, readme_csv_export, ai_log_no_real_accounts_constraint [INFERRED 0.85]
- **Auth & RLS Data Isolation Flow** — docs_architecture_pkce_magic_link_login, threadsinsightapi_jwks_auth, claude_user_token_postgrest_access, docs_architecture_rls_last_line_of_defense, threadsinsight_prd_1_rls_policy [EXTRACTED 1.00]

## Communities (69 total, 5 thin omitted)

### Community 0 - "統計與文字特徵"
Cohesion: 0.06
Nodes (38): _post(), test_keywords_exclude_mock_template_words(), test_post_types_cover_all_types_in_fixed_order(), test_template_words_come_from_the_content_library(), test_top_hashtags_count_posts_case_insensitively(), test_weekday_hour_matrix_is_monday_first_in_taipei_time(), TestAverages, TestKeywords (+30 more)

### Community 1 - "資料清理與分群"
Cohesion: 0.06
Nodes (35): _record(), TestCleanPost, TestCleanPosts, TestExtractFeatures, TestToTaipei, _groups(), _post(), test_all_equal_scores_are_all_high() (+27 more)

### Community 2 - "登入憑證驗證"
Cohesion: 0.07
Nodes (18): StaticResolver, test_issuer_can_be_overridden_for_containers(), test_issuer_follows_supabase_url(), TestParseBearer, AuthError, AuthUnavailableError, AuthUser, default_key_resolver() (+10 more)

### Community 3 - "TS 合成資料產生器"
Cohesion: 0.08
Nodes (36): vite-plus, cases, outPath, dataset, composeContent(), TierStyle, Topic, ANCHOR_MS (+28 more)

### Community 4 - "報告圖表元件"
Cohesion: 0.12
Nodes (43): Bucket, engagementOf(), GROUP_LABELS, NlpAnalysis, PostStats, renderOption(), formatRate(), renderAttributionSection() (+35 more)

### Community 5 - "儀表板主程式"
Cohesion: 0.08
Nodes (43): isUnauthorized(), account, accountEmail, aiKeyClear, aiKeyForm, aiKeyInput, aiKeyStatus, announcer (+35 more)

### Community 6 - "NLP 三群組歸因"
Cohesion: 0.10
Nodes (24): _generated(), _grouped(), _post(), test_run_nlp_adds_text_features_and_topic_stats(), TestAttribute, TestObservations, TestSampling, TestTfidf (+16 more)

### Community 7 - "前端指標計算"
Cohesion: 0.09
Nodes (40): average(), buildHourSlots(), buildTopPosts(), buildWeekdays(), countBy(), GroupedPost, hourOf(), RankedPost (+32 more)

### Community 8 - "AI client 與任務端點"
Cohesion: 0.10
Nodes (18): MessagesClient, _default_client(), get_ai_client(), get_client_factory(), fail_stale_tasks(), TaskFailedError, TaskResult, _choose_client() (+10 more)

### Community 9 - "報告存取與任務流程"
Cohesion: 0.09
Nodes (14): seed_for(), from_storage(), _number(), _post_number(), report_data(), _row_to_post(), _taipei_iso(), to_storage() (+6 more)

### Community 10 - "結構化日誌"
Cohesion: 0.08
Nodes (11): logs(), TestFormatters, _request_context(), _clean(), configure_logging(), elapsed_ms(), JsonFormatter, log_event() (+3 more)

### Community 11 - "Python 合成資料產生器"
Cohesion: 0.12
Nodes (14): compose_content(), _build_post(), _build_timestamps(), _build_unique_contents(), generate_mock_dataset(), _js_round(), MockPost, to_taipei_iso() (+6 more)

### Community 12 - "docker compose 設定"
Cohesion: 0.06
Nodes (37): build, cap_drop, condition, env_file, environment, expose, extra_hosts, read_only (+29 more)

### Community 13 - "規則引擎策略"
Cohesion: 0.14
Nodes (22): test_every_category_has_readable_wording(), test_link_post_type_counts_as_the_link_signal(), test_min_segment_posts_scales_with_total(), test_question_goes_above_existing_hashtag_lines(), test_spaced_inserts_spaces_between_cjk_and_latin(), CleanPost, find_hashtags(), engagement_of() (+14 more)

### Community 14 - "API 入口與錯誤處理"
Cohesion: 0.14
Nodes (11): get_mock_posts(), health(), _on_auth_error(), _on_auth_unavailable(), _on_invalid_input(), _on_repository_error(), _on_task_not_found(), _on_task_not_ready() (+3 more)

### Community 15 - "AI 策略測試替身"
Cohesion: 0.18
Nodes (9): analysis(), FakeClient, FakeMessages, _output(), _response(), _run(), TestFallback, TestLlmCallLog (+1 more)

### Community 16 - "Repository 請求測試"
Cohesion: 0.16
Nodes (20): _golden_cases(), make_repo(), ok(), test_create_posts_and_returns_representation(), test_delete_of_invisible_task_is_not_found(), test_delete_returns_when_row_removed(), test_fail_stale_patches_in_progress_tasks(), test_find_cached_filters_by_username_count_and_time() (+12 more)

### Community 17 - "AI 開關與金鑰設定"
Cohesion: 0.12
Nodes (14): test_ai_enabled(), test_client_uses_prd_timeout_and_retries(), test_create_client_accepts_a_user_key(), test_get_ai_client_follows_the_switch(), test_is_valid_user_key(), test_lowest_post_of_nothing_is_none(), test_prompt_contains_only_aggregates_and_synthetic_text(), _Messages (+6 more)

### Community 18 - "任務 API 前端客戶端"
Cohesion: 0.16
Nodes (23): requestEnvelope(), isAnalysisTask(), isDeleted(), isNullableString(), isTaskId(), isTaskList(), isTaskWithReport(), TASK_STATUSES (+15 more)

### Community 19 - "登入頁與導向"
Cohesion: 0.11
Nodes (21): HOME_PATH, LOGIN_PATH, LOGIN_REASONS, LoginReason, parseLoginReason(), safeNextPath(), announcer, cleanAuthParams() (+13 more)

### Community 20 - "策略規則測試"
Cohesion: 0.13
Nodes (11): _pipeline(), _post(), TestBuildStrategy, TestInsights, TestRewrite, build_rewrite(), build_strategy(), _filler() (+3 more)

### Community 21 - "任務列表 UI"
Cohesion: 0.14
Nodes (18): AnalysisTask, isInProgress(), cacheNoticeText(), dateTimeFormat, formatTaipeiDateTime(), parseTaskAction(), renderActions(), renderTask() (+10 more)

### Community 22 - "比較頁主程式"
Cohesion: 0.14
Nodes (21): accounts, authOptions(), bootstrap(), compare(), isValidSelection(), parseSelection(), countText, form (+13 more)

### Community 23 - "任務建立測試"
Cohesion: 0.18
Nodes (5): Store, stored_task(), create(), TestCreate, TestRerunAndDelete

### Community 24 - "PostgREST Repository"
Cohesion: 0.18
Nodes (3): _error_code(), _iso(), PostgrestTaskRepository

### Community 25 - "假資料庫與測試夾具"
Cohesion: 0.17
Nodes (5): store(), fake_repository(), FakeTaskRepository, _utc(), ReportRows

### Community 27 - "清除快取腳本"
Cohesion: 0.12
Nodes (13): args, dryRun, KNOWN_FLAGS, { removed, failed }, root, unknown, CACHE_PATHS, cleanCache() (+5 more)

### Community 28 - "回應驗證器"
Cohesion: 0.27
Nodes (20): fetchMockPosts(), FetchMockPostsOptions, CleanDataset, isCleanDataset(), isCleaningReport(), isCleanPost(), isCount(), isGroupingSummary() (+12 more)

### Community 29 - "Haiku 策略生成"
Cohesion: 0.18
Nodes (11): build_prompt(), _check_text(), fallback(), generate_ai_strategy(), InvalidAiOutputError, _log_call(), lowest_post(), to_strategy() (+3 more)

### Community 30 - "前端套件相依"
Cohesion: 0.12
Nodes (20): dependencies, @supabase/supabase-js@^2.119.2, devDependencies, @playwright/test@^1.65.1, @types/node@^26.6.6, typescript@~7.0.2, vite@npm:@voidzero-dev/vite-plus-core@8.3...., vite-plus@1.7.0 (+12 more)

### Community 31 - "內容庫與 ASGI 入口"
Cohesion: 0.16
Nodes (8): test_loads_shared_library(), test_rejects_library_with_empty_topic(), test_rejects_library_with_missing_keys(), ContentLibrary, load_library(), template_phrases(), TierStyle, Topic

### Community 32 - "登入端點測試"
Cohesion: 0.16
Nodes (4): make_token(), TestEndpointsRequireLogin, TestVerifyAccessToken, _verify()

### Community 33 - "策略區塊 UI"
Cohesion: 0.18
Nodes (18): StrategyInsight, StrategyRewrite, AI_ERROR_NOTICE, AI_STATUS_ID, AI_TIMEOUT_NOTICE, aiStatusText(), fallbackReason(), MODEL_LABELS (+10 more)

### Community 35 - "限流與任務 API 測試"
Cohesion: 0.14
Nodes (3): Clock, test_rate_limiter_allows_up_to_the_limit_per_window(), RateLimiter

### Community 36 - "使用者金鑰儲存"
Cohesion: 0.18
Nodes (9): clearUserKey(), getUserKey(), isValidKeyFormat(), maskKey(), saveUserKey(), storage(), STORAGE_KEY, MemoryStorage (+1 more)

### Community 37 - "CSV／JSON 匯出"
Cohesion: 0.18
Nodes (15): CleanPost, compareCsv(), CSV_COLUMNS, CsvValue, exportContent(), exportFileName(), ExportFormat, MIME_TYPES (+7 more)

### Community 38 - "TypeScript 設定"
Cohesion: 0.11
Nodes (17): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 39 - "日誌測試"
Cohesion: 0.18
Nodes (5): auth_headers(), as_json(), events(), TestRequestId, TestTaskLogs

### Community 40 - "Session 與受保護頁"
Cohesion: 0.26
Nodes (13): @supabase/supabase-js, AccountElements, AUTH_CONFIG_MESSAGE, initProtectedPage(), loginUrl(), currentPath(), getAccessToken(), handleUnauthorized() (+5 more)

### Community 41 - "比較表呈現"
Cohesion: 0.18
Nodes (11): accountLabel(), AccountMetrics, highestIndexes(), reportA, reportB, CompareRow, renderCell(), renderComparison() (+3 more)

### Community 42 - "工具鏈與專案限制"
Cohesion: 0.17
Nodes (13): Vite+ Review Checklist, Vite+ Unified Toolchain (vp), vpx TS Script Runner, External Data Feasibility Tests (2026-11-19), Jieba dict.txt.big (Traditional Dictionary), CLAUDE.md Project Guide, Structured JSON Logging with Field Whitelist, ADR-001: Database, Auth & Deployment (+5 more)

### Community 43 - "E2E 本機 Supabase"
Cohesion: 0.19
Nodes (12): latestMagicLink(), E2E_EMAIL_DOMAIN, E2E_EMAIL_PREFIX, AdminUser, globalTeardown(), serverEnv, supabase, isLocalUrl() (+4 more)

### Community 44 - "產生器測試"
Cohesion: 0.25
Nodes (10): generate(), test_accepts_small_counts_as_prefix(), test_batch_metadata(), test_dataset_is_immutable(), test_default_and_max_counts(), test_engagement_tiers_are_separated(), test_matches_typescript_golden_output(), test_posts_follow_mock_rules() (+2 more)

### Community 45 - "帳號正規化"
Cohesion: 0.23
Nodes (6): test_normalizes_supported_forms(), test_rejects_invalid_input(), _extract_from_url(), InvalidUsernameError, _looks_like_url(), normalize_username()

### Community 46 - "E2E 夾具與情境"
Cohesion: 0.30
Nodes (8): ACCOUNTS, createTaskViaApi(), expectNoHorizontalScroll(), loginViaUi(), signUpViaApi(), test, TestUser, uniqueEmail()

### Community 47 - "登入與 RLS 架構決策"
Cohesion: 0.19
Nodes (13): Verification Practice (tests, real env, browser), Test Doubles (FakeTaskRepository, fake Anthropic client), Backend DB Access via User Token + PostgREST, Supabase PKCE Login with Magic Link, save_analysis_results Transactional Function, login.html Login Page, Magic Link Form, Email & Password Form (+5 more)

### Community 48 - "設計系統與比較頁 UI"
Cohesion: 0.23
Nodes (13): protectedPage data-auth=pending Pattern, compare.html Multi-account Compare Page, Compare Task Picker (2–4 tasks), Atmospheric Pastel Gradient Orbs, badge-pill Component, Color Tokens (canvas #f5f5f5, warm ink), Waldenburg Light 300 + Inter Type Pairing, ElevenLabs-inspired Editorial Design System (+5 more)

### Community 49 - "統計區塊 UI"
Cohesion: 0.29
Nodes (10): findPeakSlot(), heatLevel(), PeakSlot, renderAverages(), renderHeatmap(), renderStatsSection(), renderTermList(), slotLabel() (+2 more)

### Community 50 - "比較匯出"
Cohesion: 0.23
Nodes (11): SegmentStats, compareFileName(), compareJson(), EXPORT_FIELDS, ExportValue, MAX_SELECTION, maxBy(), MIN_SELECTION (+3 more)

### Community 51 - "Mock Dataset 規則"
Cohesion: 0.25
Nodes (9): Dual Python/TS Mock Generator with Golden Fixture, F3 Mock Dataset Acquisition & Cleaning, Non-dismissible Mock Dataset Banner, Small Sample Rule (<10 posts), Cleaning Rules & Derived Fields, Deterministic Username Seed & Prefix Consistency, Mock Dataset 8 Rules, mock:// Pseudo-protocol Post URLs (+1 more)

### Community 52 - "分析管線型別"
Cohesion: 0.31
Nodes (6): NlpResult, CleaningReport, MockDataset, Analysis, analyze(), analyze_dataset()

### Community 53 - "API 信封錯誤處理"
Cohesion: 0.24
Nodes (7): ApiError, ApiErrorKind, buildHeaders(), EnvelopeRequest, isAbortOrTimeout(), RequestOptions, AiStrategyOptions

### Community 54 - "分析方法決策"
Cohesion: 0.27
Nodes (9): Analysis Pipeline (generate→clean→group→NLP→stats→strategy), Per-user Rate Limiting (30/min tasks, 10/min AI), F4 Engagement Clustering & NLP Engine, Three-tier Percentile Clustering (30/40/30), Weighted Engagement Score (likes + 2×replies), AI Strategy Endpoint (Claude Haiku 5.5), LLM Graceful Degradation to Rule Engine, NLP Attribution rule_based_v1 (TF-IDF, sentiment, CTA) (+1 more)

### Community 55 - "任務管理與報告規格"
Cohesion: 0.24
Nodes (8): Analyze Form (username, count 1–50, force), Delete Task Confirm Dialog, Edge Cases & Error Handling, F2 Analysis Task Management, {success, data, error} Response Envelope, Stuck Task 3-minute Timeout, Task Status Flow (pending→generating→analyzing→completed/failed), Tasks API Endpoints

### Community 56 - "npm 指令"
Cohesion: 0.20
Nodes (10): scripts, api:dev, api:test, build, clean, dev, e2e, e2e:docker (+2 more)

### Community 58 - "登入錯誤訊息"
Cohesion: 0.36
Nodes (7): AuthErrorLike, authErrorMessage(), INVALID_CREDENTIALS, isAuthErrorLike(), loginReasonMessage(), MESSAGES, SESSION_EXPIRED

### Community 59 - "安全與快取決策"
Cohesion: 0.25
Nodes (8): AI-produced Errors and Fixes, Cache Not Keyed by Key Source Bug, All Dynamic Text via escapeHtml, Strict CSP (no inline script/style/eval), Container Hardening (read-only FS, cap_drop ALL, non-root), 24h DB-backed Cache (completed_at), Local docker-compose Deployment (nginx + FastAPI), My Analysis Tasks List

### Community 60 - "AI 協作紀錄"
Cohesion: 0.29
Nodes (5): AI Collaboration Log, AI-Proposed / Developer-Decided Decision Record, AI Key Settings Form, Known Limitations (local deploy only, in-process rate limit, Chromium-only E2E), X-User-Anthropic-Key Bring-your-own Key

### Community 61 - "Publishable key 設定"
Cohesion: 0.33
Nodes (3): test_publishable_key_from_env(), publishable_key(), RepositoryError

### Community 62 - "scripts tsconfig"
Cohesion: 0.29
Nodes (6): compilerOptions, resolveJsonModule, types, extends, include, ../tsconfig.json

### Community 63 - "e2e tsconfig"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../tsconfig.json

### Community 64 - "表單驗證"
Cohesion: 0.53
Nodes (5): Field, initFormValidation(), isField(), linkError(), spokenText()

### Community 65 - "套件管理設定"
Cohesion: 0.40
Nodes (5): devEngines, packageManager, name, onFail, version

### Community 66 - "網站圖示"
Cohesion: 0.67
Nodes (3): ThreadsInsight Favicon (TI orb logo), Orb Radial Gradient (mint-lavender-peach), TI Monogram (Georgia serif)

## Ambiguous Edges - Review These
- `F4 Engagement Clustering & NLP Engine` → `AI Strategy Endpoint (Claude Haiku 5.5)`  [AMBIGUOUS]
  threadsinsightapi.md · relation: conceptually_related_to

## Knowledge Gaps
- **17 isolated node(s):** `../tsconfig.json`, `threadsinsightapi`, `../tsconfig.json`, `RFC-4180`, `RFC-4180` (+12 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 446 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vite-plus` connect `TS 合成資料產生器` to `策略區塊 UI`, `使用者金鑰儲存`, `CSV／JSON 匯出`, `報告圖表元件`, `前端指標計算`, `比較表呈現`, `統計區塊 UI`, `任務 API 前端客戶端`, `登入頁與導向`, `API 信封錯誤處理`, `任務列表 UI`, `登入錯誤訊息`, `清除快取腳本`, `前端套件相依`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Are the 33 inferred relationships involving `CleanPost` (e.g. with `_generated()` and `_grouped()`) actually correct?**
  _`CleanPost` has 33 INFERRED edges - model-reasoned connections that need verification._
- **What connects `../tsconfig.json`, `threadsinsightapi`, `../tsconfig.json` to the rest of the system?**
  _17 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `統計與文字特徵` be split into smaller, more focused modules?**
  _Cohesion score 0.05669710806697108 - nodes in this community are weakly interconnected._
- **Why does `generate_mock_dataset()` connect `Python 合成資料產生器` to `統計與文字特徵`, `資料清理與分群`, `NLP 三群組歸因`, `報告存取與任務流程`, `產生器測試`, `規則引擎策略`, `帳號正規化`, `策略規則測試`, `分析管線型別`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `Store` (e.g. with `_insert_in_progress()` and `TestAiStrategy`) actually correct?**
  _`Store` has 5 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `F4 Engagement Clustering & NLP Engine` and `AI Strategy Endpoint (Claude Haiku 5.5)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._