-- Talad Krathumbaen v0.5.22.2 SAFE COUPONS
-- Adds coupons without replacing the existing checkout/order flow.

create table if not exists public.market_coupons(
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.market_shops(id) on delete cascade,
  source text not null default 'shop',
  mission_key text,
  title text not null,
  description text,
  discount_type text not null default 'fixed',
  discount_value numeric(12,2) not null default 0,
  min_spend numeric(12,2) not null default 0,
  max_discount numeric(12,2),
  channel text not null default 'both',
  starts_at timestamptz,
  ends_at timestamptz,
  total_limit integer,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_coupons_source_chk check(source in ('shop','mission')),
  constraint market_coupons_discount_type_chk check(discount_type in ('fixed','percent')),
  constraint market_coupons_channel_chk check(channel in ('both','delivery','pickup')),
  constraint market_coupons_discount_value_chk check(discount_value>0),
  constraint market_coupons_percent_chk check(discount_type<>'percent' or discount_value<=100),
  constraint market_coupons_limit_chk check(total_limit is null or total_limit>0)
);

create unique index if not exists market_coupons_mission_unique
  on public.market_coupons(mission_key)
  where source='mission' and mission_key is not null;
create index if not exists market_coupons_shop_idx on public.market_coupons(shop_id,active);

create table if not exists public.market_coupon_redemptions(
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.market_coupons(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.market_orders(id) on delete set null,
  discount_amount numeric(12,2) not null default 0,
  redeemed_at timestamptz not null default now(),
  unique(coupon_id,user_id)
);
create index if not exists market_coupon_redemptions_coupon_idx on public.market_coupon_redemptions(coupon_id);

alter table public.market_coupon_redemptions enable row level security;
drop policy if exists "coupon users read own redemption" on public.market_coupon_redemptions;
create policy "coupon users read own redemption" on public.market_coupon_redemptions
  for select to authenticated using(user_id=auth.uid());
grant select on public.market_coupon_redemptions to authenticated;
revoke insert,update,delete on public.market_coupon_redemptions from anon,authenticated;

alter table public.market_mission_settings add column if not exists coupon_id uuid references public.market_coupons(id) on delete set null;
alter table public.market_orders
  add column if not exists original_subtotal numeric(12,2),
  add column if not exists coupon_discount numeric(12,2) not null default 0,
  add column if not exists coupon_id uuid references public.market_coupons(id) on delete set null;

-- Same real-fulfillment definition used by Mission V0.5.21.8.
create or replace function public.market_mission_v1_is_complete(p_user uuid)
returns boolean language sql security definer set search_path=public stable as $$
  select
    (select count(distinct shop_id) from public.market_mission_shop_views where user_id=p_user)>=5
    and (select count(distinct shop_id) from public.market_favorites where user_id=p_user)>=3
    and (select count(*) from public.market_reviews where user_id=p_user and status='approved')>=1
    and exists(
      select 1 from public.market_orders o
      join public.market_delivery_groups g on g.id=o.group_id
      where o.customer_id=p_user and o.status<>'cancelled' and coalesce(o.refund_status,'')<>'completed'
        and ((g.fulfillment_method='pickup' and o.pickup_completed_at is not null)
          or (g.fulfillment_method='delivery' and exists(
            select 1 from public.market_delivery_batch_orders bo
            join public.market_delivery_batches b on b.id=bo.batch_id
            where bo.order_id=o.id and b.status='completed' and b.completed_at is not null
          )))
    );
$$;
revoke all on function public.market_mission_v1_is_complete(uuid) from public;

-- Read one coupon through a controlled RPC (used by Admin Mission UI).
create or replace function public.market_coupon_get(p_coupon_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.market_coupons%rowtype;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select * into c from public.market_coupons where id=p_coupon_id;
  if not found then return null; end if;
  if c.source='mission' then
    if not exists(select 1 from public.market_profiles where id=auth.uid() and role='admin') then return null; end if;
  else
    if not exists(select 1 from public.market_shops s where s.id=c.shop_id and (s.owner_id=auth.uid() or exists(select 1 from public.market_profiles p where p.id=auth.uid() and p.role='admin'))) then return null; end if;
  end if;
  return to_jsonb(c);
end $$;
grant execute on function public.market_coupon_get(uuid) to authenticated;

create or replace function public.market_shop_coupon_list(p_shop_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not exists(select 1 from public.market_shops s where s.id=p_shop_id and (s.owner_id=auth.uid() or exists(select 1 from public.market_profiles p where p.id=auth.uid() and p.role='admin'))) then raise exception 'ไม่มีสิทธิ์จัดการคูปองร้านนี้'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select c.*, (select count(*) from public.market_coupon_redemptions r where r.coupon_id=c.id) as redeemed_count
    from public.market_coupons c where c.shop_id=p_shop_id and c.source='shop'
  ) x),'[]'::jsonb);
