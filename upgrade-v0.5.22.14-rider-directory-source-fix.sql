-- V0.5.22.14 - Rider directory source fix
-- Use the real rider account registry (rider_profiles) as the primary source,
-- then include legacy/admin market_rider_registry rows that are not represented there.
-- Does not change the rider job acceptance/delivery flow.

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
  with system_riders as (
    select
      rp.user_id as id,
      nullif(trim(coalesce(rp.display_name,'')),'') as display_name,
      rp.phone::text as phone,
      (coalesce(rp.approval_status,'pending') = 'approved') as enabled,
      'rider_profiles'::text as source,
      rp.created_at as first_seen_at,
      rp.created_at as last_seen_at,
      public.market_normalize_rider_phone(rp.phone::text) as phone_key
    from public.rider_profiles rp
    where public.market_normalize_rider_phone(rp.phone::text) <> ''
  ),
  legacy_riders as (
    select
      r.id,
      r.display_name,
      r.phone,
      r.enabled,
      r.source,
      r.first_seen_at,
      r.last_seen_at,
      r.phone_key
    from public.market_rider_registry r
    where not exists (
      select 1 from system_riders s where s.phone_key = r.phone_key
    )
  ),
  all_riders as (
    select * from system_riders
    union all
    select * from legacy_riders
  )
  select
    r.id, r.display_name, r.phone, r.enabled, r.source,
    r.first_seen_at,
    greatest(r.last_seen_at, coalesce(l.job_at,r.last_seen_at)) as last_seen_at,
    coalesce(c.active_jobs,0)::bigint,
    coalesce(c.completed_jobs,0)::bigint,
    coalesce(c.total_jobs,0)::bigint,
    l.status::text,
    l.job_at
  from all_riders r
  left join lateral (
    select
      count(*) filter (where b.status not in ('completed','cancelled')) as active_jobs,
      count(*) filter (where b.status = 'completed') as completed_jobs,
      count(*) as total_jobs
    from public.market_delivery_batches b
    where public.market_normalize_rider_phone(b.rider_phone) = r.phone_key
  ) c on true
  left join lateral (
    select b.status::text as status,
           coalesce(b.completed_at,b.accepted_at,b.created_at) as job_at
    from public.market_delivery_batches b
    where public.market_normalize_rider_phone(b.rider_phone) = r.phone_key
    order by coalesce(b.completed_at,b.accepted_at,b.created_at) desc
    limit 1
  ) l on true
  order by (coalesce(c.active_jobs,0) > 0) desc,
           r.enabled desc,
           greatest(r.last_seen_at,coalesce(l.job_at,r.last_seen_at)) desc,
           r.display_name nulls last;
end;
$$;

revoke all on function public.market_admin_rider_directory() from public;
grant execute on function public.market_admin_rider_directory() to authenticated;
