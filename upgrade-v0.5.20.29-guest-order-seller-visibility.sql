-- V0.5.20.29 Guest orders visible to seller
-- Anonymous customers in Supabase use the authenticated DB role.
-- These policies explicitly allow the shop owner to read the order tree
-- regardless of whether customer_id belongs to a normal or anonymous auth user.

alter table public.market_orders enable row level security;
alter table public.market_delivery_groups enable row level security;
alter table public.market_order_items enable row level security;

drop policy if exists "market orders participants read v0529" on public.market_orders;
create policy "market orders participants read v0529"
on public.market_orders
for select
to authenticated
using (
  customer_id = auth.uid()
  or exists (
    select 1
    from public.market_shops s
    where s.id = market_orders.shop_id
      and s.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.market_profiles p
    where p.id=auth.uid() and p.role='admin'
  )
);

drop policy if exists "market groups participants read v0529" on public.market_delivery_groups;
create policy "market groups participants read v0529"
on public.market_delivery_groups
for select
to authenticated
using (
  customer_id = auth.uid()
  or exists (
    select 1
    from public.market_orders o
    join public.market_shops s on s.id=o.shop_id
    where o.group_id = market_delivery_groups.id
      and s.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.market_profiles p
    where p.id=auth.uid() and p.role='admin'
  )
);

drop policy if exists "market order items participants read v0529" on public.market_order_items;
create policy "market order items participants read v0529"
on public.market_order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.market_orders o
    left join public.market_shops s on s.id=o.shop_id
    where o.id = market_order_items.order_id
      and (
        o.customer_id = auth.uid()
        or s.owner_id = auth.uid()
        or exists (
          select 1 from public.market_profiles p
          where p.id=auth.uid() and p.role='admin'
        )
      )
  )
);

-- Helpful indexes for seller/customer participant checks.
create index if not exists market_orders_shop_created_idx
  on public.market_orders(shop_id,created_at desc);
create index if not exists market_orders_group_idx
  on public.market_orders(group_id);
create index if not exists market_order_items_order_idx
  on public.market_order_items(order_id);

select 'v0.5.20.29 guest order seller visibility ready' as result;
