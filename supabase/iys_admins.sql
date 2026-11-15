-- IYS Pro（发号器）的只读管理接口
-- 一次性执行即可；以后每有人买、每有人激活，记录都会被 activate_license() 自动写进来，
-- 不需要再动 SQL。
--
-- 口令写死在 App 里，用口令而不是登录来换取全部激活记录。
-- 换口令：改下面两处的 iys-pro-xxxxxxxx，再把 App 里的 AdminPasscode.swift 改成同一个值。

create or replace function public.admin_activations(passcode text)
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
     where passcode = 'iys-pro-8074ed5a77cfe853'
     order by a.activated_at desc;
$$;

grant execute on function public.admin_activations(text) to anon, authenticated;

-- 老版本基于登录的管理函数不再需要，可留可删
drop function if exists public.admin_activations();
drop function if exists public.is_iys_admin();
drop table if exists public.iys_admins;
