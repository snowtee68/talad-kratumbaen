-- V0.5.22.78 – Rider New Job Sound + Assigned Rider Shop Ready Push
-- Run ONCE in Supabase SQL Editor after deploying V0.5.22.78.
--
-- Adds:
-- 1) Seller-safe context for "สินค้าพร้อมให้วินเข้ารับ"
-- 2) Service-role recipient lookup for ONLY the rider who accepted the batch
-- 3) Rider inbox shop-level order_status so rider can see which shop is ready
--
-- Does NOT change auto-rider creation, fare, rider acceptance or pickup logic.

begin;

create or replace function public.market_shop_rider_ready_context(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.market_orders%rowtype;
  v_shop_name text;
  v_batch public.market_delivery_batches%rowtype;
begin
  if v_uid is null then raise exception 'login required'; end if;

  select o.*,s.name
    into v_order,v_shop_name
  from public.market_orders o
  join public.market_shops s on s.id=o.shop_id
  where o.id=p_order_id
    and s.owner_id=v_uid;

  if not found then raise exception 'order not found or not your shop'; end if;
  if v_order.status<>'ready' then
    return jsonb_build_object('ok',false,'reason','order_not_ready','shop_name',v_shop_name);
  end if;

  select b.* into v_batch
  from public.market_delivery_batch_orders bo
  join public.market_delivery_batches b on b.id=bo.batch_id
  join public.market_delivery_groups g on g.id=b.group_id
  where bo.order_id=p_order_id
    and coalesce(g.fulfillment_method,'delivery')='delivery'
    and b.status<>'cancelled'
  order by b.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok',true,'shop_name',v_shop_name,
      'batch_id',null,'rider_assigned',false,'reason','no_delivery_batch'
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'shop_name',v_shop_name,
    'batch_id',v_batch.id,
    'rider_job_id',v_batch.rider_job_id,
    'rider_assigned',(v_batch.accepted_at is not null),
    'rider_name',v_batch.rider_name,
    'rider_phone',v_batch.rider_phone,
    'batch_status',v_batch.status
  );
end
$$;

revoke all on function public.market_shop_rider_ready_context(uuid) from public,anon;
grant execute on function public.market_shop_rider_ready_context(uuid) to authenticated;


