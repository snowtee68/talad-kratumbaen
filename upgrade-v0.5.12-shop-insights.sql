-- V0.5.12 Shop Sales & Insight Report
-- Owner-only report. Sales are calculated from market_orders.
-- Analytics reuses the existing admin analytics data through the existing event store if available.

create or replace function public.market_shop_owner_insights(p_shop_id uuid,p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_now timestamptz:=now();
  v_start timestamptz:=now()-(greatest(1,least(coalesce(p_days,30),365))||' days')::interval;
  v_prev timestamptz:=now()-(greatest(1,least(coalesce(p_days,30),365))*2||' days')::interval;
  r jsonb;
  v_views bigint:=0; v_nav bigint:=0; v_phone bigint:=0;
  t text;
begin
  if not exists(select 1 from public.market_shops s where s.id=p_shop_id and s.owner_id=auth.uid()) then
    raise exception 'ไม่มีสิทธิ์ดูรายงานร้านนี้';
  end if;

  select jsonb_build_object(
    'sales_total',coalesce(sum(case when o.status not in ('cancelled') and o.paid_at is not null then coalesce(o.revision_subtotal,o.subtotal,0) else 0 end),0),
    'completed_orders',count(*) filter(where o.status not in ('cancelled') and o.paid_at is not null),
    'avg_order',coalesce(avg(coalesce(o.revision_subtotal,o.subtotal,0)) filter(where o.status not in ('cancelled') and o.paid_at is not null),0),
    'delivery_sales',coalesce(sum(case when o.status not in ('cancelled') and o.paid_at is not null and g.fulfillment_method='delivery' then coalesce(o.revision_subtotal,o.subtotal,0) else 0 end),0),
    'pickup_sales',coalesce(sum(case when o.status not in ('cancelled') and o.paid_at is not null and g.fulfillment_method='pickup' then coalesce(o.revision_subtotal,o.subtotal,0) else 0 end),0),
    'cancelled_orders',count(*) filter(where o.status='cancelled'),
    'refund_total',coalesce(sum(case when coalesce(o.refund_status,'')='completed' then coalesce(o.refund_amount,0) else 0 end),0)
  ) into r
  from public.market_orders o
  left join public.market_delivery_groups g on g.id=o.group_id
  where o.shop_id=p_shop_id and o.created_at>=v_start and o.created_at<v_now;

  r:=coalesce(r,'{}'::jsonb) || jsonb_build_object(
    'sales_prev',coalesce((select sum(coalesce(o.revision_subtotal,o.subtotal,0)) from public.market_orders o where o.shop_id=p_shop_id and o.paid_at is not null and o.status<>'cancelled' and o.created_at>=v_prev and o.created_at<v_start),0)
  );

  -- Detect the existing analytics event table without exposing it to shop owners.
  -- Current deployments commonly use market_analytics_events or market_events.
  if to_regclass('public.market_analytics_events') is not null then
    t:='market_analytics_events';
  elsif to_regclass('public.market_events') is not null then
    t:='market_events';
  elsif to_regclass('public.analytics_events') is not null then
    t:='analytics_events';
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

select 'v0.5.12 shop insights ready' as result;
