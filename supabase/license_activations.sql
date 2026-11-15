-- IYS 授权码激活记录
-- 一张 key 可以被一个账号绑定一次；同一个 key 里的多个 App 各占一行。
-- 在 Supabase → SQL Editor 执行，可重复执行。

create table if not exists public.license_activations (
    license_key  text        not null,
    user_id      uuid        not null references auth.users (id) on delete cascade,
    product      text        not null default 'archiver',
    activated_at timestamptz not null default now(),
    primary key (license_key, product)
);

-- 老版本是 (license_key) 单主键，迁移成 (license_key, product)
do $$
declare
    cols int;
begin
    select array_length(conkey, 1) into cols
      from pg_constraint
     where conrelid = 'public.license_activations'::regclass
       and contype = 'p';

    if cols is null or cols < 2 then
        alter table public.license_activations drop constraint if exists license_activations_pkey;
        alter table public.license_activations add primary key (license_key, product);
    end if;
end $$;

alter table public.license_activations enable row level security;

drop policy if exists "license read own" on public.license_activations;
create policy "license read own" on public.license_activations
    for select to authenticated
    using (user_id = auth.uid());

revoke insert, update, delete on public.license_activations from anon, authenticated;
grant select on public.license_activations to authenticated;

-- 一把 key 只能有一个主人；同一个 App 重复激活返回 already_yours，
-- 换了 App（多 App key）就再补一行。
create or replace function public.activate_license(candidate text, app text default 'archiver')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    me    uuid := auth.uid();
    clean text := upper(regexp_replace(candidate, '\s', '', 'g'));
    owner uuid;
    mine  boolean;
begin
    if me is null then
        return 'sign_in_required';
    end if;

    if clean is null or clean = '' then
        return 'invalid';
    end if;

    select user_id into owner
      from public.license_activations
     where license_key = clean
     order by activated_at
     limit 1;

    if owner is not null and owner <> me then
        return 'taken';
    end if;

    select exists (
        select 1
          from public.license_activations
         where license_key = clean
           and product = app
           and user_id = me
    ) into mine;

    if mine then
        return 'already_yours';
    end if;

    insert into public.license_activations (license_key, user_id, product)
    values (clean, me, app)
    on conflict (license_key, product) do nothing;

    return 'activated';
end;
$$;

grant execute on function public.activate_license(text, text) to authenticated;
