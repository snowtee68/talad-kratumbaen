-- Talad Krathumbaen v0.5.21.8
-- Mission fulfillment correctness + global Mission on/off

alter table public.market_mission_settings
  add column if not exists mission_active boolean not null default true;

insert into public.market_mission_settings(mission_key,mission_active)
values ('mission_v1',true)
on conflict (mission_key) do nothing;

-- Mission buyer progress must use REAL fulfillment, not market_orders.status alone.
-- Pickup: shop explicitly completed handoff (pickup_completed_at).
-- Delivery: the order belongs to a delivery batch that reached completed.
create or replace function public.market_mission_completed_order_count()
returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count bigint:=0;
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  select count(*) into v_count
  from public.market_orders o
  join public.market_delivery_groups g on g.id=o.group_id
  where o.customer_id=auth.uid()
    and o.status<>'cancelled'
    and coalesce(o.refund_status,'')<>'completed'
    and (
      (g.fulfillment_method='pickup' and o.pickup_completed_at is not null)
      or
      (g.fulfillment_method='delivery' and exists(
        select 1
        from public.market_delivery_batch_orders bo
        join public.market_delivery_batches b on b.id=bo.batch_id
        where bo.order_id=o.id
          and b.status='completed'
          and b.completed_at is not null
      ))
    );

  return coalesce(v_count,0);
end $$;

revoke all on function public.market_mission_completed_order_count() from public;
grant execute on function public.market_mission_completed_order_count() to authenticated;

-- Replace v0.5.21.5 admin setter: it now also controls Mission globally.
drop function if exists public.market_admin_set_mission_reward(text,text,text,boolean);
create or replace function public.market_admin_set_mission_reward(
  p_mission_active boolean default true,
  p_reward_title text default '',
  p_reward_detail text default '',
  p_claim_note text default '',
  p_reward_active boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not exists(select 1 from public.market_profiles where id=auth.uid() and role='admin') then
    raise exception 'admin only';
  end if;
  if p_reward_active and nullif(trim(coalesce(p_reward_title,'')),'') is null then
    raise exception 'กรุณาระบุชื่อรางวัลก่อนเปิดใช้งาน';
  end if;

  insert into public.market_mission_settings(
    mission_key,mission_active,reward_title,reward_detail,claim_note,reward_active,updated_at,updated_by
  ) values (
    'mission_v1',coalesce(p_mission_active,true),left(trim(coalesce(p_reward_title,'')),120),left(trim(coalesce(p_reward_detail,'')),500),left(trim(coalesce(p_claim_note,'')),500),coalesce(p_reward_active,false),now(),auth.uid()
  )
  on conflict(mission_key) do update set
    mission_active=excluded.mission_active,
    reward_title=excluded.reward_title,
    reward_detail=excluded.reward_detail,
    claim_note=excluded.claim_note,
    reward_active=excluded.reward_active,
    updated_at=now(),
    updated_by=auth.uid();

  return jsonb_build_object('ok',true,'mission_key','mission_v1','mission_active',coalesce(p_mission_active,true),'reward_active',coalesce(p_reward_active,false));
end $$;

revoke all on function public.market_admin_set_mission_reward(boolean,text,text,text,boolean) from public;
grant execute on function public.market_admin_set_mission_reward(boolean,text,text,text,boolean) to authenticated;

select 'v0.5.21.8 mission fulfillment + toggle ready' as result;
