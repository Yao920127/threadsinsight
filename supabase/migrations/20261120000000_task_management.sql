-- 任務管理（PRD F2、例外情境 7、8）
-- 1. posts 補上 engagement_tier（合成資料的預設互動層級），報告需要完整還原每篇貼文。
-- 2. started_at：每次執行（含重跑）的開始時間，用來判斷「卡住超過 3 分鐘」。重跑保留原任務，
--    created_at 不變，所以不能用 created_at 判斷。
-- 3. save_analysis_results：在同一個交易內替換貼文與彙總並把任務標為 completed，
--    重跑時不會出現「舊貼文已刪、新貼文未寫入」的中間狀態。以呼叫者身分執行，RLS 照常生效。

alter table public.posts
  add column engagement_tier text not null check (engagement_tier in ('high', 'medium', 'low'));

alter table public.analysis_tasks
  add column started_at timestamptz not null default now();

drop index public.analysis_tasks_in_progress_idx;
create index analysis_tasks_in_progress_idx
  on public.analysis_tasks (started_at)
  where status in ('pending', 'generating', 'analyzing');

-- 任務列表：同使用者依建立時間由新到舊
create index analysis_tasks_user_created_idx
  on public.analysis_tasks (user_id, created_at desc);

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

comment on function public.save_analysis_results is
  '以交易替換任務的貼文與彙總並標為 completed；security invoker，RLS 生效';

-- 只開放登入使用者呼叫（函式預設對 public 開放，先收回）
revoke execute on function public.save_analysis_results(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_analysis_results(uuid, jsonb, jsonb) to authenticated;
