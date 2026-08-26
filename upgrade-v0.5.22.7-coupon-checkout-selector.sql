-- Talad Krathumbaen v0.5.22.7
-- Rebuilds the customer coupon selector RPC and redemption RPC used by checkout.
-- Safe to run after v0.5.22.2+; does not delete coupon/claim/redemption data.

create or replace function public.market_coupon_options(p_fulfillment_method text,p_shop_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if p_fulfillment_method not in ('delivery','pickup') then raise exception 'ช่องทางไม่ถูกต้อง'; end if;

  -- Mission coupon sync must not prevent normal shop coupons from being listed.
  begin
    perform public.market_sync_mission_coupon_claim();
  exception when others then
    null;
  end;

  return coalesce((select jsonb_agg(to_jsonb(q) order by q.source desc,q.claimed_at desc) from (
    select c.id,c.shop_id,c.source,c.title,c.description,c.discount_type,c.discount_value,
      c.min_spend,c.max_discount,c.channel,c.ends_at,cl.claimed_at,
      case when c.discount_type='percent'
        then 'ลด '||trim(to_char(c.discount_value,'FM999990.##'))||'%'||
          case when coalesce(c.max_discount,0)>0 then ' สูงสุด '||trim(to_char(c.max_discount,'FM999990.##'))||' บาท' else '' end
        else 'ลด '||trim(to_char(c.discount_value,'FM999990.##'))||' บาท' end as discount_label
    from public.market_coupon_claims cl
    join public.market_coupons c on c.id=cl.coupon_id
    where cl.user_id=auth.uid()
      and c.active=true
      and c.shop_id=any(coalesce(p_shop_ids,array[]::uuid[]))
      and (c.channel='both' or c.channel=p_fulfillment_method)
      and (c.starts_at is null or c.starts_at<=now())
      and (c.ends_at is null or c.ends_at>now())
      and not exists(
        select 1 from public.market_coupon_redemptions r
        where r.coupon_id=c.id and r.user_id=auth.uid()
      )
  ) q),'[]'::jsonb);
end $$;
grant execute on function public.market_coupon_options(text,uuid[]) to authenticated;

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
    insert into public.market_coupon_redemptions(coupon_id,user_id,order_id,discount_amount)
      values(c.id,auth.uid(),o.id,d);
    v_total:=v_total+d;
  end loop;
  return jsonb_build_object('discount_total',v_total);
end $$;
grant execute on function public.market_apply_coupons_to_group(uuid,uuid[]) to authenticated;

select 'v0.5.22.7 coupon checkout selector ready' as result;