end $$;
grant execute on function public.market_shop_coupon_list(uuid) to authenticated;

create or replace function public.market_shop_coupon_upsert(
  p_coupon_id uuid,
  p_shop_id uuid,
  p_title text,
  p_description text,
  p_discount_type text,
  p_discount_value numeric,
  p_min_spend numeric,
  p_max_discount numeric,
  p_channel text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_total_limit integer,
  p_active boolean
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not exists(select 1 from public.market_shops s where s.id=p_shop_id and (s.owner_id=auth.uid() or exists(select 1 from public.market_profiles p where p.id=auth.uid() and p.role='admin'))) then raise exception 'ไม่มีสิทธิ์จัดการคูปองร้านนี้'; end if;
  if nullif(trim(coalesce(p_title,'')),'') is null then raise exception 'กรุณาระบุชื่อคูปอง'; end if;
  if coalesce(p_discount_value,0)<=0 then raise exception 'ส่วนลดต้องมากกว่า 0'; end if;
  if p_discount_type not in ('fixed','percent') then raise exception 'ประเภทส่วนลดไม่ถูกต้อง'; end if;
  if p_discount_type='percent' and p_discount_value>100 then raise exception 'เปอร์เซ็นต์ต้องไม่เกิน 100'; end if;
  if p_channel not in ('both','delivery','pickup') then raise exception 'ช่องทางไม่ถูกต้อง'; end if;
  if p_total_limit is not null and p_total_limit<1 then raise exception 'จำนวนสิทธิ์ต้องมากกว่า 0'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at<=p_starts_at then raise exception 'วันหมดอายุต้องอยู่หลังวันเริ่ม'; end if;

  if p_coupon_id is null then
    insert into public.market_coupons(shop_id,source,title,description,discount_type,discount_value,min_spend,max_discount,channel,starts_at,ends_at,total_limit,active,created_by)
    values(p_shop_id,'shop',left(trim(p_title),120),left(trim(coalesce(p_description,'')),500),p_discount_type,p_discount_value,greatest(coalesce(p_min_spend,0),0),case when p_max_discount is null then null else greatest(p_max_discount,0) end,p_channel,p_starts_at,p_ends_at,p_total_limit,coalesce(p_active,true),auth.uid())
    returning id into v_id;
  else
    update public.market_coupons set title=left(trim(p_title),120),description=left(trim(coalesce(p_description,'')),500),discount_type=p_discount_type,discount_value=p_discount_value,min_spend=greatest(coalesce(p_min_spend,0),0),max_discount=case when p_max_discount is null then null else greatest(p_max_discount,0) end,channel=p_channel,starts_at=p_starts_at,ends_at=p_ends_at,total_limit=p_total_limit,active=coalesce(p_active,true),updated_at=now()
    where id=p_coupon_id and shop_id=p_shop_id and source='shop' returning id into v_id;
    if v_id is null then raise exception 'ไม่พบคูปองหรือไม่มีสิทธิ์แก้ไข'; end if;
  end if;
  return v_id;
end $$;
grant execute on function public.market_shop_coupon_upsert(uuid,uuid,text,text,text,numeric,numeric,numeric,text,timestamptz,timestamptz,integer,boolean) to authenticated;

create or replace function public.market_shop_coupon_delete(p_coupon_id uuid,p_shop_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not exists(select 1 from public.market_shops s where s.id=p_shop_id and (s.owner_id=auth.uid() or exists(select 1 from public.market_profiles p where p.id=auth.uid() and p.role='admin'))) then raise exception 'ไม่มีสิทธิ์จัดการคูปองร้านนี้'; end if;
  if exists(select 1 from public.market_coupon_redemptions where coupon_id=p_coupon_id) then
    update public.market_coupons set active=false,updated_at=now() where id=p_coupon_id and shop_id=p_shop_id and source='shop';
    get diagnostics n=row_count;
  else
    delete from public.market_coupons where id=p_coupon_id and shop_id=p_shop_id and source='shop';
    get diagnostics n=row_count;
  end if;
  return n>0;
end $$;
grant execute on function public.market_shop_coupon_delete(uuid,uuid) to authenticated;

-- Extend the existing Mission setter without changing Mission progress logic.
drop function if exists public.market_admin_set_mission_reward(boolean,text,text,text,boolean);
drop function if exists public.market_admin_set_mission_reward(boolean,text,text,text,boolean,boolean,uuid,text,numeric,numeric,numeric,text,timestamptz);
create or replace function public.market_admin_set_mission_reward(
  p_mission_active boolean default true,
  p_reward_title text default '',
  p_reward_detail text default '',
  p_claim_note text default '',
  p_reward_active boolean default false,
  p_coupon_active boolean default false,
  p_coupon_shop_id uuid default null,
  p_coupon_discount_type text default 'fixed',
  p_coupon_discount_value numeric default 0,
  p_coupon_min_spend numeric default 0,
  p_coupon_max_discount numeric default null,
  p_coupon_channel text default 'both',
  p_coupon_ends_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_coupon_id uuid;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not exists(select 1 from public.market_profiles where id=auth.uid() and role='admin') then raise exception 'admin only'; end if;
  if p_reward_active and nullif(trim(coalesce(p_reward_title,'')),'') is null then raise exception 'กรุณาระบุชื่อรางวัลก่อนเปิดใช้งาน'; end if;
  if p_coupon_active then
    if p_coupon_shop_id is null then raise exception 'กรุณาเลือกร้านสำหรับคูปอง'; end if;
    if coalesce(p_coupon_discount_value,0)<=0 then raise exception 'ส่วนลดต้องมากกว่า 0'; end if;
    if p_coupon_discount_type not in ('fixed','percent') then raise exception 'ประเภทส่วนลดไม่ถูกต้อง'; end if;
    if p_coupon_discount_type='percent' and p_coupon_discount_value>100 then raise exception 'เปอร์เซ็นต์ต้องไม่เกิน 100'; end if;
    if p_coupon_channel not in ('both','delivery','pickup') then raise exception 'ช่องทางไม่ถูกต้อง'; end if;
  end if;

  select id into v_coupon_id from public.market_coupons where source='mission' and mission_key='mission_v1';
  if p_coupon_active then
    if v_coupon_id is null then
      insert into public.market_coupons(shop_id,source,mission_key,title,description,discount_type,discount_value,min_spend,max_discount,channel,ends_at,active,created_by)
      values(p_coupon_shop_id,'mission','mission_v1',coalesce(nullif(trim(p_reward_title),''),'คูปอง Mission'),left(trim(coalesce(p_reward_detail,'')),500),p_coupon_discount_type,p_coupon_discount_value,greatest(coalesce(p_coupon_min_spend,0),0),case when p_coupon_max_discount is null then null else greatest(p_coupon_max_discount,0) end,p_coupon_channel,p_coupon_ends_at,true,auth.uid())
      returning id into v_coupon_id;
    else
      update public.market_coupons set shop_id=p_coupon_shop_id,title=coalesce(nullif(trim(p_reward_title),''),'คูปอง Mission'),description=left(trim(coalesce(p_reward_detail,'')),500),discount_type=p_coupon_discount_type,discount_value=p_coupon_discount_value,min_spend=greatest(coalesce(p_coupon_min_spend,0),0),max_discount=case when p_coupon_max_discount is null then null else greatest(p_coupon_max_discount,0) end,channel=p_coupon_channel,ends_at=p_coupon_ends_at,active=true,updated_at=now() where id=v_coupon_id;
    end if;
  elsif v_coupon_id is not null then
    update public.market_coupons set active=false,updated_at=now() where id=v_coupon_id;
  end if;

  insert into public.market_mission_settings(mission_key,mission_active,reward_title,reward_detail,claim_note,reward_active,coupon_id,updated_at,updated_by)
  values('mission_v1',coalesce(p_mission_active,true),left(trim(coalesce(p_reward_title,'')),120),left(trim(coalesce(p_reward_detail,'')),500),left(trim(coalesce(p_claim_note,'')),500),coalesce(p_reward_active,false),v_coupon_id,now(),auth.uid())
  on conflict(mission_key) do update set mission_active=excluded.mission_active,reward_title=excluded.reward_title,reward_detail=excluded.reward_detail,claim_note=excluded.claim_note,reward_active=excluded.reward_active,coupon_id=excluded.coupon_id,updated_at=now(),updated_by=auth.uid();
  return jsonb_build_object('ok',true,'coupon_id',v_coupon_id);
end $$;
grant execute on function public.market_admin_set_mission_reward(boolean,text,text,text,boolean,boolean,uuid,text,numeric,numeric,numeric,text,timestamptz) to authenticated;

-- Coupons available to this customer for current checkout.
create or replace function public.market_coupon_options(p_fulfillment_method text,p_shop_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if p_fulfillment_method not in ('delivery','pickup') then raise exception 'ช่องทางไม่ถูกต้อง'; end if;
  return coalesce((select jsonb_agg(to_jsonb(q) order by q.source desc,q.created_at desc) from (
    select c.id,c.shop_id,c.source,c.title,c.description,c.discount_type,c.discount_value,c.min_spend,c.max_discount,c.channel,c.ends_at,c.created_at,
      case when c.discount_type='percent' then 'ลด '||trim(to_char(c.discount_value,'FM999990.##'))||'%'||case when coalesce(c.max_discount,0)>0 then ' สูงสุด '||trim(to_char(c.max_discount,'FM999990.##'))||' บาท' else '' end else 'ลด '||trim(to_char(c.discount_value,'FM999990.##'))||' บาท' end as discount_label
    from public.market_coupons c
    where c.active=true and c.shop_id=any(p_shop_ids)
      and (c.channel='both' or c.channel=p_fulfillment_method)
      and (c.starts_at is null or c.starts_at<=now()) and (c.ends_at is null or c.ends_at>now())
      and not exists(select 1 from public.market_coupon_redemptions r where r.coupon_id=c.id and r.user_id=auth.uid())
      and (c.total_limit is null or (select count(*) from public.market_coupon_redemptions r2 where r2.coupon_id=c.id)<c.total_limit)
      and (c.source='shop' or (c.source='mission' and c.mission_key='mission_v1' and public.market_mission_v1_is_complete(auth.uid())))
  ) q),'[]'::jsonb);
end $$;
grant execute on function public.market_coupon_options(text,uuid[]) to authenticated;

-- Apply coupons after the existing checkout RPC creates the order group.
-- This does not replace or alter market_create_checkout_v041.
create or replace function public.market_apply_coupons_to_group(p_group_id uuid,p_coupon_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  g public.market_delivery_groups%rowtype;
  cid uuid; c public.market_coupons%rowtype; o public.market_orders%rowtype;
  d numeric(12,2); v_total numeric(12,2):=0; seen_shops uuid[]:=array[]::uuid[];
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select * into g from public.market_delivery_groups where id=p_group_id and customer_id=auth.uid() for update;
  if not found then raise exception 'ไม่พบชุดคำสั่งซื้อ'; end if;
  if coalesce(array_length(p_coupon_ids,1),0)=0 then return jsonb_build_object('discount_total',0); end if;

  foreach cid in array p_coupon_ids loop
    select * into c from public.market_coupons where id=cid for update;
    if not found or not c.active then raise exception 'คูปองไม่พร้อมใช้งาน'; end if;
    if c.shop_id=any(seen_shops) then raise exception 'ใช้ได้สูงสุด 1 คูปองต่อร้าน'; end if;
    seen_shops:=array_append(seen_shops,c.shop_id);
    if c.channel<>'both' and c.channel<>g.fulfillment_method then raise exception 'คูปองใช้กับช่องทางนี้ไม่ได้'; end if;
    if c.starts_at is not null and c.starts_at>now() then raise exception 'คูปองยังไม่เริ่ม'; end if;
    if c.ends_at is not null and c.ends_at<=now() then raise exception 'คูปองหมดอายุ'; end if;
    if exists(select 1 from public.market_coupon_redemptions where coupon_id=c.id and user_id=auth.uid()) then raise exception 'คูปองนี้ถูกใช้แล้ว'; end if;
    if c.total_limit is not null and (select count(*) from public.market_coupon_redemptions where coupon_id=c.id)>=c.total_limit then raise exception 'คูปองครบจำนวนสิทธิ์แล้ว'; end if;
    if c.source='mission' and (c.mission_key<>'mission_v1' or not public.market_mission_v1_is_complete(auth.uid())) then raise exception 'Mission ยังไม่สำเร็จครบ'; end if;

    select * into o from public.market_orders where group_id=p_group_id and customer_id=auth.uid() and shop_id=c.shop_id and status<>'cancelled' for update;
    if not found then raise exception 'ไม่พบออเดอร์ของร้านที่ใช้คูปอง'; end if;
    if o.coupon_id is not null then raise exception 'ออเดอร์ร้านนี้มีคูปองแล้ว'; end if;
    if o.subtotal<coalesce(c.min_spend,0) then raise exception 'ยอดซื้อไม่ถึงขั้นต่ำของคูปอง'; end if;

    d:=case when c.discount_type='percent' then round(o.subtotal*c.discount_value/100,2) else c.discount_value end;
    if coalesce(c.max_discount,0)>0 then d:=least(d,c.max_discount); end if;
    d:=greatest(0,least(d,o.subtotal));
    update public.market_orders set original_subtotal=coalesce(original_subtotal,subtotal),coupon_discount=d,coupon_id=c.id,subtotal=subtotal-d where id=o.id;
    insert into public.market_coupon_redemptions(coupon_id,user_id,order_id,discount_amount) values(c.id,auth.uid(),o.id,d);
    v_total:=v_total+d;
  end loop;
  return jsonb_build_object('discount_total',v_total);
end $$;
grant execute on function public.market_apply_coupons_to_group(uuid,uuid[]) to authenticated;

select 'v0.5.22.2 safe coupons ready' as result;

-- v0.5.22.3 Coupon Wallet / claim layer
create table if not exists public.market_coupon_claims(
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.market_coupons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  unique(coupon_id,user_id)
);
create index if not exists market_coupon_claims_user_idx on public.market_coupon_claims(user_id,claimed_at desc);
alter table public.market_coupon_claims enable row level security;
drop policy if exists "coupon users read own claims" on public.market_coupon_claims;
create policy "coupon users read own claims" on public.market_coupon_claims for select to authenticated using(user_id=auth.uid());
grant select on public.market_coupon_claims to authenticated;
revoke insert,update,delete on public.market_coupon_claims from anon,authenticated;

create or replace function public.market_public_shop_coupons(p_shop_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  return coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (
    select c.id,c.shop_id,c.title,c.description,c.discount_type,c.discount_value,c.min_spend,c.max_discount,c.channel,c.starts_at,c.ends_at,c.total_limit,c.created_at,
      (select count(*) from public.market_coupon_claims cl where cl.coupon_id=c.id) as claimed_count,
      case when auth.uid() is null then false else exists(select 1 from public.market_coupon_claims cl where cl.coupon_id=c.id and cl.user_id=auth.uid()) end as claimed,
      case when c.discount_type='percent' then 'ลด '||trim(to_char(c.discount_value,'FM999990.##'))||'%'||case when coalesce(c.max_discount,0)>0 then ' สูงสุด '||trim(to_char(c.max_discount,'FM999990.##'))||' บาท' else '' end else 'ลด '||trim(to_char(c.discount_value,'FM999990.##'))||' บาท' end as discount_label
    from public.market_coupons c
    where c.shop_id=p_shop_id and c.source='shop' and c.active=true
      and (c.starts_at is null or c.starts_at<=now()) and (c.ends_at is null or c.ends_at>now())
      and (c.total_limit is null or (select count(*) from public.market_coupon_claims cl2 where cl2.coupon_id=c.id)<c.total_limit or exists(select 1 from public.market_coupon_claims cl3 where cl3.coupon_id=c.id and cl3.user_id=auth.uid()))
  ) q),'[]'::jsonb);
end $$;
grant execute on function public.market_public_shop_coupons(uuid) to anon,authenticated;

create or replace function public.market_claim_coupon(p_coupon_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.market_coupons%rowtype;
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบก่อนเก็บคูปอง'; end if;
  select * into c from public.market_coupons where id=p_coupon_id for update;
  if not found or not c.active or c.source<>'shop' then raise exception 'คูปองนี้ไม่พร้อมให้เก็บ'; end if;
  if c.starts_at is not null and c.starts_at>now() then raise exception 'คูปองยังไม่เริ่ม'; end if;
  if c.ends_at is not null and c.ends_at<=now() then raise exception 'คูปองหมดอายุ'; end if;
  if exists(select 1 from public.market_coupon_claims where coupon_id=c.id and user_id=auth.uid()) then return jsonb_build_object('claimed',true,'already',true); end if;
  if c.total_limit is not null and (select count(*) from public.market_coupon_claims where coupon_id=c.id)>=c.total_limit then raise exception 'คูปองถูกเก็บครบจำนวนสิทธิ์แล้ว'; end if;
  insert into public.market_coupon_claims(coupon_id,user_id) values(c.id,auth.uid());
  return jsonb_build_object('claimed',true,'already',false);
end $$;
grant execute on function public.market_claim_coupon(uuid) to authenticated;

create or replace function public.market_sync_mission_coupon_claim()
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.market_coupons%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('claimed',false); end if;
  select * into c from public.market_coupons where source='mission' and mission_key='mission_v1' and active=true limit 1;
  if not found or not public.market_mission_v1_is_complete(auth.uid()) then return jsonb_build_object('claimed',false); end if;
  if c.ends_at is not null and c.ends_at<=now() then return jsonb_build_object('claimed',false); end if;
  insert into public.market_coupon_claims(coupon_id,user_id) values(c.id,auth.uid()) on conflict(coupon_id,user_id) do nothing;
  return jsonb_build_object('claimed',true,'coupon_id',c.id);
end $$;
grant execute on function public.market_sync_mission_coupon_claim() to authenticated;

create or replace function public.market_my_coupon_wallet()
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  perform public.market_sync_mission_coupon_claim();
  return coalesce((select jsonb_agg(to_jsonb(q) order by q.claimed_at desc) from (
    select c.id,c.shop_id,c.source,c.title,c.description,c.discount_type,c.discount_value,c.min_spend,c.max_discount,c.channel,c.starts_at,c.ends_at,c.total_limit,cl.claimed_at,
      s.name as shop_name,r.used_at,r.discount_amount,
      case when r.id is not null then 'used' when c.ends_at is not null and c.ends_at<=now() then 'expired' when not c.active then 'expired' else 'available' end as wallet_status,
      case when c.discount_type='percent' then 'ลด '||trim(to_char(c.discount_value,'FM999990.##'))||'%'||case when coalesce(c.max_discount,0)>0 then ' สูงสุด '||trim(to_char(c.max_discount,'FM999990.##'))||' บาท' else '' end else 'ลด '||trim(to_char(c.discount_value,'FM999990.##'))||' บาท' end as discount_label
    from public.market_coupon_claims cl join public.market_coupons c on c.id=cl.coupon_id
    left join public.market_shops s on s.id=c.shop_id
    left join public.market_coupon_redemptions r on r.coupon_id=c.id and r.user_id=auth.uid()
    where cl.user_id=auth.uid()
  ) q),'[]'::jsonb);
end $$;
grant execute on function public.market_my_coupon_wallet() to authenticated;

-- Checkout now exposes only coupons already in the user's wallet.
create or replace function public.market_coupon_options(p_fulfillment_method text,p_shop_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if p_fulfillment_method not in ('delivery','pickup') then raise exception 'ช่องทางไม่ถูกต้อง'; end if;
  perform public.market_sync_mission_coupon_claim();
  return coalesce((select jsonb_agg(to_jsonb(q) order by q.source desc,q.claimed_at desc) from (
    select c.id,c.shop_id,c.source,c.title,c.description,c.discount_type,c.discount_value,c.min_spend,c.max_discount,c.channel,c.ends_at,cl.claimed_at,
      case when c.discount_type='percent' then 'ลด '||trim(to_char(c.discount_value,'FM999990.##'))||'%'||case when coalesce(c.max_discount,0)>0 then ' สูงสุด '||trim(to_char(c.max_discount,'FM999990.##'))||' บาท' else '' end else 'ลด '||trim(to_char(c.discount_value,'FM999990.##'))||' บาท' end as discount_label
    from public.market_coupon_claims cl join public.market_coupons c on c.id=cl.coupon_id
    where cl.user_id=auth.uid() and c.active=true and c.shop_id=any(p_shop_ids)
      and (c.channel='both' or c.channel=p_fulfillment_method)
      and (c.starts_at is null or c.starts_at<=now()) and (c.ends_at is null or c.ends_at>now())
      and not exists(select 1 from public.market_coupon_redemptions r where r.coupon_id=c.id and r.user_id=auth.uid())
  ) q),'[]'::jsonb);
end $$;
grant execute on function public.market_coupon_options(text,uuid[]) to authenticated;

select 'v0.5.22.3 coupon wallet ready' as result;


-- Harden redemption: a coupon must already be in the user's wallet.
create or replace function public.market_apply_coupons_to_group(p_group_id uuid,p_coupon_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  g public.market_delivery_groups%rowtype;
  cid uuid; c public.market_coupons%rowtype; o public.market_orders%rowtype;
  d numeric(12,2); v_total numeric(12,2):=0; seen_shops uuid[]:=array[]::uuid[];
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select * into g from public.market_delivery_groups where id=p_group_id and customer_id=auth.uid() for update;
  if not found then raise exception 'ไม่พบชุดคำสั่งซื้อ'; end if;
  if coalesce(array_length(p_coupon_ids,1),0)=0 then return jsonb_build_object('discount_total',0); end if;
  foreach cid in array p_coupon_ids loop
    select * into c from public.market_coupons where id=cid for update;
    if not found or not c.active then raise exception 'คูปองไม่พร้อมใช้งาน'; end if;
    if not exists(select 1 from public.market_coupon_claims where coupon_id=c.id and user_id=auth.uid()) then raise exception 'กรุณาเก็บคูปองก่อนใช้งาน'; end if;
    if c.shop_id=any(seen_shops) then raise exception 'ใช้ได้สูงสุด 1 คูปองต่อร้าน'; end if;
    seen_shops:=array_append(seen_shops,c.shop_id);
    if c.channel<>'both' and c.channel<>g.fulfillment_method then raise exception 'คูปองใช้กับช่องทางนี้ไม่ได้'; end if;
    if c.starts_at is not null and c.starts_at>now() then raise exception 'คูปองยังไม่เริ่ม'; end if;
    if c.ends_at is not null and c.ends_at<=now() then raise exception 'คูปองหมดอายุ'; end if;
    if exists(select 1 from public.market_coupon_redemptions where coupon_id=c.id and user_id=auth.uid()) then raise exception 'คูปองนี้ถูกใช้แล้ว'; end if;
    select * into o from public.market_orders where group_id=p_group_id and customer_id=auth.uid() and shop_id=c.shop_id and status<>'cancelled' for update;
    if not found then raise exception 'ไม่พบออเดอร์ของร้านที่ใช้คูปอง'; end if;
    if o.coupon_id is not null then raise exception 'ออเดอร์ร้านนี้มีคูปองแล้ว'; end if;
    if o.subtotal<coalesce(c.min_spend,0) then raise exception 'ยอดซื้อไม่ถึงขั้นต่ำของคูปอง'; end if;
    d:=case when c.discount_type='percent' then round(o.subtotal*c.discount_value/100,2) else c.discount_value end;
    if coalesce(c.max_discount,0)>0 then d:=least(d,c.max_discount); end if;
    d:=greatest(0,least(d,o.subtotal));
    update public.market_orders set original_subtotal=coalesce(original_subtotal,subtotal),coupon_discount=d,coupon_id=c.id,subtotal=subtotal-d where id=o.id;
    insert into public.market_coupon_redemptions(coupon_id,user_id,order_id,discount_amount) values(c.id,auth.uid(),o.id,d);
    v_total:=v_total+d;
  end loop;
  return jsonb_build_object('discount_total',v_total);
end $$;
grant execute on function public.market_apply_coupons_to_group(uuid,uuid[]) to authenticated;
