-- ThreadsInsight 初始資料結構（PRD 第 4 節、ADR-001）
-- 1. 四張業務資料表全部啟用 RLS，只開放 authenticated 存取自己的資料；anon 沒有任何 policy。
-- 2. Mock Dataset 規則寫成資料庫約束：只接受合成資料，從資料層防止混入真實貼文。
-- 3. policy 以 (select auth.uid()) 取得目前使用者，Postgres 只計算一次，避免逐列呼叫。

-- ---------- profiles ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is '使用者資料；註冊時由 handle_new_user 觸發器自動建立';

-- 註冊時自動建立 profile。security definer 以擁有者權限寫入；search_path 設為空字串，
-- 所有名稱都完整限定，避免被同名物件劫持。
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- analysis_tasks ----------

create table public.analysis_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
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
  completed_at timestamptz,
  check ((status = 'completed') = (completed_at is not null))
);

comment on table public.analysis_tasks is '分析任務；24 小時快取依 completed_at 判斷（PRD 例外情境 7）';

-- 快取查詢：同使用者、同帳號、同篇數的最新完成任務
create index analysis_tasks_cache_idx
  on public.analysis_tasks (user_id, target_username, requested_count, completed_at desc);
-- 卡住任務偵測：停在 generating／analyzing 超過 3 分鐘（PRD 例外情境 8）
create index analysis_tasks_in_progress_idx
  on public.analysis_tasks (created_at)
  where status in ('pending', 'generating', 'analyzing');

-- ---------- posts ----------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.analysis_tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
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
  user_id uuid not null references public.profiles (id) on delete cascade,
  overview_metrics jsonb not null default '{}',
  top_posts jsonb not null default '[]',
  distributions jsonb not null default '{}',
  keywords_hashtags jsonb not null default '[]',
  nlp_cluster_analysis jsonb not null default '{}',
  strategy_insights jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------

alter table public.profiles enable row level security;
alter table public.analysis_tasks enable row level security;
alter table public.posts enable row level security;
alter table public.analysis_summaries enable row level security;

-- profiles：只能讀取、修改自己；新增由觸發器負責，刪除隨 auth.users 連動
create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- analysis_tasks：完整 CRUD，限本人
create policy "tasks: read own" on public.analysis_tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "tasks: insert own" on public.analysis_tasks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tasks: update own" on public.analysis_tasks
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tasks: delete own" on public.analysis_tasks
  for delete to authenticated using ((select auth.uid()) = user_id);

-- posts／summaries：除了 user_id 是本人，寫入時所屬任務也必須是本人的，
-- 防止把資料掛到別人的任務底下
create policy "posts: read own" on public.posts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "posts: insert own" on public.posts
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.analysis_tasks t
      where t.id = task_id and t.user_id = (select auth.uid())
    )
  );
create policy "posts: delete own" on public.posts
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "summaries: read own" on public.analysis_summaries
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "summaries: insert own" on public.analysis_summaries
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.analysis_tasks t
      where t.id = task_id and t.user_id = (select auth.uid())
    )
  );
create policy "summaries: update own" on public.analysis_summaries
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "summaries: delete own" on public.analysis_summaries
  for delete to authenticated using ((select auth.uid()) = user_id);

-- anon 完全不需要這些表：收回預設授權，連查詢結構都不行（RLS 之外再加一層）
revoke all on public.profiles, public.analysis_tasks, public.posts, public.analysis_summaries
  from anon;
