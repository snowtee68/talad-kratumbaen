-- V0.5.22.12 - Rider / Win registry for Market Admin
-- Safe add-on: does not change existing delivery job flow or existing batch status logic.

create table if not exists public.market_rider_registry (
  id uuid primary key default gen_random_uuid(),
  display_name text null,
  phone text not null,
  phone_key text not null unique,
  enabled boolean not null default true,
  source text not null default 'delivery_job',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_batch_id uuid null,
  created_by uuid null,
  updated_at timestamptz not null default now()
);

alter table public.market_rider_registry enable row level security;
revoke all on table public.market_rider_registry from anon, authenticated;

create or replace function public.market_normalize_rider_phone(p_phone text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p_phone,''), '[^0-9]+', '', 'g');
$$;

-- Automatically remember rider identity whenever an existing Delivery batch receives rider contact data.
create or replace function public.market_sync_rider_registry_from_batch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_seen timestamptz;
begin
  v_key := public.market_normalize_rider_phone(new.rider_phone);
  if v_key = '' then
    return new;
  end if;
  v_seen := coalesce(new.accepted_at, now());

  insert into public.market_rider_registry(
    display_name, phone, phone_key, enabled, source,
    first_seen_at, last_seen_at, last_batch_id, updated_at
  ) values (
    nullif(trim(coalesce(new.rider_name,'')),''),
    new.rider_phone,
    v_key,
    true,
    'delivery_job',
    v_seen,
    v_seen,
    new.id,
    now()
  )
  on conflict (phone_key) do update set
    display_name = coalesce(nullif(trim(coalesce(excluded.display_name,'')),''), public.market_rider_registry.display_name),
    phone = excluded.phone,
    last_seen_at = greatest(public.market_rider_registry.last_seen_at, excluded.last_seen_at),
    last_batch_id = excluded.last_batch_id,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_market_sync_rider_registry on public.market_delivery_batches;
create trigger trg_market_sync_rider_registry
after insert or update of rider_name, rider_phone, accepted_at
on public.market_delivery_batches
for each row
when (new.rider_phone is not null and length(trim(new.rider_phone)) > 0)
execute function public.market_sync_rider_registry_from_batch();

-- Backfill riders already seen in historical Market delivery batches.
insert into public.market_rider_registry(
  display_name, phone, phone_key, enabled, source,
  first_seen_at, last_seen_at, last_batch_id, updated_at
)
select
  x.rider_name,
  x.rider_phone,
  x.phone_key,
  true,
  'delivery_job',
  x.first_seen_at,
  x.last_seen_at,
  x.last_batch_id,
  now()
from (
  select distinct on (public.market_normalize_rider_phone(b.rider_phone))
    nullif(trim(coalesce(b.rider_name,'')),'') as rider_name,
    b.rider_phone,
    public.market_normalize_rider_phone(b.rider_phone) as phone_key,
    min(coalesce(b.accepted_at,b.created_at)) over (partition by public.market_normalize_rider_phone(b.rider_phone)) as first_seen_at,
    max(coalesce(b.accepted_at,b.created_at)) over (partition by public.market_normalize_rider_phone(b.rider_phone)) as last_seen_at,
    first_value(b.id) over (
      partition by public.market_normalize_rider_phone(b.rider_phone)
      order by coalesce(b.accepted_at,b.created_at) desc
    ) as last_batch_id
  from public.market_delivery_batches b
  where b.rider_phone is not null
    and public.market_normalize_rider_phone(b.rider_phone) <> ''
  order by public.market_normalize_rider_phone(b.rider_phone), coalesce(b.accepted_at,b.created_at) desc
) x
on conflict (phone_key) do update set
  display_name = coalesce(excluded.display_name, public.market_rider_registry.display_name),
  phone = excluded.phone,
  first_seen_at = least(public.market_rider_registry.first_seen_at, excluded.first_seen_at),
  last_seen_at = greatest(public.market_rider_registry.last_seen_at, excluded.last_seen_at),
  last_batch_id = excluded.last_batch_id,
  updated_at = now();

