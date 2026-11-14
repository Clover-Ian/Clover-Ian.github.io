-- 注册页"邮箱是否已注册"的查询函数
-- Supabase → SQL Editor 执行一次。

create or replace function public.email_exists(candidate text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users
    where lower(email) = lower(trim(candidate))
  );
$$;

grant execute on function public.email_exists(text) to anon, authenticated;
