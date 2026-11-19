-- ThreadsInsight 資料庫結構（純 PostgreSQL，ADR-002）
--
-- 1. 帳號與登入狀態（users、sessions）只由後端以資料庫擁有者身分存取；
--    一般請求使用的 threadsinsight_app 角色碰不到密碼雜湊。
-- 2. 業務資料表全部啟用 RLS：後端每個交易先 SET LOCAL ROLE threadsinsight_app，
--    再以 set_config('app.user_id', …) 告訴資料庫目前的使用者，由政策只放行本人的資料。
--    就算後端查詢漏寫條件，也拿不到別人的資料（RLS 是最後一道防線）。
-- 3. Mock Dataset 規則寫成資料庫約束：只接受合成資料，從資料層防止混入真實貼文。

-- 切換到純 PostgreSQL 前的舊遷移工具可能留下的空 schema，一併清掉
drop schema if exists supabase_migrations cascade;

-- ---------- 角色 ----------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'threadsinsight_app') then
    create role threadsinsight_app nologin;
  end if;
end
$$;

grant usage on schema public to threadsinsight_app;

-- 目前請求的使用者；未設定時為 null，政策一律不放行
create function public.current_app_user()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ---------- 帳號與登入狀態 ----------

create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique
    check (email = lower(email) and char_length(email) between 3 and 254 and email like '%_@_%'),
  password_hash text not null,
  created_at timestamptz not null default now()
);

comment on table public.users is '會員帳號；密碼以 scrypt 雜湊保存，只有後端擁有者身分能讀取';

-- 登入狀態：cookie 存隨機值，這裡只存它的 SHA-256，資料庫外洩也無法冒用
create table public.sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index sessions_user_idx on public.sessions (user_id);
create index sessions_expires_idx on public.sessions (expires_at);

-- ---------- analysis_tasks ----------

create table public.analysis_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  target_username text not null check (target_username ~ '^[a-z0-9._]{1,30}$'),
  target_url text not null check (char_length(target_url) <= 200),
  requested_count int not null default 30 check (requested_count between 1 and 50),
  status text not null default 'pending'
    check (status in ('pending', 'generating', 'analyzing', 'completed', 'failed')),
  data_source text not null default 'mock_dataset' check (data_source = 'mock_dataset'),
  source_note text not null
    default 'Scraping blocked (HTTP 401 on graphql/query) & official API unavailable; using deterministic Mock Dataset',
  post_count int not null default 0 check (post_count between 0 and 50),
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'completed') = (completed_at is not null))
);

comment on table public.analysis_tasks is '分析任務；24 小時快取依 completed_at 判斷（PRD 例外情境 7）';

-- 快取查詢：同使用者、同帳號、同篇數的最新完成任務
create index analysis_tasks_cache_idx
  on public.analysis_tasks (user_id, target_username, requested_count, completed_at desc);
-- 任務列表：同使用者依建立時間由新到舊
create index analysis_tasks_user_created_idx
  on public.analysis_tasks (user_id, created_at desc);
-- 卡住任務偵測：停在進行中超過 3 分鐘（PRD 例外情境 8，依每次執行的 started_at）
create index analysis_tasks_in_progress_idx
  on public.analysis_tasks (started_at)
  where status in ('pending', 'generating', 'analyzing');

-- ---------- posts ----------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.analysis_tasks (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  platform_post_id text not null,
  post_url text not null check (post_url like 'mock://threads/@%'),
  is_synthetic boolean not null default true check (is_synthetic),
  published_at timestamptz not null,
  content text not null default '',
  views_count bigint check (views_count >= 0),
  likes_count int not null default 0 check (likes_count >= 0),
  replies_count int not null default 0 check (replies_count >= 0),
  reposts_count int not null default 0 check (reposts_count >= 0),
  engagement_score numeric not null default 0,
  engagement_group text check (engagement_group in ('high', 'medium', 'low')),
  engagement_tier text not null check (engagement_tier in ('high', 'medium', 'low')),
  char_count int not null default 0,
  hashtag_count int not null default 0,
  mention_count int not null default 0,
  url_count int not null default 0,
  media_type text not null default 'text_only' check (media_type in ('text_only', 'image')),
  post_type text not null default 'text_only'
    check (post_type in ('image', 'link', 'hashtag', 'mention', 'text_only')),
  topic text check (topic in ('career', 'life', 'tech', 'opinion', 'other')),
  sentiment text check (sentiment in ('positive', 'neutral', 'negative')),
  has_question boolean,
  has_cta boolean,
  unique (task_id, platform_post_id)
);

comment on column public.posts.user_id is '冗餘儲存以加速 RLS 判斷（PRD 4.1）';

create index posts_task_idx on public.posts (task_id);

-- ---------- analysis_summaries ----------

