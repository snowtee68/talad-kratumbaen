-- Talad Krathumbaen v0.5.22.6
-- Coupon wallet stability fix. Safe after v0.5.22.3+.
-- Shop coupon claims must remain visible even if Mission coupon sync has a problem.

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
        r.redeemed_at as used_at,
        r.discount_amount,
        case
          when r.id is not null then 'used'
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

select 'v0.5.22.6 wallet stability fix ready' as result;
