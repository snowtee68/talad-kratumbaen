-- V0.5.22.11 - Global Delivery Switch
-- Adds one global setting without changing any per-shop delivery/access settings.

create table if not exists public.market_system_settings (
  setting_key text primary key,
  delivery_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

insert into public.market_system_settings(setting_key, delivery_enabled)
values ('global', true)
on conflict (setting_key) do nothing;

alter table public.market_system_settings enable row level security;

-- Keep direct table access closed. The app reads/writes through the functions below.
revoke all on table public.market_system_settings from anon, authenticated;

create or replace function public.market_get_system_settings()
returns table(delivery_enabled boolean)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(s.delivery_enabled, true)
  from public.market_system_settings s
  where s.setting_key = 'global'
  union all
  select true
  where not exists (
    select 1 from public.market_system_settings s2 where s2.setting_key = 'global'
  )
  limit 1;
$$;

create or replace function public.market_admin_set_delivery_enabled(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.market_profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'Admin only';
  end if;

  insert into public.market_system_settings(setting_key, delivery_enabled, updated_at, updated_by)
  values ('global', coalesce(p_enabled, true), now(), auth.uid())
  on conflict (setting_key) do update
    set delivery_enabled = excluded.delivery_enabled,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  return coalesce(p_enabled, true);
end;
$$;

revoke all on function public.market_get_system_settings() from public;
revoke all on function public.market_admin_set_delivery_enabled(boolean) from public;
grant execute on function public.market_get_system_settings() to anon, authenticated;
grant execute on function public.market_admin_set_delivery_enabled(boolean) to authenticated;
