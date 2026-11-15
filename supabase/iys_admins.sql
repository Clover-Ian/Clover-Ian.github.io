-- IYS Pro（发号器）的管理员视图
-- 只有名单里的账号能一次看到所有用户的激活记录；其它账号调这个函数拿到空表。
-- 在 Supabase → SQL Editor 执行一次，可以重复执行。

create table if not exists public.iys_admins (
    user_id    uuid primary key references auth.users (id) on delete cascade,
    note       text,
    created_at timestamptz not null default now()
);

alter table public.iys_admins enable row level security;
-- 故意不建任何 policy：客户端读不到这张表，只能通过下面的函数判断

create or replace function public.is_iys_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
    select exists (select 1 from public.iys_admins where user_id = auth.uid());
$$;

grant execute on function public.is_iys_admin() to authenticated;

-- 管理员专用：所有人的激活记录 + 账号信息
create or replace function public.admin_activations()
returns table (
    license_key  text,
    product      text,
    activated_at timestamptz,
    user_id      uuid,
    email        text,
    name         text,
    avatar_url   text
)
language sql
stable
security definer
set search_path = public, auth
as $$
    select a.license_key,
           a.product,
           a.activated_at,
           a.user_id,
           u.email::text,
           coalesce(p.username, split_part(u.email::text, '@', 1)),
           coalesce(u.raw_user_meta_data->>'avatar_url',
                    u.raw_user_meta_data->>'picture')
      from public.license_activations a
      join auth.users u on u.id = a.user_id
      left join public.profiles p on p.id = a.user_id
     where public.is_iys_admin()
     order by a.activated_at desc;
$$;

grant execute on function public.admin_activations() to authenticated;
