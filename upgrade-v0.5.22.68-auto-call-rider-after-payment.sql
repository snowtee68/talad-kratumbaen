-- V0.5.22.68 Auto call rider after seller confirms payment
-- Run once in Supabase SQL Editor.

create or replace function public.market_shop_auto_delivery_begin(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_caller uuid:=auth.uid();
  v_order public.market_orders%rowtype;
  v_group public.market_delivery_groups%rowtype;
  v_batch_id uuid;
  v_ids uuid[];
  v_waiting int:=0;
  v_existing uuid;
  v_old_sub text;
  v_pickups jsonb;
begin
  if v_caller is null then raise exception 'login required'; end if;

  select o.* into v_order
  from public.market_orders o
  join public.market_shops s on s.id=o.shop_id
  where o.id=p_order_id and s.owner_id=v_caller;
  if not found then raise exception 'order not found or not your shop'; end if;

  if v_order.status not in ('preparing','ready') then
    return jsonb_build_object('skipped',true,'reason','payment_not_confirmed');
  end if;

  select * into v_group from public.market_delivery_groups where id=v_order.group_id;
  if not found or coalesce(v_group.fulfillment_method,'delivery')='pickup' then
    return jsonb_build_object('skipped',true,'reason','pickup');
  end if;

  select b.id into v_existing
  from public.market_delivery_batches b
  where b.group_id=v_group.id and coalesce(b.status,'')<>'cancelled'
  order by b.created_at desc nulls last
  limit 1;
  if v_existing is not null then
    return jsonb_build_object('skipped',false,'already_called',true,'batch_id',v_existing,'group_id',v_group.id);
  end if;

  -- Multi-shop: wait for every active shop to confirm payment, then call one rider.
  select count(*) into v_waiting
  from public.market_orders o
  where o.group_id=v_group.id
    and o.status<>'cancelled'
    and o.status not in ('preparing','ready','completed');
  if v_waiting>0 then
    return jsonb_build_object('skipped',true,'reason','waiting_other_shops','waiting_count',v_waiting);
  end if;

  select array_agg(o.id order by o.created_at) into v_ids
  from public.market_orders o
  where o.group_id=v_group.id and o.status in ('preparing','ready');

  if coalesce(array_length(v_ids,1),0)=0 then
    return jsonb_build_object('skipped',true,'reason','no_orders');
  end if;

  -- Reuse existing customer batch logic under the actual customer identity.
  v_old_sub:=current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub',v_group.customer_id::text,true);
  select public.market_create_delivery_batch(v_group.id,v_ids) into v_batch_id;
  perform set_config('request.jwt.claim.sub',coalesce(v_old_sub,''),true);

  select jsonb_agg(jsonb_build_object(
    'type','pickup','label',s.name,'lat',s.latitude,'lng',s.longitude,
    'note',coalesce(s.landmark,s.address,''),'shop_id',s.id,
    'contact_name',s.name,'contact_phone',coalesce(s.phone,'')
  ) order by o.created_at)
  into v_pickups
  from public.market_orders o
  join public.market_shops s on s.id=o.shop_id
  where o.id=any(v_ids);

  return jsonb_build_object(
    'skipped',false,'already_called',false,'batch_id',v_batch_id,'group_id',v_group.id,
    'pickups',coalesce(v_pickups,'[]'::jsonb),
    'dropoff',jsonb_build_object(
      'type','dropoff','label',coalesce(v_group.delivery_address,'จุดส่งลูกค้า'),
      'lat',v_group.delivery_lat,'lng',v_group.delivery_lng,
      'note','ผู้รับ '||coalesce(v_group.customer_name,'')||' โทร '||coalesce(v_group.customer_phone,''),
      'shop_id',null,'contact_name',coalesce(v_group.customer_name,''),
      'contact_phone',coalesce(v_group.customer_phone,'')
    )
  );
exception when others then
  if v_old_sub is not null then perform set_config('request.jwt.claim.sub',v_old_sub,true); end if;
  raise;
end $$;

create or replace function public.market_shop_auto_delivery_finish(
  p_order_id uuid,p_batch_id uuid,p_stops jsonb,p_distance_km numeric,p_fare_estimate numeric,p_extra_stop_fee numeric
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_caller uuid:=auth.uid();
  v_order public.market_orders%rowtype;
  v_group public.market_delivery_groups%rowtype;
  v_job_id uuid;
  v_old_sub text;
begin
  if v_caller is null then raise exception 'login required'; end if;

  select o.* into v_order
  from public.market_orders o
  join public.market_shops s on s.id=o.shop_id
  where o.id=p_order_id and s.owner_id=v_caller;
  if not found then raise exception 'order not found or not your shop'; end if;

  select g.* into v_group
  from public.market_delivery_groups g
  join public.market_delivery_batches b on b.group_id=g.id
  where b.id=p_batch_id and g.id=v_order.group_id;
  if not found then raise exception 'delivery batch not found'; end if;

  v_old_sub:=current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub',v_group.customer_id::text,true);

  select public.rider_create_multistop_job(
    p_stops,
    'MARKET_BATCH:'||p_batch_id::text||' | ชุดคำสั่งซื้อ '||upper(left(v_group.id::text,8)),
    'recipient',
    p_distance_km,p_fare_estimate,p_extra_stop_fee
  ) into v_job_id;

  perform public.market_attach_delivery_batch(p_batch_id,v_job_id,p_fare_estimate,p_distance_km);
  perform set_config('request.jwt.claim.sub',coalesce(v_old_sub,''),true);

  return jsonb_build_object('ok',true,'batch_id',p_batch_id,'rider_job_id',v_job_id,'payer','recipient','fare_estimate',p_fare_estimate);
exception when others then
  if v_old_sub is not null then perform set_config('request.jwt.claim.sub',v_old_sub,true); end if;
  raise;
end $$;

revoke all on function public.market_shop_auto_delivery_begin(uuid) from public,anon;
revoke all on function public.market_shop_auto_delivery_finish(uuid,uuid,jsonb,numeric,numeric,numeric) from public,anon;
grant execute on function public.market_shop_auto_delivery_begin(uuid) to authenticated;
grant execute on function public.market_shop_auto_delivery_finish(uuid,uuid,jsonb,numeric,numeric,numeric) to authenticated;

notify pgrst,'reload schema';
select 'v0.5.22.68 auto call rider after payment ready' as result;
