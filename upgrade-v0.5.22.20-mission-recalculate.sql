-- V0.5.22.20 Mission Recalculate + Coupon Claim Repair
-- จุดประสงค์:
-- 1) Mission V1 คำนวณใหม่จากข้อมูลจริงทุกครั้ง (ไม่ใช้สถานะสำเร็จเก่าที่บันทึกค้าง)
-- 2) เงื่อนไข "อุดหนุนร้านในชุมชน" ใช้เฉพาะออเดอร์ที่จบกระบวนการจริง
-- 3) ถอนคูปอง Mission ที่เคย auto-claim ผิดและ "ยังไม่เคยใช้"
-- 4) ไม่ย้อนแก้ออเดอร์/ส่วนลดที่ใช้คูปองไปแล้ว


-- เพิ่มกำหนดเวลาสิ้นสุดการรับรางวัลของ Mission
alter table public.market_mission_settings
  add column if not exists reward_claim_until timestamptz;

-- อัปเดต RPC Admin ให้บันทึกวัน/เวลาสิ้นสุดการรับรางวัลได้
drop function if exists public.market_admin_set_mission_reward(boolean,text,text,text,boolean,boolean,uuid,text,numeric,numeric,numeric,text,timestamptz);
drop function if exists public.market_admin_set_mission_reward(boolean,text,text,text,boolean,timestamptz,boolean,uuid,text,numeric,numeric,numeric,text,timestamptz);

create or replace function public.market_admin_set_mission_reward(
  p_mission_active boolean default true,
  p_reward_title text default '',
  p_reward_detail text default '',
  p_claim_note text default '',
  p_reward_active boolean default false,
  p_reward_claim_until timestamptz default null,
  p_coupon_active boolean default false,
  p_coupon_shop_id uuid default null,
  p_coupon_discount_type text default 'fixed',
  p_coupon_discount_value numeric default 0,
  p_coupon_min_spend numeric default 0,
  p_coupon_max_discount numeric default null,
  p_coupon_channel text default 'both',
  p_coupon_ends_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_coupon_id uuid;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not exists(select 1 from public.market_profiles where id=auth.uid() and role='admin') then
    raise exception 'admin only';
  end if;
  if p_reward_active and nullif(trim(coalesce(p_reward_title,'')),'') is null then
    raise exception 'กรุณาระบุชื่อรางวัลก่อนเปิดใช้งาน';
  end if;
  if p_coupon_active then
    if p_coupon_shop_id is null then raise exception 'กรุณาเลือกร้านสำหรับคูปอง'; end if;
    if coalesce(p_coupon_discount_value,0)<=0 then raise exception 'ส่วนลดต้องมากกว่า 0'; end if;
    if p_coupon_discount_type not in ('fixed','percent') then raise exception 'รูปแบบส่วนลดไม่ถูกต้อง'; end if;
    if p_coupon_discount_type='percent' and p_coupon_discount_value>100 then raise exception 'ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100'; end if;
    if p_coupon_channel not in ('both','delivery','pickup') then raise exception 'ช่องทางคูปองไม่ถูกต้อง'; end if;
  end if;

  -- settings หลัก
  insert into public.market_mission_settings(
    mission_key,mission_active,reward_title,reward_detail,claim_note,reward_active,
    reward_claim_until,updated_at,updated_by
  ) values (
    'mission_v1',coalesce(p_mission_active,true),
    left(trim(coalesce(p_reward_title,'')),120),
    left(trim(coalesce(p_reward_detail,'')),500),
    left(trim(coalesce(p_claim_note,'')),500),
    coalesce(p_reward_active,false),p_reward_claim_until,now(),auth.uid()
  )
  on conflict(mission_key) do update set
    mission_active=excluded.mission_active,
    reward_title=excluded.reward_title,
    reward_detail=excluded.reward_detail,
    claim_note=excluded.claim_note,
    reward_active=excluded.reward_active,
    reward_claim_until=excluded.reward_claim_until,
    updated_at=now(),
    updated_by=auth.uid();

  -- ระบบคูปองรุ่นใหม่: ถ้ามี market_coupons ให้คงวิธีจัดการเดิมผ่าน coupon_id
  if to_regclass('public.market_coupons') is not null and p_coupon_active then
    select coupon_id into v_coupon_id
    from public.market_mission_settings
    where mission_key='mission_v1';

    if v_coupon_id is not null then
      update public.market_coupons
         set active=true,
             shop_id=p_coupon_shop_id,
             discount_type=p_coupon_discount_type,
             discount_value=greatest(coalesce(p_coupon_discount_value,0),0),
             min_spend=greatest(coalesce(p_coupon_min_spend,0),0),
             max_discount=case when p_coupon_max_discount is null then null else greatest(p_coupon_max_discount,0) end,
             channel=coalesce(p_coupon_channel,'both'),
             ends_at=p_coupon_ends_at
       where id=v_coupon_id;
    end if;
  elsif to_regclass('public.market_coupons') is not null then
    select coupon_id into v_coupon_id
    from public.market_mission_settings
    where mission_key='mission_v1';
    if v_coupon_id is not null then
      update public.market_coupons set active=false where id=v_coupon_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'mission_active',coalesce(p_mission_active,true),
    'reward_claim_until',p_reward_claim_until
  );
end $$;

