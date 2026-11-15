-- IYS Pro（发号器）的管理接口
-- 一次性执行；以后每有人买、每有人激活都不需要再动 SQL。
--
-- 口令写死在 App 里（AdminPasscode.swift），两边必须一致。

-- 发号时写下的备注，按 key 存
create table if not exists public.key_notes (
    license_key text primary key,
    note        text not null default '',
    updated_at  timestamptz not null default now()
);

alter table public.key_notes enable row level security;
-- 故意不建 policy：匿名读写都不行，只能走下面的函数

-- 管理视图：所有人的激活记录 + 备注
-- 返回列变了，先删旧的再建，否则 create or replace 会报错
drop function if exists public.admin_activations(text);

create or replace function public.admin_activations(passcode text)
returns table (
    license_key  text,
    product      text,
    activated_at timestamptz,
    user_id      uuid,
    email        text,
    name         text,
    avatar_url   text,
    note         text
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
                    u.raw_user_meta_data->>'picture'),
           coalesce(n.note, '')
      from public.license_activations a
      join auth.users u on u.id = a.user_id
      left join public.profiles p on p.id = a.user_id
      left join public.key_notes n on n.license_key = a.license_key
     where passcode = 'iys-pro-8074ed5a77cfe853'
     order by a.activated_at desc;
$$;

grant execute on function public.admin_activations(text) to anon, authenticated;

-- 发号时写备注（同一个 key 再写就是覆盖）
create or replace function public.set_key_note(passcode text, license_key text, note text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if passcode <> 'iys-pro-8074ed5a77cfe853' then
        return false;
    end if;

    insert into public.key_notes (license_key, note, updated_at)
    values (upper(license_key), coalesce(note, ''), now())
    on conflict (license_key) do update
        set note = excluded.note,
            updated_at = now();

    return true;
end;
$$;

grant execute on function public.set_key_note(text, text, text) to anon, authenticated;

-- 清掉上一版没用上的东西
drop function if exists public.admin_activations();
drop function if exists public.is_iys_admin();
drop table if exists public.iys_admins;
