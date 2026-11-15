-- IYS 授权码激活记录：一个 key 只能被一个账号绑定一次
-- 在 Supabase → SQL Editor 执行一次。

create table if not exists public.license_activations (
    license_key  text primary key,
    user_id      uuid not null references auth.users (id) on delete cascade,
    product      text not null default 'archiver',
    activated_at timestamptz not null default now()
);

alter table public.license_activations enable row level security;

-- 只能看到自己的激活记录
drop policy if exists "license read own" on public.license_activations;
create policy "license read own" on public.license_activations
    for select to authenticated
    using (user_id = auth.uid());

-- 去掉客户端直接写入的权限：一切都走下面的函数
revoke insert, update, delete on public.license_activations from anon, authenticated;

-- 激活：返回 activated / already_yours / taken
create or replace function public.activate_license(candidate text, app text default 'archiver')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    me      uuid := auth.uid();
    owner   uuid;
    cleaned text := upper(regexp_replace(candidate, '\s', '', 'g'));
begin
    if me is null then
        return 'sign_in_required';
    end if;

    if cleaned is null or cleaned = '' then
        return 'invalid';
    end if;

    select user_id into owner
      from public.license_activations
     where license_key = cleaned;

    if owner is not null then
        if owner = me then
            return 'already_yours';
        end if;
        return 'taken';
    end if;

    begin
        insert into public.license_activations (license_key, user_id, product)
        values (cleaned, me, app);
    exception when unique_violation then
        return 'taken';
    end;

    return 'activated';
end;
$$;

grant execute on function public.activate_license(text, text) to authenticated;