create or replace function public.market_admin_rider_directory()
returns table(
  id uuid,
  display_name text,
  phone text,
  enabled boolean,
  source text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  active_jobs bigint,
  completed_jobs bigint,
  total_jobs bigint,
  last_job_status text,
  last_job_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.market_profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then raise exception 'Admin only'; end if;

  return query
  select
    r.id, r.display_name, r.phone, r.enabled, r.source,
    r.first_seen_at, r.last_seen_at,
    coalesce(c.active_jobs,0)::bigint,
    coalesce(c.completed_jobs,0)::bigint,
    coalesce(c.total_jobs,0)::bigint,
    l.status::text,
    l.job_at
  from public.market_rider_registry r
  left join lateral (
    select
      count(*) filter (where b.status not in ('completed','cancelled')) as active_jobs,
      count(*) filter (where b.status = 'completed') as completed_jobs,
      count(*) as total_jobs
    from public.market_delivery_batches b
    where public.market_normalize_rider_phone(b.rider_phone) = r.phone_key
  ) c on true
  left join lateral (
    select b.status::text as status, coalesce(b.completed_at,b.accepted_at,b.created_at) as job_at
    from public.market_delivery_batches b
    where public.market_normalize_rider_phone(b.rider_phone) = r.phone_key
    order by coalesce(b.completed_at,b.accepted_at,b.created_at) desc
    limit 1
  ) l on true
  order by (coalesce(c.active_jobs,0) > 0) desc, r.enabled desc, r.last_seen_at desc, r.display_name nulls last;
end;
$$;

create or replace function public.market_admin_recent_rider_jobs(p_limit integer default 50)
returns table(
  batch_id text,
  rider_job_id text,
  rider_name text,
  rider_phone text,
  status text,
  delivery_fee numeric,
  distance_km numeric,
  created_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.market_profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then raise exception 'Admin only'; end if;

  return query
  select b.id::text, b.rider_job_id::text, b.rider_name, b.rider_phone, b.status::text,
         b.delivery_fee::numeric, b.distance_km::numeric, b.created_at, b.accepted_at, b.completed_at
  from public.market_delivery_batches b
  order by b.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),200));
end;
$$;

create or replace function public.market_admin_upsert_rider(p_name text, p_phone text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_key text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.market_profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then raise exception 'Admin only'; end if;

  v_key := public.market_normalize_rider_phone(p_phone);
  if length(trim(coalesce(p_name,''))) < 1 then raise exception 'Rider name required'; end if;
  if length(v_key) < 9 then raise exception 'Invalid phone'; end if;

  insert into public.market_rider_registry(display_name,phone,phone_key,enabled,source,created_by,updated_at)
  values(trim(p_name),trim(p_phone),v_key,true,'admin',auth.uid(),now())
  on conflict (phone_key) do update set
    display_name=excluded.display_name,
    phone=excluded.phone,
    enabled=true,
    updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.market_admin_set_rider_enabled(p_rider_id uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.market_profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then raise exception 'Admin only'; end if;

  update public.market_rider_registry
  set enabled=coalesce(p_enabled,false), updated_at=now()
  where id=p_rider_id;
  if not found then raise exception 'Rider not found'; end if;
  return coalesce(p_enabled,false);
end;
$$;

revoke all on function public.market_admin_rider_directory() from public;
revoke all on function public.market_admin_recent_rider_jobs(integer) from public;
revoke all on function public.market_admin_upsert_rider(text,text) from public;
revoke all on function public.market_admin_set_rider_enabled(uuid,boolean) from public;
grant execute on function public.market_admin_rider_directory() to authenticated;
grant execute on function public.market_admin_recent_rider_jobs(integer) to authenticated;
grant execute on function public.market_admin_upsert_rider(text,text) to authenticated;
grant execute on function public.market_admin_set_rider_enabled(uuid,boolean) to authenticated;
