-- Talad Krathumbaen v0.5.22.0
-- Mission coupon reward + checkout/Delivery coupon redemption

alter table public.market_mission_settings
  add column if not exists coupon_active boolean not null default false,
  add column if not exists coupon_shop_id uuid references public.market_shops(id) on delete set null,
  add column if not exists coupon_discount_type text not null default 'fixed',
  add column if not exists coupon_discount_value numeric(12,2) not null default 0,
  add column if not exists coupon_min_spend numeric(12,2) not null default 0,
  add column if not exists coupon_max_discount numeric(12,2),
  add column if not exists coupon_channel text not null default 'both',
  add column if not exists coupon_expires_at timestamptz;

do $$ begin
  alter table public.market_mission_settings add constraint market_mission_coupon_type_chk check(coupon_discount_type in ('fixed','percent'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.market_mission_settings add constraint market_mission_coupon_channel_chk check(coupon_channel in ('both','delivery','pickup'));
exception when duplicate_object then null; end $$;

create table if not exists public.market_mission_coupon_redemptions(
  id uuid primary key default gen_random_uuid(),
  mission_key text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.market_shops(id) on delete cascade,
  order_id uuid references public.market_orders(id) on delete set null,
  discount_amount numeric(12,2) not null default 0,
  redeemed_at timestamptz not null default now(),
  unique(mission_key,user_id)
);
alter table public.market_mission_coupon_redemptions enable row level security;
drop policy if exists "users read own mission coupon redemption" on public.market_mission_coupon_redemptions;
create policy "users read own mission coupon redemption" on public.market_mission_coupon_redemptions for select to authenticated using(user_id=auth.uid());
grant select on public.market_mission_coupon_redemptions to authenticated;
revoke insert,update,delete on public.market_mission_coupon_redemptions from anon,authenticated;

alter table public.market_orders
  add column if not exists original_subtotal numeric(12,2),
  add column if not exists coupon_discount numeric(12,2) not null default 0,
  add column if not exists mission_coupon_key text;

drop function if exists public.market_admin_set_mission_reward(boolean,text,text,text,boolean);
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
  p_coupon_expires_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not exists(select 1 from public.market_profiles where id=auth.uid() and role='admin') then raise exception 'admin only'; end if;
  if p_reward_active and nullif(trim(coalesce(p_reward_title,'')),'') is null then raise exception 'กรุณาระบุชื่อรางวัลก่อนเปิดใช้งาน'; end if;
  if p_coupon_active then
    if p_coupon_shop_id is null then raise exception 'กรุณาเลือกร้านสำหรับคูปอง'; end if;
    if coalesce(p_coupon_discount_value,0)<=0 then raise exception 'ส่วนลดต้องมากกว่า 0'; end if;
    if p_coupon_discount_type not in ('fixed','percent') then raise exception 'รูปแบบส่วนลดไม่ถูกต้อง'; end if;
    if p_coupon_discount_type='percent' and p_coupon_discount_value>100 then raise exception 'ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100'; end if;
    if p_coupon_channel not in ('both','delivery','pickup') then raise exception 'ช่องทางคูปองไม่ถูกต้อง'; end if;
  end if;

  insert into public.market_mission_settings(mission_key,mission_active,reward_title,reward_detail,claim_note,reward_active,
    coupon_active,coupon_shop_id,coupon_discount_type,coupon_discount_value,coupon_min_spend,coupon_max_discount,coupon_channel,coupon_expires_at,updated_at,updated_by)
  values('mission_v1',coalesce(p_mission_active,true),left(trim(coalesce(p_reward_title,'')),120),left(trim(coalesce(p_reward_detail,'')),500),
    left(trim(coalesce(p_claim_note,'')),500),coalesce(p_reward_active,false),coalesce(p_coupon_active,false),p_coupon_shop_id,
    coalesce(p_coupon_discount_type,'fixed'),greatest(coalesce(p_coupon_discount_value,0),0),greatest(coalesce(p_coupon_min_spend,0),0),
    case when p_coupon_max_discount is null then null else greatest(p_coupon_max_discount,0) end,coalesce(p_coupon_channel,'both'),p_coupon_expires_at,now(),auth.uid())
  on conflict(mission_key) do update set mission_active=excluded.mission_active,reward_title=excluded.reward_title,reward_detail=excluded.reward_detail,
    claim_note=excluded.claim_note,reward_active=excluded.reward_active,coupon_active=excluded.coupon_active,coupon_shop_id=excluded.coupon_shop_id,
    coupon_discount_type=excluded.coupon_discount_type,coupon_discount_value=excluded.coupon_discount_value,coupon_min_spend=excluded.coupon_min_spend,
    coupon_max_discount=excluded.coupon_max_discount,coupon_channel=excluded.coupon_channel,coupon_expires_at=excluded.coupon_expires_at,
    updated_at=now(),updated_by=auth.uid();
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.market_admin_set_mission_reward(boolean,text,text,text,boolean,boolean,uuid,text,numeric,numeric,numeric,text,timestamptz) to authenticated;

-- True only when all 4 Mission V1 goals are complete.
create or replace function public.market_mission_v1_is_complete(p_user uuid)
returns boolean language sql security definer set search_path=public stable as $$
  select
    (select count(distinct shop_id) from public.market_mission_shop_views where user_id=p_user)>=5
    and (select count(distinct shop_id) from public.market_favorites where user_id=p_user)>=3
    and (select count(*) from public.market_reviews where user_id=p_user and status='approved')>=1
    and exists(
      select 1 from public.market_orders o join public.market_delivery_groups g on g.id=o.group_id
      where o.customer_id=p_user and o.status<>'cancelled' and coalesce(o.refund_status,'')<>'completed'
      and ((g.fulfillment_method='pickup' and o.pickup_completed_at is not null)
        or (g.fulfillment_method='delivery' and exists(select 1 from public.market_delivery_batch_orders bo join public.market_delivery_batches b on b.id=bo.batch_id where bo.order_id=o.id and b.status='completed' and b.completed_at is not null)))
    );
$$;
revoke all on function public.market_mission_v1_is_complete(uuid) from public;

create or replace function public.market_my_mission_coupon_options(p_fulfillment_method text,p_shop_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.market_mission_settings%rowtype; used boolean; label text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select * into s from public.market_mission_settings where mission_key='mission_v1';
  if not found or not s.mission_active or not s.coupon_active or s.coupon_shop_id is null then return '[]'::jsonb; end if;
  if s.coupon_expires_at is not null and s.coupon_expires_at<=now() then return '[]'::jsonb; end if;
  if s.coupon_channel<>'both' and s.coupon_channel<>p_fulfillment_method then return '[]'::jsonb; end if;
  if not (s.coupon_shop_id=any(p_shop_ids)) then return '[]'::jsonb; end if;
  if not public.market_mission_v1_is_complete(auth.uid()) then return '[]'::jsonb; end if;
  select exists(select 1 from public.market_mission_coupon_redemptions where mission_key='mission_v1' and user_id=auth.uid()) into used;
  if used then return '[]'::jsonb; end if;
  label:=case when s.coupon_discount_type='percent' then 'Mission ลด '||trim(to_char(s.coupon_discount_value,'FM999990.##'))||'%' else 'Mission ลด '||trim(to_char(s.coupon_discount_value,'FM999990.##'))||' บาท' end;
  return jsonb_build_array(jsonb_build_object('coupon_id','mission_v1','shop_id',s.coupon_shop_id,'label',label,'min_spend',s.coupon_min_spend,'expires_at',s.coupon_expires_at));
end $$;
grant execute on function public.market_my_mission_coupon_options(text,uuid[]) to authenticated;

create or replace function public.market_apply_mission_coupons_to_group(p_group_id uuid,p_coupon_ids text[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.market_mission_settings%rowtype; o public.market_orders%rowtype; g public.market_delivery_groups%rowtype; d numeric:=0; total numeric:=0;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not ('mission_v1'=any(coalesce(p_coupon_ids,array[]::text[]))) then return jsonb_build_object('discount_total',0); end if;
  select * into g from public.market_delivery_groups where id=p_group_id and customer_id=auth.uid() for update;
  if not found then raise exception 'ไม่พบชุดคำสั่งซื้อ'; end if;
  select * into s from public.market_mission_settings where mission_key='mission_v1';
  if not found or not s.mission_active or not s.coupon_active then raise exception 'คูปองไม่ได้เปิดใช้งาน'; end if;
  if s.coupon_expires_at is not null and s.coupon_expires_at<=now() then raise exception 'คูปองหมดอายุแล้ว'; end if;
  if s.coupon_channel<>'both' and s.coupon_channel<>g.fulfillment_method then raise exception 'คูปองใช้กับช่องทางนี้ไม่ได้'; end if;
  if not public.market_mission_v1_is_complete(auth.uid()) then raise exception 'Mission ยังไม่สำเร็จครบ'; end if;
  if exists(select 1 from public.market_mission_coupon_redemptions where mission_key='mission_v1' and user_id=auth.uid()) then raise exception 'คูปองนี้ถูกใช้แล้ว'; end if;
  select * into o from public.market_orders where group_id=p_group_id and customer_id=auth.uid() and shop_id=s.coupon_shop_id and status<>'cancelled' for update;
  if not found then raise exception 'ไม่พบออเดอร์ของร้านที่ใช้คูปอง'; end if;
  if o.subtotal < coalesce(s.coupon_min_spend,0) then raise exception 'ยอดซื้อไม่ถึงขั้นต่ำของคูปอง'; end if;
  d:=case when s.coupon_discount_type='percent' then round(o.subtotal*s.coupon_discount_value/100,2) else s.coupon_discount_value end;
  if s.coupon_max_discount is not null and s.coupon_max_discount>0 then d:=least(d,s.coupon_max_discount); end if;
  d:=greatest(0,least(d,o.subtotal));
  update public.market_orders set original_subtotal=coalesce(original_subtotal,subtotal),coupon_discount=d,mission_coupon_key='mission_v1',subtotal=subtotal-d where id=o.id;
  insert into public.market_mission_coupon_redemptions(mission_key,user_id,shop_id,order_id,discount_amount) values('mission_v1',auth.uid(),o.shop_id,o.id,d);
  total:=d;
  return jsonb_build_object('discount_total',total,'order_id',o.id);
end $$;
grant execute on function public.market_apply_mission_coupons_to_group(uuid,text[]) to authenticated;

select 'v0.5.22.0 mission coupon ready' as result;
-- V0.5.22.1 Shop-created coupons + Mission coupons in one checkout
create table if not exists public.market_shop_coupons(
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.market_shops(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, title text not null, description text default '',
  discount_type text not null default 'fixed' check(discount_type in ('fixed','percent')), discount_value numeric(12,2) not null check(discount_value>0),
  min_spend numeric(12,2) not null default 0, max_discount numeric(12,2), channel text not null default 'both' check(channel in ('both','delivery','pickup')),
  total_limit integer, starts_at timestamptz, expires_at timestamptz, active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.market_shop_coupons enable row level security;
drop policy if exists "owner manage own shop coupons" on public.market_shop_coupons;
create policy "owner manage own shop coupons" on public.market_shop_coupons for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid() and exists(select 1 from public.market_shops s where s.id=shop_id and (s.owner_id=auth.uid() or exists(select 1 from public.market_profiles p where p.id=auth.uid() and p.role='admin'))));
grant select,insert,update,delete on public.market_shop_coupons to authenticated;

create table if not exists public.market_shop_coupon_redemptions(
 id uuid primary key default gen_random_uuid(), coupon_id uuid not null references public.market_shop_coupons(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, order_id uuid references public.market_orders(id) on delete set null,
 discount_amount numeric(12,2) not null default 0, redeemed_at timestamptz not null default now(), unique(coupon_id,user_id)
);
alter table public.market_shop_coupon_redemptions enable row level security;
drop policy if exists "users read own shop coupon redemptions" on public.market_shop_coupon_redemptions;
create policy "users read own shop coupon redemptions" on public.market_shop_coupon_redemptions for select to authenticated using(user_id=auth.uid());
grant select on public.market_shop_coupon_redemptions to authenticated;

-- Keep old RPC name so checkout JS remains backward-compatible; return both Mission and shop coupons.
create or replace function public.market_my_mission_coupon_options(p_fulfillment_method text,p_shop_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.market_mission_settings%rowtype; outj jsonb:='[]'::jsonb; label text;
begin
 if auth.uid() is null then raise exception 'login required'; end if;
 select * into s from public.market_mission_settings where mission_key='mission_v1';
 if found and s.mission_active and s.coupon_active and s.coupon_shop_id=any(p_shop_ids)
   and (s.coupon_expires_at is null or s.coupon_expires_at>now()) and (s.coupon_channel='both' or s.coupon_channel=p_fulfillment_method)
   and public.market_mission_v1_is_complete(auth.uid())
   and not exists(select 1 from public.market_mission_coupon_redemptions where mission_key='mission_v1' and user_id=auth.uid()) then
   label:=case when s.coupon_discount_type='percent' then 'Mission ลด '||trim(to_char(s.coupon_discount_value,'FM999990.##'))||'%' else 'Mission ลด '||trim(to_char(s.coupon_discount_value,'FM999990.##'))||' บาท' end;
   outj:=outj||jsonb_build_array(jsonb_build_object('coupon_id','mission_v1','shop_id',s.coupon_shop_id,'label',label,'min_spend',s.coupon_min_spend,'expires_at',s.coupon_expires_at));
 end if;
 outj:=outj||coalesce((select jsonb_agg(jsonb_build_object('coupon_id','shop:'||c.id::text,'shop_id',c.shop_id,'label',c.title,'min_spend',c.min_spend,'expires_at',c.expires_at))
   from public.market_shop_coupons c where c.active and c.shop_id=any(p_shop_ids) and (c.channel='both' or c.channel=p_fulfillment_method)
   and (c.starts_at is null or c.starts_at<=now()) and (c.expires_at is null or c.expires_at>now())
   and not exists(select 1 from public.market_shop_coupon_redemptions r where r.coupon_id=c.id and r.user_id=auth.uid())
   and (c.total_limit is null or (select count(*) from public.market_shop_coupon_redemptions r where r.coupon_id=c.id)<c.total_limit)), '[]'::jsonb);
 return outj;
end $$;
grant execute on function public.market_my_mission_coupon_options(text,uuid[]) to authenticated;

create or replace function public.market_apply_mission_coupons_to_group(p_group_id uuid,p_coupon_ids text[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.market_mission_settings%rowtype; o public.market_orders%rowtype; g public.market_delivery_groups%rowtype; c public.market_shop_coupons%rowtype; cid text; uid uuid; d numeric:=0; total numeric:=0;
begin
 if auth.uid() is null then raise exception 'login required'; end if;
 select * into g from public.market_delivery_groups where id=p_group_id and customer_id=auth.uid() for update; if not found then raise exception 'ไม่พบชุดคำสั่งซื้อ'; end if;
 foreach cid in array coalesce(p_coupon_ids,array[]::text[]) loop
   if cid='mission_v1' then
     select * into s from public.market_mission_settings where mission_key='mission_v1';
     if not found or not s.mission_active or not s.coupon_active then raise exception 'คูปอง Mission ไม่ได้เปิดใช้งาน'; end if;
     if s.coupon_expires_at is not null and s.coupon_expires_at<=now() then raise exception 'คูปอง Mission หมดอายุแล้ว'; end if;
     if s.coupon_channel<>'both' and s.coupon_channel<>g.fulfillment_method then raise exception 'คูปอง Mission ใช้กับช่องทางนี้ไม่ได้'; end if;
     if not public.market_mission_v1_is_complete(auth.uid()) then raise exception 'Mission ยังไม่สำเร็จครบ'; end if;
     if exists(select 1 from public.market_mission_coupon_redemptions where mission_key='mission_v1' and user_id=auth.uid()) then raise exception 'คูปอง Mission ถูกใช้แล้ว'; end if;
     select * into o from public.market_orders where group_id=p_group_id and customer_id=auth.uid() and shop_id=s.coupon_shop_id and status<>'cancelled' for update; if not found then raise exception 'ไม่พบออเดอร์ร้านคูปอง Mission'; end if;
     if o.subtotal<coalesce(s.coupon_min_spend,0) then raise exception 'ยอดซื้อไม่ถึงขั้นต่ำคูปอง Mission'; end if;
     d:=case when s.coupon_discount_type='percent' then round(o.subtotal*s.coupon_discount_value/100,2) else s.coupon_discount_value end; if s.coupon_max_discount is not null and s.coupon_max_discount>0 then d:=least(d,s.coupon_max_discount); end if; d:=greatest(0,least(d,o.subtotal));
     update public.market_orders set original_subtotal=coalesce(original_subtotal,subtotal),coupon_discount=coalesce(coupon_discount,0)+d,mission_coupon_key='mission_v1',subtotal=subtotal-d where id=o.id;
     insert into public.market_mission_coupon_redemptions(mission_key,user_id,shop_id,order_id,discount_amount) values('mission_v1',auth.uid(),o.shop_id,o.id,d); total:=total+d;
   elsif cid like 'shop:%' then
     begin uid:=substring(cid from 6)::uuid; exception when others then raise exception 'รหัสคูปองร้านค้าไม่ถูกต้อง'; end;
     select * into c from public.market_shop_coupons where id=uid for update; if not found or not c.active then raise exception 'คูปองร้านค้าไม่พร้อมใช้งาน'; end if;
     if c.starts_at is not null and c.starts_at>now() then raise exception 'คูปองยังไม่เริ่ม'; end if; if c.expires_at is not null and c.expires_at<=now() then raise exception 'คูปองหมดอายุแล้ว'; end if;
     if c.channel<>'both' and c.channel<>g.fulfillment_method then raise exception 'คูปองใช้กับช่องทางนี้ไม่ได้'; end if;
     if exists(select 1 from public.market_shop_coupon_redemptions where coupon_id=c.id and user_id=auth.uid()) then raise exception 'คูปองนี้ถูกใช้แล้ว'; end if;
     if c.total_limit is not null and (select count(*) from public.market_shop_coupon_redemptions where coupon_id=c.id)>=c.total_limit then raise exception 'คูปองครบจำนวนสิทธิ์แล้ว'; end if;
     select * into o from public.market_orders where group_id=p_group_id and customer_id=auth.uid() and shop_id=c.shop_id and status<>'cancelled' for update; if not found then raise exception 'ไม่พบออเดอร์ของร้านที่ใช้คูปอง'; end if;
     if o.subtotal<c.min_spend then raise exception 'ยอดซื้อไม่ถึงขั้นต่ำของคูปอง'; end if;
     d:=case when c.discount_type='percent' then round(o.subtotal*c.discount_value/100,2) else c.discount_value end; if c.max_discount is not null and c.max_discount>0 then d:=least(d,c.max_discount); end if; d:=greatest(0,least(d,o.subtotal));
     update public.market_orders set original_subtotal=coalesce(original_subtotal,subtotal),coupon_discount=coalesce(coupon_discount,0)+d,subtotal=subtotal-d where id=o.id;
     insert into public.market_shop_coupon_redemptions(coupon_id,user_id,order_id,discount_amount) values(c.id,auth.uid(),o.id,d); total:=total+d;
   end if;
 end loop;
 return jsonb_build_object('discount_total',total);
end $$;
grant execute on function public.market_apply_mission_coupons_to_group(uuid,text[]) to authenticated;
select 'v0.5.22.1 shop coupons ready' as result;
