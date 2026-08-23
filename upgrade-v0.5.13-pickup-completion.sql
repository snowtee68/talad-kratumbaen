-- V0.5.13 Pickup Completion Flow

alter table public.market_orders
  add column if not exists pickup_completed_at timestamptz;

create index if not exists market_orders_pickup_completed_idx
  on public.market_orders(group_id,pickup_completed_at)
  where pickup_completed_at is not null;

create or replace function public.market_complete_pickup_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  o public.market_orders%rowtype;
  v_group_completed boolean:=false;
begin
  select * into o
  from public.market_orders
  where id=p_order_id
  for update;

  if o.id is null then raise exception 'ไม่พบออเดอร์'; end if;

  if not exists(
    select 1 from public.market_shops s
    where s.id=o.shop_id and s.owner_id=auth.uid()
  ) then
    raise exception 'ไม่มีสิทธิ์ปิดออเดอร์ร้านนี้';
  end if;

  if not exists(
    select 1 from public.market_delivery_groups g
    where g.id=o.group_id and g.fulfillment_method='pickup'
  ) then
    raise exception 'ออเดอร์นี้ไม่ใช่การรับสินค้าที่ร้าน';
  end if;

  if o.status<>'ready' then
    raise exception 'ร้านต้องแจ้งสินค้าพร้อมรับก่อน';
  end if;

  if o.pickup_completed_at is null then
    update public.market_orders
       set pickup_completed_at=now(),
           updated_at=now()
     where id=o.id;
  end if;

  -- Complete the whole checkout group only when every non-cancelled shop
  -- has been handed to the customer.
  if not exists(
    select 1
    from public.market_orders x
    where x.group_id=o.group_id
      and x.status<>'cancelled'
      and x.pickup_completed_at is null
  ) then
    update public.market_delivery_groups
       set status='completed',
           updated_at=now()
     where id=o.group_id;
    v_group_completed:=true;
  end if;

  return jsonb_build_object(
    'order_id',o.id,
    'shop_id',o.shop_id,
    'group_id',o.group_id,
    'group_completed',v_group_completed
  );
end $$;

revoke all on function public.market_complete_pickup_order(uuid) from public;
grant execute on function public.market_complete_pickup_order(uuid) to authenticated;

-- Update owner report so "ยอดขายจริง" means fulfilled, not merely paid.
create or replace function public.market_shop_owner_insights(p_shop_id uuid,p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_now timestamptz:=now();
  v_days integer:=greatest(1,least(coalesce(p_days,30),365));
  v_start timestamptz;
  v_prev timestamptz;
  r jsonb;
  v_views bigint:=0; v_nav bigint:=0; v_phone bigint:=0;
  t text;
begin
  v_start:=v_now-(v_days||' days')::interval;
  v_prev:=v_now-(v_days*2||' days')::interval;

  if not exists(select 1 from public.market_shops s where s.id=p_shop_id and s.owner_id=auth.uid()) then
    raise exception 'ไม่มีสิทธิ์ดูรายงานร้านนี้';
  end if;

  with q as (
    select o.*,g.fulfillment_method,
      (
        (g.fulfillment_method='pickup' and o.pickup_completed_at is not null)
        or
        (g.fulfillment_method='delivery' and exists(
          select 1
          from public.market_delivery_batch_orders bo
          join public.market_delivery_batches b on b.id=bo.batch_id
          where bo.order_id=o.id and b.status='completed'
        ))
      ) as fulfilled
    from public.market_orders o
    left join public.market_delivery_groups g on g.id=o.group_id
    where o.shop_id=p_shop_id and o.created_at>=v_start and o.created_at<v_now
  )
  select jsonb_build_object(
    'sales_total',coalesce(sum(case when fulfilled then coalesce(revision_subtotal,subtotal,0) else 0 end),0),
    'completed_orders',count(*) filter(where fulfilled),
    'avg_order',coalesce(avg(coalesce(revision_subtotal,subtotal,0)) filter(where fulfilled),0),
    'delivery_sales',coalesce(sum(case when fulfilled and fulfillment_method='delivery' then coalesce(revision_subtotal,subtotal,0) else 0 end),0),
    'pickup_sales',coalesce(sum(case when fulfilled and fulfillment_method='pickup' then coalesce(revision_subtotal,subtotal,0) else 0 end),0),
    'cancelled_orders',count(*) filter(where status='cancelled'),
    'refund_total',coalesce(sum(case when coalesce(refund_status,'')='completed' then coalesce(refund_amount,0) else 0 end),0)
  ) into r from q;

  r:=coalesce(r,'{}'::jsonb) || jsonb_build_object(
    'sales_prev',coalesce((
      select sum(coalesce(o.revision_subtotal,o.subtotal,0))
      from public.market_orders o
      join public.market_delivery_groups g on g.id=o.group_id
      where o.shop_id=p_shop_id
        and o.created_at>=v_prev and o.created_at<v_start
        and (
          (g.fulfillment_method='pickup' and o.pickup_completed_at is not null)
          or
          (g.fulfillment_method='delivery' and exists(
            select 1 from public.market_delivery_batch_orders bo
            join public.market_delivery_batches b on b.id=bo.batch_id
            where bo.order_id=o.id and b.status='completed'
          ))
        )
    ),0)
  );

  if to_regclass('public.market_analytics_events') is not null then t:='market_analytics_events';
  elsif to_regclass('public.market_events') is not null then t:='market_events';
  elsif to_regclass('public.analytics_events') is not null then t:='analytics_events';
  end if;

  if t is not null then
    begin
      execute format(
        'select count(*) filter(where event_type=''shop_view''), count(*) filter(where event_type=''navigate_click''), count(*) filter(where event_type=''phone_click'') from public.%I where shop_id=$1 and created_at >= $2',
        t
      ) into v_views,v_nav,v_phone using p_shop_id,v_start;
    exception when undefined_column then
      v_views:=0;v_nav:=0;v_phone:=0;
    end;
  end if;

  return r || jsonb_build_object(
    'shop_views',coalesce(v_views,0),
    'navigate_clicks',coalesce(v_nav,0),
    'phone_clicks',coalesce(v_phone,0)
  );
end $$;

revoke all on function public.market_shop_owner_insights(uuid,integer) from public;
grant execute on function public.market_shop_owner_insights(uuid,integer) to authenticated;

select 'v0.5.13 pickup completion ready' as result;
