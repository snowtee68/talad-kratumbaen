-- V0.5.22.66: recipient list for server-side rider push
create or replace function public.market_push_approved_rider_user_ids()
returns table(user_id uuid)
language sql
security definer
set search_path=public
as $$
  select distinct a.user_id
  from public.market_rider_applications a
  where a.status='approved' and a.user_id is not null
  union
  select distinct rp.user_id
  from public.rider_profiles rp
  where rp.user_id is not null
    and coalesce(rp.approval_status,'approved')='approved';
$$;

revoke all on function public.market_push_approved_rider_user_ids() from public, anon, authenticated;
grant execute on function public.market_push_approved_rider_user_ids() to service_role;

notify pgrst,'reload schema';
select 'v0.5.22.66 rider background push recipient RPC ready' as result;
