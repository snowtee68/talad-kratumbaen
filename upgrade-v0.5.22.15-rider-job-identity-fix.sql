-- V0.5.22.15 - Rider job identity fix
-- Admin recent Delivery jobs now resolve the actual assigned rider from
-- rider_jobs.assigned_rider_id -> rider_profiles.user_id first.
-- market_delivery_batches rider_name/rider_phone are only a fallback.
-- Does not alter rider acceptance or delivery flow.

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
  select
    b.id::text,
    b.rider_job_id::text,
    coalesce(nullif(trim(rp.display_name),''), nullif(trim(b.rider_name),''))::text as rider_name,
    coalesce(nullif(trim(rp.phone::text),''), nullif(trim(b.rider_phone),''))::text as rider_phone,
    b.status::text,
    b.delivery_fee::numeric,
    b.distance_km::numeric,
    b.created_at,
    b.accepted_at,
    b.completed_at
  from public.market_delivery_batches b
  left join public.rider_jobs j
    on j.id = b.rider_job_id
  left join public.rider_profiles rp
    on rp.user_id = j.assigned_rider_id
  order by b.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),200));
end;
$$;

revoke all on function public.market_admin_recent_rider_jobs(integer) from public;
grant execute on function public.market_admin_recent_rider_jobs(integer) to authenticated;
