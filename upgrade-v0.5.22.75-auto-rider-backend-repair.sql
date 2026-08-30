-- V0.5.22.75 AUTO RIDER BACKEND REPAIR
-- Run ONCE in Supabase SQL Editor after deploying the V0.5.22.75 frontend.
--
-- Business rule:
-- customer orders A+B+C -> each shop accepts -> customer pays each shop ->
-- when the LAST active shop confirms payment, create ONE delivery batch immediately
-- while shops are still preparing -> create one rider job -> Push riders.
--
-- No partial automatic trips. Cancelled shops are ignored.
-- Delivery fee remains COD to rider at destination.

begin;

create or replace function public.market_shop_auto_delivery_begin(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_caller uuid := auth.uid();
  v_order public.market_orders%rowtype;
  v_group public.market_delivery_groups%rowtype;
  v_batch public.market_delivery_batches%rowtype;
  v_ids uuid[];
  v_waiting integer := 0;
  v_pickups jsonb;
begin
  if v_caller is null then
    raise exception 'login required';
  end if;

  select o.* into v_order
  from public.market_orders o
  join public.market_shops s on s.id=o.shop_id
  where o.id=p_order_id
    and s.owner_id=v_caller;

  if not found then
    raise exception 'order not found or not your shop';
  end if;

  if v_order.status not in ('preparing','ready') then
    return jsonb_build_object('skipped',true,'reason','payment_not_confirmed');
  end if;

  -- Lock the group so two shops confirming at nearly the same time cannot create two rider jobs.
  select * into v_group
  from public.market_delivery_groups
  where id=v_order.group_id
  for update;

  if not found then
    raise exception 'delivery group not found';
  end if;

  if coalesce(v_group.fulfillment_method,'delivery') <> 'delivery' then
    return jsonb_build_object('skipped',true,'reason','pickup');
  end if;

  -- If a real batch already exists, either resume a previously interrupted "creating"
  -- batch or report that the rider was already called.
  select b.* into v_batch
  from public.market_delivery_batches b
  where b.group_id=v_group.id
    and b.status<>'cancelled'
  order by b.created_at desc
  limit 1
  for update;

  if found and v_batch.status<>'creating' then
    return jsonb_build_object(
      'skipped',false,
      'already_called',true,
      'batch_id',v_batch.id,
      'group_id',v_group.id,
      'rider_job_id',v_batch.rider_job_id,
      'batch_status',v_batch.status
    );
  end if;

  -- Wait for EVERY non-cancelled shop in this checkout group to confirm payment.
  -- This guarantees one combined rider trip instead of charging the customer twice.
  select count(*) into v_waiting
  from public.market_orders o
  where o.group_id=v_group.id
    and o.status<>'cancelled'
    and o.status not in ('preparing','ready');

  if v_waiting>0 then
    return jsonb_build_object(
      'skipped',true,
      'reason','waiting_other_shops',
      'waiting_count',v_waiting,
      'group_id',v_group.id
    );
  end if;

  select array_agg(o.id order by o.created_at)
  into v_ids
  from public.market_orders o
  where o.group_id=v_group.id
    and o.status in ('preparing','ready');

  if coalesce(array_length(v_ids,1),0)=0 then
    return jsonb_build_object('skipped',true,'reason','no_orders');
  end if;

  -- V0.5.22.68 incorrectly reused market_create_delivery_batch(), which only accepts READY.
  -- Auto dispatch must happen at PREPARING, so create the batch here after strict ownership/
  -- group/payment checks above.
  if v_batch.id is null then
    insert into public.market_delivery_batches(group_id,status)
    values(v_group.id,'creating')
    returning * into v_batch;

    insert into public.market_delivery_batch_orders(batch_id,order_id)
    select v_batch.id,unnest(v_ids);
  else
    -- Resume an interrupted creating batch. Use exactly the orders already attached to it.
    select array_agg(bo.order_id order by o.created_at)
    into v_ids
    from public.market_delivery_batch_orders bo
    join public.market_orders o on o.id=bo.order_id
    where bo.batch_id=v_batch.id;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'type','pickup',
      'label',s.name,
      'lat',s.latitude,
      'lng',s.longitude,
      'note',coalesce(s.landmark,s.address,''),
      'shop_id',s.id,
      'contact_name',s.name,
      'contact_phone',coalesce(s.phone,'')
    )
    order by o.created_at
  )
  into v_pickups
  from public.market_orders o
  join public.market_shops s on s.id=o.shop_id
  where o.id=any(v_ids);

  return jsonb_build_object(
    'skipped',false,
    'already_called',false,
    'resumed_creating_batch',v_batch.created_at < now() - interval '1 second',
    'batch_id',v_batch.id,
    'group_id',v_group.id,
    'pickups',coalesce(v_pickups,'[]'::jsonb),
    'dropoff',jsonb_build_object(
      'type','dropoff',
      'label',coalesce(v_group.delivery_address,'จุดส่งลูกค้า'),
      'lat',v_group.delivery_lat,
      'lng',v_group.delivery_lng,
      'note','ผู้รับ '||coalesce(v_group.customer_name,'')||' โทร '||coalesce(v_group.customer_phone,''),
      'shop_id',null,
      'contact_name',coalesce(v_group.customer_name,''),
      'contact_phone',coalesce(v_group.customer_phone,'')
    )
  );
