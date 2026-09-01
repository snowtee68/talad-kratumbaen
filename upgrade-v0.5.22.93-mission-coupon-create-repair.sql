-- V0.5.22.93 Mission coupon create/update repair
-- Safe after v0.5.22.20. Keeps existing claims/redemptions and creates the
-- Mission coupon when Admin enables one for the first time.

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

  select ms.coupon_id into v_coupon_id
  from public.market_mission_settings ms
  where ms.mission_key='mission_v1';

  if v_coupon_id is null then
    select c.id into v_coupon_id
    from public.market_coupons c
    where c.source='mission' and c.mission_key='mission_v1'
    order by c.created_at desc nulls last
    limit 1;
  end if;

  if p_coupon_active then
    if v_coupon_id is null then
      insert into public.market_coupons(
        shop_id,source,mission_key,title,description,discount_type,
        discount_value,min_spend,max_discount,channel,ends_at,active,created_by
      ) values (
        p_coupon_shop_id,'mission','mission_v1',
        coalesce(nullif(trim(p_reward_title),''),'คูปอง Mission'),
        left(trim(coalesce(p_reward_detail,'')),500),p_coupon_discount_type,
        greatest(coalesce(p_coupon_discount_value,0),0),
        greatest(coalesce(p_coupon_min_spend,0),0),
        case when p_coupon_max_discount is null then null else greatest(p_coupon_max_discount,0) end,
        p_coupon_channel,p_coupon_ends_at,true,auth.uid()
      ) returning id into v_coupon_id;
    else
      update public.market_coupons
      set shop_id=p_coupon_shop_id,
          title=coalesce(nullif(trim(p_reward_title),''),'คูปอง Mission'),
          description=left(trim(coalesce(p_reward_detail,'')),500),
          discount_type=p_coupon_discount_type,
          discount_value=greatest(coalesce(p_coupon_discount_value,0),0),
          min_spend=greatest(coalesce(p_coupon_min_spend,0),0),
          max_discount=case when p_coupon_max_discount is null then null else greatest(p_coupon_max_discount,0) end,
          channel=p_coupon_channel,ends_at=p_coupon_ends_at,active=true,updated_at=now()
      where id=v_coupon_id;
    end if;
  elsif v_coupon_id is not null then
    update public.market_coupons set active=false,updated_at=now() where id=v_coupon_id;
  end if;

  insert into public.market_mission_settings(
    mission_key,mission_active,reward_title,reward_detail,claim_note,reward_active,
    reward_claim_until,coupon_id,updated_at,updated_by
  ) values (
    'mission_v1',coalesce(p_mission_active,true),
    left(trim(coalesce(p_reward_title,'')),120),
    left(trim(coalesce(p_reward_detail,'')),500),
    left(trim(coalesce(p_claim_note,'')),500),coalesce(p_reward_active,false),
    p_reward_claim_until,v_coupon_id,now(),auth.uid()
  )
  on conflict(mission_key) do update set
    mission_active=excluded.mission_active,reward_title=excluded.reward_title,
    reward_detail=excluded.reward_detail,claim_note=excluded.claim_note,
    reward_active=excluded.reward_active,reward_claim_until=excluded.reward_claim_until,
    coupon_id=excluded.coupon_id,updated_at=now(),updated_by=auth.uid();

  return jsonb_build_object('ok',true,'coupon_id',v_coupon_id);
end $$;

revoke all on function public.market_admin_set_mission_reward(boolean,text,text,text,boolean,timestamptz,boolean,uuid,text,numeric,numeric,numeric,text,timestamptz) from public;
grant execute on function public.market_admin_set_mission_reward(boolean,text,text,text,boolean,timestamptz,boolean,uuid,text,numeric,numeric,numeric,text,timestamptz) to authenticated;

-- Mission ที่ปิดอยู่ต้องไม่แจก claim ใหม่ แต่ไม่ปิดตัวคูปอง เพื่อให้ผู้ที่ได้
-- รางวัลไปแล้วก่อนปิด Mission ยังใช้สิทธิ์เดิมได้ตามวันหมดอายุ
create or replace function public.market_sync_mission_coupon_claim()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  c public.market_coupons%rowtype;
  completed boolean;
begin
  if auth.uid() is null then return jsonb_build_object('claimed',false); end if;

  if not exists (
    select 1 from public.market_mission_settings ms
    where ms.mission_key='mission_v1'
      and ms.mission_active=true
      and (ms.reward_claim_until is null or ms.reward_claim_until>now())
  ) then
    return jsonb_build_object('claimed',false,'mission_unavailable',true);
  end if;

  select * into c
  from public.market_coupons
  where source='mission' and mission_key='mission_v1' and active=true
  order by created_at desc nulls last
  limit 1;

  if not found or (c.ends_at is not null and c.ends_at<=now()) then
    return jsonb_build_object('claimed',false);
  end if;

  completed:=public.market_mission_v1_is_complete(auth.uid());
  if not completed then
    delete from public.market_coupon_claims cl
    where cl.coupon_id=c.id and cl.user_id=auth.uid()
      and not exists (
        select 1 from public.market_coupon_redemptions r
        where r.coupon_id=c.id and r.user_id=auth.uid()
      );
    return jsonb_build_object('claimed',false,'recalculated',true);
  end if;

  insert into public.market_coupon_claims(coupon_id,user_id)
  values(c.id,auth.uid())
  on conflict(coupon_id,user_id) do nothing;

  return jsonb_build_object('claimed',true,'coupon_id',c.id,'recalculated',true);
end $$;

revoke all on function public.market_sync_mission_coupon_claim() from public;
grant execute on function public.market_sync_mission_coupon_claim() to authenticated;

notify pgrst, 'reload schema';
select 'v0.5.22.93 mission coupon create repair ready' as result;
