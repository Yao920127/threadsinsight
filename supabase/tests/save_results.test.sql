-- save_analysis_results：交易式寫入結果、重跑替換、RLS 隔離（PRD F2、AC-1）
begin;
select plan(11);

insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'user_a@example.com', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'user_b@example.com', 'authenticated', 'authenticated');

set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

insert into public.analysis_tasks (id, user_id, target_username, target_url, requested_count, status)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'demo_user', 'demo_user', 2, 'analyzing');

-- 兩篇貼文的最小欄位組合
create temp table fixture as
select
  jsonb_build_array(
    jsonb_build_object('platform_post_id', '1', 'post_url', 'mock://threads/@demo_user/post/1',
      'published_at', '2026-11-18T23:10:00+08:00', 'content', 'a', 'views_count', null,
      'likes_count', 10, 'replies_count', 1, 'reposts_count', 0, 'engagement_score', 12,
      'engagement_group', 'high', 'engagement_tier', 'high', 'char_count', 1, 'hashtag_count', 0,
      'mention_count', 0, 'url_count', 0, 'media_type', 'text_only', 'post_type', 'text_only',
      'topic', 'life', 'sentiment', 'neutral', 'has_question', false, 'has_cta', false),
    jsonb_build_object('platform_post_id', '2', 'post_url', 'mock://threads/@demo_user/post/2',
      'published_at', '2026-11-17T09:00:00+08:00', 'content', 'b', 'views_count', 100,
      'likes_count', 1, 'replies_count', 0, 'reposts_count', 0, 'engagement_score', 1,
      'engagement_group', 'low', 'engagement_tier', 'low', 'char_count', 1, 'hashtag_count', 0,
      'mention_count', 0, 'url_count', 0, 'media_type', 'image', 'post_type', 'image',
      'topic', 'tech', 'sentiment', 'positive', 'has_question', true, 'has_cta', false)
  ) as posts,
  '{"overview_metrics": {"cleaning": {"input_count": 2}}, "strategy_insights": {"source": "rule_engine"}}'::jsonb
    as summary;
grant select on fixture to authenticated;

select is(
  (select status from public.save_analysis_results(
     'aaaaaaaa-0000-0000-0000-000000000001', (select posts from fixture), (select summary from fixture))),
  'completed', '寫入結果後任務為 completed'
);
select is((select post_count from public.analysis_tasks), 2, 'post_count 依實際篇數');
select isnt((select completed_at from public.analysis_tasks), null, '寫入 completed_at');
select is((select count(*)::int from public.posts), 2, '寫入兩篇貼文');
select is(
  (select overview_metrics -> 'cleaning' ->> 'input_count' from public.analysis_summaries),
  '2', '寫入彙總'
);
select is(
  (select keywords_hashtags from public.analysis_summaries), '{}'::jsonb, '缺少的彙總欄位補預設值'
);

-- 重跑：同一任務再寫一次只剩新結果，不會重複
select lives_ok(
  $$select public.save_analysis_results('aaaaaaaa-0000-0000-0000-000000000001',
      (select jsonb_build_array(posts -> 0) from fixture), (select summary from fixture))$$,
  '重跑可再次寫入'
);
select is((select count(*)::int from public.posts), 1, '重跑後舊貼文被替換');
select is((select count(*)::int from public.analysis_summaries), 1, '彙總維持一筆');

-- 使用者 B 不能寫入 A 的任務
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select throws_ok(
  $$select public.save_analysis_results('aaaaaaaa-0000-0000-0000-000000000001',
      (select posts from fixture), (select summary from fixture))$$,
  'P0002', null, 'B 寫入 A 的任務視同找不到'
);

-- 未登入不能呼叫
reset role;
set local role anon;
select throws_ok(
  $$select public.save_analysis_results('aaaaaaaa-0000-0000-0000-000000000001', '[]', '{}')$$,
  '42501', null, 'anon 不能呼叫'
);

select * from finish();
rollback;
