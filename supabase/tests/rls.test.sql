-- RLS 與 Mock Dataset 約束的資料庫測試（pgTAP，執行：supabase test db）
-- 對應 PRD AC-1：使用者只能看到自己的任務；未登入者讀不到任何業務資料。
begin;
select plan(16);

-- ---------- 準備兩位使用者（觸發器應自動建立 profiles） ----------
insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'user_a@example.com', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'user_b@example.com', 'authenticated', 'authenticated');

select is(
  (select count(*)::int from public.profiles),
  2,
  '註冊時觸發器自動建立 profile'
);

-- 以使用者 A 身分建立任務與貼文
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

insert into public.analysis_tasks (id, user_id, target_username, target_url)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'demo_user', 'demo_user');

insert into public.posts (task_id, user_id, platform_post_id, post_url, published_at, engagement_tier)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        '1', 'mock://threads/@demo_user/post/1', now(), 'low');

select is((select count(*)::int from public.analysis_tasks), 1, 'A 看得到自己的任務');
select is((select count(*)::int from public.posts), 1, 'A 看得到自己的貼文');
select is((select count(*)::int from public.profiles), 1, 'A 只看得到自己的 profile');

select throws_ok(
  $$insert into public.analysis_tasks (user_id, target_username, target_url)
    values ('22222222-2222-2222-2222-222222222222', 'demo_user', 'demo_user')$$,
  '42501',
  null,
  'A 不能替 B 建立任務'
);

-- ---------- 切換成使用者 B ----------
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select is((select count(*)::int from public.analysis_tasks), 0, 'B 看不到 A 的任務（RLS）');
select is((select count(*)::int from public.posts), 0, 'B 看不到 A 的貼文');

select throws_ok(
  $$insert into public.posts (task_id, user_id, platform_post_id, post_url, published_at, engagement_tier)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
            '2', 'mock://threads/@demo_user/post/2', now(), 'low')$$,
  '42501',
  null,
  'B 不能把貼文掛到 A 的任務底下'
);

update public.analysis_tasks set status = 'failed' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from public.analysis_tasks where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- ---------- 未登入（anon） ----------
reset role;
set local role anon;
select throws_ok('select * from public.analysis_tasks', '42501', null, 'anon 不能讀取任務表');
select throws_ok('select * from public.posts', '42501', null, 'anon 不能讀取貼文表');

-- ---------- 回到管理身分檢查 B 的更新與刪除沒有生效 ----------
reset role;
select is(
  (select status from public.analysis_tasks where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'pending',
  'B 無法修改 A 的任務，也無法刪除'
);

-- ---------- Mock Dataset 約束 ----------
select throws_ok(
  $$insert into public.analysis_tasks (user_id, target_username, target_url, data_source)
    values ('11111111-1111-1111-1111-111111111111', 'demo_user', 'demo_user', 'scraped')$$,
  '23514', null, 'data_source 只能是 mock_dataset'
);
select throws_ok(
  $$insert into public.posts (task_id, user_id, platform_post_id, post_url, published_at, engagement_tier)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
            '9', 'https://www.threads.com/@demo_user/post/9', now(), 'low')$$,
  '23514', null, 'post_url 不可為真實 threads.com 網址'
);
select throws_ok(
  $$insert into public.posts (task_id, user_id, platform_post_id, post_url, published_at, engagement_tier, is_synthetic)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
            '10', 'mock://threads/@demo_user/post/10', now(), 'low', false)$$,
  '23514', null, 'is_synthetic 只能是 true'
);
select throws_ok(
  $$insert into public.analysis_tasks (user_id, target_username, target_url, requested_count)
    values ('11111111-1111-1111-1111-111111111111', 'demo_user', 'demo_user', 51)$$,
  '23514', null, '貼文數上限 50'
);

-- 刪除使用者會連帶刪除其所有資料
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.posts), 0, '刪除使用者連帶刪除任務與貼文');

select * from finish();
rollback;