revoke all on function public.market_admin_set_mission_reward(boolean,text,text,text,boolean,timestamptz,boolean,uuid,text,numeric,numeric,numeric,text,timestamptz) from public;
grant execute on function public.market_admin_set_mission_reward(boolean,text,text,text,boolean,timestamptz,boolean,uuid,text,numeric,numeric,numeric,text,timestamptz) to authenticated;


create or replace function public.market_mission_v1_is_complete(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(distinct v.shop_id)
       from public.market_mission_shop_views v
      where v.user_id = p_user) >= 5
    and
    (select count(distinct f.shop_id)
       from public.market_favorites f
      where f.user_id = p_user) >= 3
    and
    (select count(*)
       from public.market_reviews r
      where r.user_id = p_user
        and r.status = 'approved') >= 1
    and
    exists (
      select 1
      from public.market_orders o
      join public.market_delivery_groups g on g.id = o.group_id
      where o.customer_id = p_user
        and coalesce(o.status::text, '') <> 'cancelled'
        and coalesce(o.refund_status::text, '') <> 'completed'
        and (
          (g.fulfillment_method = 'pickup' and o.pickup_completed_at is not null)
          or
          (g.fulfillment_method = 'delivery' and exists (
            select 1
            from public.market_delivery_batch_orders bo
            join public.market_delivery_batches b on b.id = bo.batch_id
            where bo.order_id = o.id
              and b.status = 'completed'
          ))
        )
    );
$$;

revoke all on function public.market_mission_v1_is_complete(uuid) from public;

-- RPC ที่หน้า Mission ใช้สำหรับจำนวนออเดอร์สำเร็จ
create or replace function public.market_mission_completed_order_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct o.id)::bigint
  from public.market_orders o
  join public.market_delivery_groups g on g.id = o.group_id
  where o.customer_id = auth.uid()
    and coalesce(o.status::text, '') <> 'cancelled'
    and coalesce(o.refund_status::text, '') <> 'completed'
    and (
      (g.fulfillment_method = 'pickup' and o.pickup_completed_at is not null)
      or
      (g.fulfillment_method = 'delivery' and exists (
        select 1
        from public.market_delivery_batch_orders bo
        join public.market_delivery_batches b on b.id = bo.batch_id
        where bo.order_id = o.id
          and b.status = 'completed'
      ))
    );
$$;

revoke all on function public.market_mission_completed_order_count() from public;
grant execute on function public.market_mission_completed_order_count() to authenticated;

-- ถอน claim คูปอง Mission ที่เกิดจากเงื่อนไขเก่าผิด เฉพาะกรณี "ยังไม่เคยใช้"
-- ใช้ dynamic SQL เพื่อให้ repair นี้ไม่ล้ม ถ้าฐานใดยังไม่มีระบบ coupon wallet
do $$
declare
  mission_coupon_id uuid;
begin
  if to_regclass('public.market_coupons') is not null
     and to_regclass('public.market_coupon_claims') is not null
     and to_regclass('public.market_coupon_redemptions') is not null then

    select c.id
      into mission_coupon_id
      from public.market_coupons c
     where c.source = 'mission'
       and c.mission_key = 'mission_v1'
     order by c.created_at desc nulls last
     limit 1;

    if mission_coupon_id is not null then
      delete from public.market_coupon_claims cl
       where cl.coupon_id = mission_coupon_id
         and not public.market_mission_v1_is_complete(cl.user_id)
         and not exists (
           select 1
             from public.market_coupon_redemptions r
            where r.coupon_id = cl.coupon_id
              and r.user_id = cl.user_id
         );
    end if;
  end if;
end $$;

-- ให้การ sync ในอนาคต "recalculate" ก่อนเสมอ:
-- ถ้าไม่ครบแล้ว ให้ถอน claim ที่ยังไม่ใช้ของผู้ใช้คนนั้น
create or replace function public.market_sync_mission_coupon_claim()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.market_coupons%rowtype;
  completed boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('claimed', false);
  end if;

  if exists (
    select 1 from public.market_mission_settings ms
    where ms.mission_key='mission_v1'
      and ms.reward_claim_until is not null
      and ms.reward_claim_until <= now()
  ) then
    return jsonb_build_object('claimed', false, 'expired', true);
  end if;

  select *
    into c
    from public.market_coupons
   where source = 'mission'
     and mission_key = 'mission_v1'
     and active = true
   order by created_at desc nulls last
   limit 1;

  if not found then
    return jsonb_build_object('claimed', false);
  end if;

  completed := public.market_mission_v1_is_complete(auth.uid());

  if not completed then
    delete from public.market_coupon_claims cl
     where cl.coupon_id = c.id
       and cl.user_id = auth.uid()
       and not exists (
         select 1
           from public.market_coupon_redemptions r
          where r.coupon_id = c.id
            and r.user_id = auth.uid()
       );

    return jsonb_build_object('claimed', false, 'recalculated', true);
  end if;

  if c.ends_at is not null and c.ends_at <= now() then
    return jsonb_build_object('claimed', false);
  end if;

  insert into public.market_coupon_claims(coupon_id, user_id)
  values(c.id, auth.uid())
  on conflict(coupon_id, user_id) do nothing;

  return jsonb_build_object('claimed', true, 'coupon_id', c.id, 'recalculated', true);
end $$;

grant execute on function public.market_sync_mission_coupon_claim() to authenticated;

notify pgrst, 'reload schema';

select 'v0.5.22.20 mission recalculation ready' as result;