-- Called only by send-rider-push with service_role.
-- Resolve the accepted batch rider to the authenticated account that owns the Push subscription.
create or replace function public.market_push_batch_rider_user_ids(p_batch_id uuid)
returns table(user_id uuid)
language sql
security definer
set search_path=public
as $$
  with b as (
    select rider_name,rider_phone,accepted_at
    from public.market_delivery_batches
    where id=p_batch_id
      and accepted_at is not null
      and status not in ('cancelled','completed')
  ),
  candidates as (
    select a.user_id,
           case
             when nullif(trim(coalesce(b.rider_phone,'')),'') is not null
              and lower(regexp_replace(coalesce(a.phone,''),'\D','','g'))
                  = lower(regexp_replace(coalesce(b.rider_phone,''),'\D','','g')) then 1
             when nullif(trim(coalesce(b.rider_name,'')),'') is not null
              and lower(trim(coalesce(a.display_name,'')))=lower(trim(coalesce(b.rider_name,''))) then 2
             else 9
           end as rank
    from b
    join public.market_rider_applications a
      on a.status='approved'
     and a.user_id is not null
     and (
       (nullif(trim(coalesce(b.rider_phone,'')),'') is not null
        and regexp_replace(coalesce(a.phone,''),'\D','','g')=regexp_replace(coalesce(b.rider_phone,''),'\D','','g'))
       or
       (nullif(trim(coalesce(b.rider_name,'')),'') is not null
        and lower(trim(coalesce(a.display_name,'')))=lower(trim(coalesce(b.rider_name,'')))
     )
    union all
    select rp.user_id,
           case
             when nullif(trim(coalesce(b.rider_phone,'')),'') is not null
              and regexp_replace(coalesce(rp.phone,''),'\D','','g')=regexp_replace(coalesce(b.rider_phone,''),'\D','','g') then 1
             when nullif(trim(coalesce(b.rider_name,'')),'') is not null
              and lower(trim(coalesce(rp.display_name,'')))=lower(trim(coalesce(b.rider_name,''))) then 2
             else 9
           end
    from b
    join public.rider_profiles rp
      on rp.user_id is not null
     and coalesce(rp.approval_status,'approved')='approved'
     and (
       (nullif(trim(coalesce(b.rider_phone,'')),'') is not null
        and regexp_replace(coalesce(rp.phone,''),'\D','','g')=regexp_replace(coalesce(b.rider_phone,''),'\D','','g'))
       or
       (nullif(trim(coalesce(b.rider_name,'')),'') is not null
        and lower(trim(coalesce(rp.display_name,'')))=lower(trim(coalesce(b.rider_name,'')))
     )
  )
  select distinct c.user_id
  from candidates c
  where c.rank=(select min(rank) from candidates);
$$;

revoke all on function public.market_push_batch_rider_user_ids(uuid) from public,anon,authenticated;
grant execute on function public.market_push_batch_rider_user_ids(uuid) to service_role;


-- Preserve V0.5.22.71 pickup filtering + V0.5.22.62 coordinates,
-- and add each shop's order_status for rider readiness display.
create or replace function public.market_my_rider_job_inbox()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_name text;
  v_phone text;
  v_ok boolean := false;
  v_jobs jsonb;
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  select a.display_name,a.phone,(a.status='approved')
    into v_name,v_phone,v_ok
  from public.market_rider_applications a
  where a.user_id=auth.uid();

  if not coalesce(v_ok,false) then
    select rp.display_name,rp.phone,(coalesce(rp.approval_status,'approved')='approved')
      into v_name,v_phone,v_ok
    from public.rider_profiles rp
    where rp.user_id=auth.uid()
    limit 1;
  end if;

  if not coalesce(v_ok,false) then raise exception 'approved rider only'; end if;

  select coalesce(jsonb_agg(x.obj order by x.sort_time desc),'[]'::jsonb)
    into v_jobs
  from (
    select coalesce(b.created_at,b.accepted_at,now()) as sort_time,
      jsonb_build_object(
        'batch_id',b.id,
        'rider_job_id',b.rider_job_id,
        'status',b.status,
        'delivery_fee',b.delivery_fee,
        'distance_km',b.distance_km,
        'accepted_at',b.accepted_at,
        'delivery_arrived_at',b.delivery_arrived_at,
        'customer_name',g.customer_name,
        'customer_phone',g.customer_phone,
        'delivery_address',g.delivery_address,
        'delivery_lat',g.delivery_lat,
        'delivery_lng',g.delivery_lng,
        'fulfillment_method',g.fulfillment_method,
        'can_accept',(
          coalesce(g.fulfillment_method,'delivery')='delivery'
          and b.status in ('creating','waiting_rider','created','open')
          and b.accepted_at is null
        ),
        'is_mine',(
          b.accepted_at is not null
          and (
            lower(coalesce(b.rider_phone,''))=lower(coalesce(v_phone,''))
            or lower(coalesce(b.rider_name,''))=lower(coalesce(v_name,''))
          )
        ),
        'shops',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',s.id,
            'name',s.name,
            'phone',s.phone,
            'address',s.address,
            'landmark',s.landmark,
            'latitude',s.latitude,
            'longitude',s.longitude,
            'order_id',o.id,
            'order_status',o.status
          ) order by s.name)
          from public.market_delivery_batch_orders bo
          join public.market_orders o on o.id=bo.order_id
          join public.market_shops s on s.id=o.shop_id
          where bo.batch_id=b.id
            and o.status<>'cancelled'
        ),'[]'::jsonb)
      ) as obj
    from public.market_delivery_batches b
    join public.market_delivery_groups g on g.id=b.group_id
    where (
      coalesce(g.fulfillment_method,'delivery')='delivery'
      and b.status in ('creating','waiting_rider','created','open')
      and b.accepted_at is null
    ) or (
      b.status not in ('cancelled','completed')
      and b.accepted_at is not null
      and (
        lower(coalesce(b.rider_phone,''))=lower(coalesce(v_phone,''))
        or lower(coalesce(b.rider_name,''))=lower(coalesce(v_name,''))
      )
    )
  ) x;

  return v_jobs;
end
$$;

revoke all on function public.market_my_rider_job_inbox() from public;
grant execute on function public.market_my_rider_job_inbox() to authenticated;

notify pgrst,'reload schema';

commit;

select 'v0.5.22.78 rider sound + assigned rider shop-ready push ready' as result;