end
$$;

create or replace function public.market_shop_auto_delivery_finish(
  p_order_id uuid,
  p_batch_id uuid,
  p_stops jsonb,
  p_distance_km numeric,
  p_fare_estimate numeric,
  p_extra_stop_fee numeric
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_caller uuid := auth.uid();
  v_order public.market_orders%rowtype;
  v_group public.market_delivery_groups%rowtype;
  v_batch public.market_delivery_batches%rowtype;
  v_job_id uuid;
  v_old_sub text;
begin
  if v_caller is null then
    raise exception 'login required';
  end if;

  select o.* into v_order
  from public.market_orders o
  join public.market_shops s on s.id=o.shop_id
  where o.id=p_order_id
    and s.owner_id=v_caller;

  if not found then
    raise exception 'order not found or not your shop';
  end if;

  select b.* into v_batch
  from public.market_delivery_batches b
  where b.id=p_batch_id
    and b.group_id=v_order.group_id
  for update;

  if not found then
    raise exception 'delivery batch not found';
  end if;

  select * into v_group
  from public.market_delivery_groups
  where id=v_batch.group_id;

  if coalesce(v_group.fulfillment_method,'delivery')<>'delivery' then
    raise exception 'order switched to pickup';
  end if;

  -- Idempotency: if another request already attached the rider job, never create another.
  if v_batch.rider_job_id is not null and v_batch.status<>'creating' then
    return jsonb_build_object(
      'ok',true,
      'already_called',true,
      'batch_id',v_batch.id,
      'rider_job_id',v_batch.rider_job_id,
      'payer','recipient',
      'fare_estimate',v_batch.delivery_fee
    );
  end if;

  if v_batch.status<>'creating' then
    raise exception 'delivery batch is not available for automatic dispatch';
  end if;

  if p_stops is null or jsonb_typeof(p_stops)<>'array' or jsonb_array_length(p_stops)<2 then
    raise exception 'invalid delivery stops';
  end if;

  if p_distance_km is null or p_distance_km<=0 or p_distance_km>10 then
    raise exception 'delivery route is outside supported distance';
  end if;

  if p_fare_estimate is null or p_fare_estimate<0 then
    raise exception 'invalid fare estimate';
  end if;

  -- Existing rider RPCs authorize the customer. Temporarily provide the actual checkout
  -- customer's auth.uid() only inside this transaction, then restore the seller identity.
  v_old_sub := current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub',v_group.customer_id::text,true);

  select public.rider_create_multistop_job(
    p_stops,
    'MARKET_BATCH:'||p_batch_id::text||' | ชุดคำสั่งซื้อ '||upper(left(v_group.id::text,8)),
    'recipient',
    p_distance_km,
    p_fare_estimate,
    p_extra_stop_fee
  )
  into v_job_id;

  perform public.market_attach_delivery_batch(
    p_batch_id,
    v_job_id,
    p_fare_estimate,
    p_distance_km
  );

  perform set_config('request.jwt.claim.sub',coalesce(v_old_sub,''),true);

  return jsonb_build_object(
    'ok',true,
    'already_called',false,
    'batch_id',p_batch_id,
    'rider_job_id',v_job_id,
    'payer','recipient',
    'fare_estimate',p_fare_estimate
  );
exception
  when others then
    if v_old_sub is not null then
      perform set_config('request.jwt.claim.sub',v_old_sub,true);
    end if;
    raise;
end
$$;

revoke all on function public.market_shop_auto_delivery_begin(uuid) from public,anon;
revoke all on function public.market_shop_auto_delivery_finish(uuid,uuid,jsonb,numeric,numeric,numeric) from public,anon;
grant execute on function public.market_shop_auto_delivery_begin(uuid) to authenticated;
grant execute on function public.market_shop_auto_delivery_finish(uuid,uuid,jsonb,numeric,numeric,numeric) to authenticated;

notify pgrst,'reload schema';

commit;

select 'v0.5.22.75 auto rider backend repair ready' as result;
