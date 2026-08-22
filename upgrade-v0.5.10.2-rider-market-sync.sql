-- V0.5.10.2 Rider -> Market Delivery live sync
-- Run once after V0.5.9/V0.5.10 delivery tables exist.

create or replace function public.market_rider_update_delivery_batch(
  p_rider_job_id uuid,
  p_status text,
  p_rider_name text default null,
  p_rider_phone text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  b public.market_delivery_batches%rowtype;
  v_group_id uuid;
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  if p_status not in (
    'waiting_rider','accepted','pickup_started',
    'picked_up','delivering','completed','cancelled'
  ) then
    raise exception 'สถานะวินไม่ถูกต้อง';
  end if;

  select * into b
  from public.market_delivery_batches
  where rider_job_id=p_rider_job_id
  for update;

  if b.id is null then
    raise exception 'ไม่พบงานจัดส่ง';
  end if;

  -- For active rider statuses, confirm that this account really owns
  -- the Rider job in the existing rider_jobs system.
  if p_status <> 'waiting_rider' then
    if not exists (
      select 1
      from public.rider_jobs r
      where r.id=p_rider_job_id
        and r.assigned_rider_id=auth.uid()
    ) then
      raise exception 'งานนี้ไม่ได้ถูกมอบหมายให้วินบัญชีนี้';
    end if;
  else
    -- Withdrawal: only the rider currently bound to this batch may reset it.
    if b.rider_user_id is not null and b.rider_user_id<>auth.uid() then
      raise exception 'งานนี้เป็นของวินคนอื่น';
    end if;
  end if;

  if p_status='waiting_rider' then
    update public.market_delivery_batches
       set status='waiting_rider',
           rider_user_id=null,
           rider_name=null,
           rider_phone=null,
           accepted_at=null,
           pickup_started_at=null,
           picked_up_at=null,
           delivering_at=null,
           updated_at=now()
     where id=b.id;
  else
    update public.market_delivery_batches
       set rider_user_id=auth.uid(),
           rider_name=coalesce(nullif(trim(p_rider_name),''),rider_name),
           rider_phone=coalesce(
             nullif(regexp_replace(coalesce(p_rider_phone,''),'[^0-9+]','','g'),''),
             rider_phone
           ),
           status=p_status,
           accepted_at=case when p_status='accepted'
             then coalesce(accepted_at,now()) else accepted_at end,
           pickup_started_at=case when p_status='pickup_started'
             then coalesce(pickup_started_at,now()) else pickup_started_at end,
           picked_up_at=case when p_status='picked_up'
             then coalesce(picked_up_at,now()) else picked_up_at end,
           delivering_at=case when p_status='delivering'
             then coalesce(delivering_at,now()) else delivering_at end,
           completed_at=case when p_status='completed'
             then coalesce(completed_at,now()) else completed_at end,
           cancelled_at=case when p_status='cancelled'
             then coalesce(cancelled_at,now()) else cancelled_at end,
           updated_at=now()
     where id=b.id;
  end if;

  select group_id into v_group_id
  from public.market_delivery_batches
  where id=b.id;

  -- When rider completes the batch, close only orders that belong to this trip.
  if p_status='completed' then
    update public.market_orders o
       set status='completed',
           updated_at=now()
     where exists (
       select 1
       from public.market_delivery_batch_orders bo
       where bo.batch_id=b.id and bo.order_id=o.id
     )
       and o.status<>'cancelled';

    -- Close the checkout group only when no active order is left unfinished.
    if not exists (
      select 1
      from public.market_orders o
      where o.group_id=v_group_id
        and o.status not in ('completed','cancelled')
    ) then
      update public.market_delivery_groups
         set status='completed',
             updated_at=now()
       where id=v_group_id;
    end if;
  end if;

  return jsonb_build_object(
    'batch_id',b.id,
    'group_id',v_group_id,
    'status',p_status,
    'rider_name',nullif(trim(coalesce(p_rider_name,'')),''),
    'rider_phone',nullif(trim(coalesce(p_rider_phone,'')),'')
  );
end $$;

revoke all on function public.market_rider_update_delivery_batch(uuid,text,text,text) from public;
grant execute on function public.market_rider_update_delivery_batch(uuid,text,text,text) to authenticated;

select 'v0.5.10.2 rider market sync ready' as result;
