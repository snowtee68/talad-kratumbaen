-- Talad Kratumbaen v0.5.8.1 — Product limit: 100 items per shop

create or replace function public.market_enforce_product_limit()
returns trigger
language plpgsql
as $$
declare
  v_count integer;
begin
  -- Editing an existing product does not consume another slot.
  if tg_op = 'UPDATE' and new.shop_id = old.shop_id then
    return new;
  end if;

  select count(*) into v_count
  from public.market_products
  where shop_id = new.shop_id;

  if v_count >= 100 then
    raise exception 'ร้านค้าหนึ่งร้านเพิ่มสินค้าได้สูงสุด 100 รายการ';
  end if;

  return new;
end;
$$;

drop trigger if exists market_products_limit_100 on public.market_products;
create trigger market_products_limit_100
before insert or update of shop_id on public.market_products
for each row execute function public.market_enforce_product_limit();

select 'product limit 100 ready' as result;
