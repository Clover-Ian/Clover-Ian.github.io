-- 把"排行榜上线之前"存在账号资料里的最好成绩补进 benchmark_scores
-- 在 Supabase → SQL Editor 整段执行一次即可（重复执行安全）。

-- 反应时间（越小越好）
with parsed as (
  select
    u.id,
    coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), 'Player') as name,
    (u.raw_user_meta_data->'benchmark'->>'reaction')::numeric as value
  from auth.users u
  where u.raw_user_meta_data->'benchmark'->>'reaction' ~ '^[0-9]+(\.[0-9]+)?$'
)
insert into public.benchmark_scores (user_id, test, value, detail)
select p.id, 'reaction', p.value, jsonb_build_object('name', p.name)
from parsed p
where not exists (
  select 1 from public.benchmark_scores s
  where s.user_id = p.id and s.test = 'reaction' and s.value <= p.value
);

-- 点击 10 秒（越大越好）
with parsed as (
  select
    u.id,
    coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), 'Player') as name,
    (u.raw_user_meta_data->'benchmark'->>'click:10')::numeric as value
  from auth.users u
  where u.raw_user_meta_data->'benchmark'->>'click:10' ~ '^[0-9]+(\.[0-9]+)?$'
)
insert into public.benchmark_scores (user_id, test, value, detail)
select p.id, 'click', p.value, jsonb_build_object('name', p.name, 'seconds', 10)
from parsed p
where not exists (
  select 1 from public.benchmark_scores s
  where s.user_id = p.id and s.test = 'click'
    and (s.detail->>'seconds') = '10' and s.value >= p.value
);

-- 点击 60 秒
with parsed as (
  select
    u.id,
    coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), 'Player') as name,
    (u.raw_user_meta_data->'benchmark'->>'click:60')::numeric as value
  from auth.users u
  where u.raw_user_meta_data->'benchmark'->>'click:60' ~ '^[0-9]+(\.[0-9]+)?$'
)
insert into public.benchmark_scores (user_id, test, value, detail)
select p.id, 'click', p.value, jsonb_build_object('name', p.name, 'seconds', 60)
from parsed p
where not exists (
  select 1 from public.benchmark_scores s
  where s.user_id = p.id and s.test = 'click'
    and (s.detail->>'seconds') = '60' and s.value >= p.value
);

-- 打字速度（越大越好）
with parsed as (
  select
    u.id,
    coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), 'Player') as name,
    (u.raw_user_meta_data->'benchmark'->>'typing')::numeric as value
  from auth.users u
  where u.raw_user_meta_data->'benchmark'->>'typing' ~ '^[0-9]+(\.[0-9]+)?$'
)
insert into public.benchmark_scores (user_id, test, value, detail)
select p.id, 'typing', p.value, jsonb_build_object('name', p.name)
from parsed p
where not exists (
  select 1 from public.benchmark_scores s
  where s.user_id = p.id and s.test = 'typing' and s.value >= p.value
);
