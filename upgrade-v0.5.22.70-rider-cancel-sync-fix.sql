-- V0.5.22.70 Rider Cancel / Pickup Sync Fix
-- Run once in Supabase SQL Editor after deploying V0.5.22.70.
-- Ensures a delivery switched to self-pickup can no longer appear/accept in rider inbox.

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
  v_ok boolean:=false;
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
        'customer_name',g.customer_name,
        'customer_phone',g.customer_phone,
        'delivery_address',g.delivery_address,
        'fulfillment_method',g.fulfillment_method,
        'can_accept',(
          coalesce(g.fulfillment_method,'delivery')='delivery'
          and b.status in ('creating','waiting_rider','created','open')
          and b.accepted_at is null
        ),
        'is_mine',(
          b.accepted_at is not null
          and (lower(coalesce(b.rider_phone,''))=lower(coalesce(v_phone,''))
               or lower(coalesce(b.rider_name,''))=lower(coalesce(v_name,'')))
        ),
        'shops',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',s.id,'name',s.name,'phone',s.phone,'address',s.address,'landmark',s.landmark
          ) order by s.name)
          from public.market_delivery_batch_orders bo
          join public.market_orders o on o.id=bo.order_id
          join public.market_shops s on s.id=o.shop_id
          where bo.batch_id=b.id
        ),'[]'::jsonb)
      ) as obj
    from public.market_delivery_batches b
    join public.market_delivery_groups g on g.id=b.group_id
    where
      (
        coalesce(g.fulfillment_method,'delivery')='delivery'
        and b.status in ('creating','waiting_rider','created','open')
        and b.accepted_at is null
      )
      or
      (
        b.status not in ('cancelled','completed')
        and b.accepted_at is not null
        and (lower(coalesce(b.rider_phone,''))=lower(coalesce(v_phone,''))
             or lower(coalesce(b.rider_name,''))=lower(coalesce(v_name,'')))
      )
  ) x;

  return v_jobs;
end $$;

revoke all on function public.market_my_rider_job_inbox() from public;
grant execute on function public.market_my_rider_job_inbox() to authenticated;

create or replace function public.market_rider_accept_delivery_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_name text;
  v_phone text;
  v_ok boolean:=false;
  v_job_id uuid;
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

  -- Atomic accept, and also verify the customer group is still delivery.
  update public.market_delivery_batches b
  set rider_name=v_name,
      rider_phone=v_phone,
      accepted_at=now(),
      status='accepted'
  from public.market_delivery_groups g
  where b.id=p_batch_id
    and g.id=b.group_id
    and coalesce(g.fulfillment_method,'delivery')='delivery'
    and b.status in ('creating','waiting_rider','created','open')
    and b.accepted_at is null
  returning b.rider_job_id into v_job_id;

  if not found then
    raise exception 'job cancelled, switched to pickup, already accepted, or no longer available';
  end if;

  if v_job_id is not null and to_regclass('public.rider_jobs') is not null then
    begin
      execute 'update public.rider_jobs set status=$1 where id=$2' using 'accepted',v_job_id;
    exception when others then null;
    end;
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name='rider_jobs' and column_name='accepted_at') then
      begin
        execute 'update public.rider_jobs set accepted_at=coalesce(accepted_at,now()) where id=$1' using v_job_id;
      exception when others then null;
      end;
    end if;
  end if;

  return jsonb_build_object('ok',true,'batch_id',p_batch_id,'rider_job_id',v_job_id,'status','accepted','rider_name',v_name,'rider_phone',v_phone);
end $$;

revoke all on function public.market_rider_accept_delivery_batch(uuid) from public;
grant execute on function public.market_rider_accept_delivery_batch(uuid) to authenticated;

notify pgrst,'reload schema';
select 'v0.5.22.70 rider cancel/pickup sync fix ready' as result;
