-- Talad Krathumbaen v0.5.22.8
-- Coupon lifecycle: lock on order creation, consume on fulfillment completion,
-- release automatically when the related shop order is cancelled/rejected.
-- Safe after v0.5.22.7. Existing redemption rows are preserved as already used.

alter table public.market_coupon_redemptions
  add column if not exists lifecycle_status text not null default 'used',
  add column if not exists finalized_at timestamptz;

update public.market_coupon_redemptions
set lifecycle_status='used',
    finalized_at=coalesce(finalized_at, redeemed_at)
where lifecycle_status is null or lifecycle_status not in ('locked','used');

alter table public.market_coupon_redemptions
  drop constraint if exists market_coupon_redemptions_lifecycle_status_chk;
alter table public.market_coupon_redemptions
  add constraint market_coupon_redemptions_lifecycle_status_chk
  check (lifecycle_status in ('locked','used'));

-- Wallet: distinguish a coupon temporarily locked to an active order from one
-- that has been permanently consumed by a completed fulfillment.
create or replace function public.market_my_coupon_wallet()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  return coalesce((
    select jsonb_agg(to_jsonb(q) order by q.claimed_at desc)
    from (
      select
        c.id,c.shop_id,c.source,c.title,c.description,
        c.discount_type,c.discount_value,c.min_spend,c.max_discount,c.channel,
        c.starts_at,c.ends_at,c.total_limit,cl.claimed_at,
        s.name as shop_name,
        case when r.lifecycle_status='used' then r.finalized_at else null end as used_at,
        r.discount_amount,
        r.order_id,
        case
          when r.lifecycle_status='used' then 'used'
          when r.lifecycle_status='locked' then 'locked'
          when c.ends_at is not null and c.ends_at <= now() then 'expired'
          when not c.active then 'expired'
          else 'available'
        end as wallet_status,
        case
          when c.discount_type='percent' then
            'ลด '||trim(to_char(c.discount_value,'FM999990.##'))||'%'||
            case when coalesce(c.max_discount,0)>0 then
              ' สูงสุด '||trim(to_char(c.max_discount,'FM999990.##'))||' บาท'
            else '' end
          else 'ลด '||trim(to_char(c.discount_value,'FM999990.##'))||' บาท'
        end as discount_label
      from public.market_coupon_claims cl
      join public.market_coupons c on c.id=cl.coupon_id
      left join public.market_shops s on s.id=c.shop_id
      left join public.market_coupon_redemptions r
        on r.coupon_id=c.id and r.user_id=cl.user_id
      where cl.user_id=auth.uid()
    ) q
  ),'[]'::jsonb);
end $$;
grant execute on function public.market_my_coupon_wallet() to authenticated;

-- Applying a coupon now creates only a temporary lock. The unique coupon/user
-- row prevents a second order from using the same coupon while the first order
-- is still active.
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
    if exists(select 1 from public.market_coupon_redemptions where coupon_id=c.id and user_id=auth.uid()) then raise exception 'คูปองนี้กำลังถูกใช้หรือใช้ไปแล้ว'; end if;

    select * into o from public.market_orders
      where group_id=p_group_id and customer_id=auth.uid() and shop_id=c.shop_id and status<>'cancelled'
      for update;
    if not found then raise exception 'ไม่พบออเดอร์ของร้านที่ใช้คูปอง'; end if;
    if o.coupon_id is not null then raise exception 'ออเดอร์ร้านนี้มีคูปองแล้ว'; end if;
    if o.subtotal<coalesce(c.min_spend,0) then raise exception 'ยอดซื้อไม่ถึงขั้นต่ำของคูปอง'; end if;

    d:=case when c.discount_type='percent' then round(o.subtotal*c.discount_value/100,2) else c.discount_value end;
    if coalesce(c.max_discount,0)>0 then d:=least(d,c.max_discount); end if;
    d:=greatest(0,least(d,o.subtotal));

    update public.market_orders
      set original_subtotal=coalesce(original_subtotal,subtotal),coupon_discount=d,coupon_id=c.id,subtotal=subtotal-d
      where id=o.id;
    insert into public.market_coupon_redemptions(coupon_id,user_id,order_id,discount_amount,lifecycle_status,finalized_at)
      values(c.id,auth.uid(),o.id,d,'locked',null);
    v_total:=v_total+d;
  end loop;
  return jsonb_build_object('discount_total',v_total);
end $$;
grant execute on function public.market_apply_coupons_to_group(uuid,uuid[]) to authenticated;

-- Order lifecycle is the source of truth:
-- * cancellation/rejection -> remove the temporary lock so the coupon returns
-- * pickup handoff / completed delivery -> permanently consume the coupon
create or replace function public.market_coupon_order_lifecycle()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.status='cancelled' and old.status is distinct from new.status then
    delete from public.market_coupon_redemptions
    where order_id=new.id and lifecycle_status='locked';
    return new;
  end if;

  if (new.pickup_completed_at is not null and old.pickup_completed_at is null)
     or (new.status='completed' and old.status is distinct from new.status) then
    update public.market_coupon_redemptions
       set lifecycle_status='used',
           finalized_at=coalesce(finalized_at,now()),
           redeemed_at=now()
     where order_id=new.id and lifecycle_status='locked';
  end if;

  return new;
end $$;

drop trigger if exists trg_market_coupon_order_lifecycle on public.market_orders;
create trigger trg_market_coupon_order_lifecycle
after update of status,pickup_completed_at on public.market_orders
for each row execute function public.market_coupon_order_lifecycle();

-- Repair any currently locked rows whose orders already reached a terminal state
-- before this trigger was installed.
delete from public.market_coupon_redemptions r
using public.market_orders o
where r.order_id=o.id
  and r.lifecycle_status='locked'
  and o.status='cancelled';

update public.market_coupon_redemptions r
set lifecycle_status='used',
    finalized_at=coalesce(r.finalized_at,now()),
    redeemed_at=now()
from public.market_orders o
where r.order_id=o.id
  and r.lifecycle_status='locked'
  and (o.pickup_completed_at is not null or o.status='completed');

select 'v0.5.22.8 coupon lifecycle ready' as result;
