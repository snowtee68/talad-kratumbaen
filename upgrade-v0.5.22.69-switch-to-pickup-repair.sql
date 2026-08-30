-- V0.5.22.69 Repair: customer can switch an unaccepted rider batch to self-pickup.
-- Safe replacement for the older v0.5.22.67 function.
-- IMPORTANT: does NOT change delivery_fee and does NOT cancel product orders.
-- Run once in Supabase SQL Editor after deploying V0.5.22.69.

create or replace function public.market_customer_switch_delivery_to_pickup(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_group_id uuid;
  v_status text;
  v_accepted_at timestamptz;
  v_customer_id uuid;
  v_rider_job_id uuid;
begin
  if v_uid is null then raise exception 'login required'; end if;

  select b.group_id,b.status,b.accepted_at,b.rider_job_id
    into v_group_id,v_status,v_accepted_at,v_rider_job_id
  from public.market_delivery_batches b
  where b.id=p_batch_id
  for update;

  if not found then raise exception 'delivery batch not found'; end if;

  select g.customer_id into v_customer_id
  from public.market_delivery_groups g
  where g.id=v_group_id
  for update;

  if v_customer_id is distinct from v_uid then
    raise exception 'not your delivery';
  end if;

  if v_accepted_at is not null
     or coalesce(v_status,'') not in ('creating','waiting_rider','created','open') then
    raise exception 'rider already accepted or delivery can no longer be changed';
  end if;

  -- Cancel only rider dispatch. Product orders remain untouched.
  update public.market_delivery_batches
  set status='cancelled'
  where id=p_batch_id;

  -- Mark the whole customer group as self-pickup so the UI cannot create
  -- another rider job for this same group. Preserve all delivery quote/history.
  update public.market_delivery_groups
  set fulfillment_method='pickup',
      pickup_requested_at=coalesce(pickup_requested_at,now())
  where id=v_group_id;

  -- Best-effort sync for legacy rider_jobs table. The rider inbox itself is
  -- driven by market_delivery_batches, so a cancelled batch disappears there.
  if v_rider_job_id is not null and to_regclass('public.rider_jobs') is not null then
    begin
      execute 'update public.rider_jobs set status=$1 where id=$2'
        using 'cancelled',v_rider_job_id;
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok',true,
    'batch_id',p_batch_id,
    'group_id',v_group_id,
    'fulfillment_method','pickup',
    'refund_required',false
  );
end $$;

revoke all on function public.market_customer_switch_delivery_to_pickup(uuid) from public,anon;
grant execute on function public.market_customer_switch_delivery_to_pickup(uuid) to authenticated;

notify pgrst,'reload schema';
select 'v0.5.22.69 pickup button repair ready' as result;