create table public.analysis_summaries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.analysis_tasks (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  overview_metrics jsonb not null default '{}',
  top_posts jsonb not null default '[]',
  distributions jsonb not null default '{}',
  keywords_hashtags jsonb not null default '{}',
  nlp_cluster_analysis jsonb not null default '{}',
  strategy_insights jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------

alter table public.analysis_tasks enable row level security;
alter table public.posts enable row level security;
alter table public.analysis_summaries enable row level security;

create policy "tasks: read own" on public.analysis_tasks
  for select to threadsinsight_app using ((select public.current_app_user()) = user_id);
create policy "tasks: insert own" on public.analysis_tasks
  for insert to threadsinsight_app with check ((select public.current_app_user()) = user_id);
create policy "tasks: update own" on public.analysis_tasks
  for update to threadsinsight_app
  using ((select public.current_app_user()) = user_id)
  with check ((select public.current_app_user()) = user_id);
create policy "tasks: delete own" on public.analysis_tasks
  for delete to threadsinsight_app using ((select public.current_app_user()) = user_id);

-- posts／summaries：寫入時所屬任務也必須是本人的，防止把資料掛到別人的任務底下
create policy "posts: read own" on public.posts
  for select to threadsinsight_app using ((select public.current_app_user()) = user_id);
create policy "posts: insert own" on public.posts
  for insert to threadsinsight_app with check (
    (select public.current_app_user()) = user_id
    and exists (
      select 1 from public.analysis_tasks t
      where t.id = task_id and t.user_id = (select public.current_app_user())
    )
  );
create policy "posts: delete own" on public.posts
  for delete to threadsinsight_app using ((select public.current_app_user()) = user_id);

create policy "summaries: read own" on public.analysis_summaries
  for select to threadsinsight_app using ((select public.current_app_user()) = user_id);
create policy "summaries: insert own" on public.analysis_summaries
  for insert to threadsinsight_app with check (
    (select public.current_app_user()) = user_id
    and exists (
      select 1 from public.analysis_tasks t
      where t.id = task_id and t.user_id = (select public.current_app_user())
    )
  );
create policy "summaries: update own" on public.analysis_summaries
  for update to threadsinsight_app
  using ((select public.current_app_user()) = user_id)
  with check ((select public.current_app_user()) = user_id);
create policy "summaries: delete own" on public.analysis_summaries
  for delete to threadsinsight_app using ((select public.current_app_user()) = user_id);

grant select, insert, update, delete
  on public.analysis_tasks, public.posts, public.analysis_summaries
  to threadsinsight_app;

-- ---------- 交易式寫入結果 ----------

-- 在同一個交易內替換任務的貼文與彙總並標為 completed，重跑不會出現「只刪不寫」的中間狀態。
-- security invoker：以呼叫者（threadsinsight_app）身分執行，RLS 照常生效。
create function public.save_analysis_results(p_task_id uuid, p_posts jsonb, p_summary jsonb)
returns public.analysis_tasks
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_task public.analysis_tasks;
begin
  -- RLS 只讓本人看到自己的任務；別人的任務在這裡等同不存在
  select * into v_task from public.analysis_tasks where id = p_task_id for update;
  if not found then
    raise exception 'analysis task not found' using errcode = 'P0002';
  end if;

  delete from public.posts where task_id = p_task_id;
  delete from public.analysis_summaries where task_id = p_task_id;

  insert into public.posts (
    task_id, user_id, platform_post_id, post_url, published_at, content,
    views_count, likes_count, replies_count, reposts_count,
    engagement_score, engagement_group, engagement_tier,
    char_count, hashtag_count, mention_count, url_count,
    media_type, post_type, topic, sentiment, has_question, has_cta
  )
  select
    p_task_id, v_task.user_id, r.platform_post_id, r.post_url, r.published_at, r.content,
    r.views_count, r.likes_count, r.replies_count, r.reposts_count,
    r.engagement_score, r.engagement_group, r.engagement_tier,
    r.char_count, r.hashtag_count, r.mention_count, r.url_count,
    r.media_type, r.post_type, r.topic, r.sentiment, r.has_question, r.has_cta
  from jsonb_to_recordset(p_posts) as r (
    platform_post_id text, post_url text, published_at timestamptz, content text,
    views_count bigint, likes_count int, replies_count int, reposts_count int,
    engagement_score numeric, engagement_group text, engagement_tier text,
    char_count int, hashtag_count int, mention_count int, url_count int,
    media_type text, post_type text, topic text, sentiment text,
    has_question boolean, has_cta boolean
  );

  insert into public.analysis_summaries (
    task_id, user_id, overview_metrics, top_posts, distributions,
    keywords_hashtags, nlp_cluster_analysis, strategy_insights
  )
  values (
    p_task_id, v_task.user_id,
    coalesce(p_summary -> 'overview_metrics', '{}'),
    coalesce(p_summary -> 'top_posts', '[]'),
    coalesce(p_summary -> 'distributions', '{}'),
    coalesce(p_summary -> 'keywords_hashtags', '{}'),
    coalesce(p_summary -> 'nlp_cluster_analysis', '{}'),
    coalesce(p_summary -> 'strategy_insights', '{}')
  );

  update public.analysis_tasks
  set status = 'completed',
      completed_at = now(),
      post_count = jsonb_array_length(p_posts),
      error_message = null
  where id = p_task_id
  returning * into v_task;

  return v_task;
end;
$$;

revoke execute on function public.save_analysis_results(uuid, jsonb, jsonb) from public;
grant execute on function public.save_analysis_results(uuid, jsonb, jsonb) to threadsinsight_app;
