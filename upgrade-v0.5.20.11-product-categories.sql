-- V0.5.20.11 Product Categories
create table if not exists public.market_product_categories(
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.market_shops(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_product_categories_name_len check(char_length(trim(name)) between 1 and 80)
);

create unique index if not exists market_product_categories_shop_name_uq
on public.market_product_categories(shop_id,lower(trim(name)));

alter table public.market_products
  add column if not exists category_id uuid references public.market_product_categories(id) on delete set null;

create index if not exists market_products_category_id_idx on public.market_products(category_id);
create index if not exists market_product_categories_shop_sort_idx on public.market_product_categories(shop_id,sort_order,created_at);

alter table public.market_product_categories enable row level security;

drop policy if exists "product categories public read" on public.market_product_categories;
create policy "product categories public read"
on public.market_product_categories for select
to anon,authenticated
using (active=true or exists(
  select 1 from public.market_shops s where s.id=shop_id and s.owner_id=auth.uid()
));

drop policy if exists "product categories owner insert" on public.market_product_categories;
create policy "product categories owner insert"
on public.market_product_categories for insert
to authenticated
with check (exists(
  select 1 from public.market_shops s where s.id=shop_id and s.owner_id=auth.uid()
));

drop policy if exists "product categories owner update" on public.market_product_categories;
create policy "product categories owner update"
on public.market_product_categories for update
to authenticated
using (exists(
  select 1 from public.market_shops s where s.id=shop_id and s.owner_id=auth.uid()
))
with check (exists(
  select 1 from public.market_shops s where s.id=shop_id and s.owner_id=auth.uid()
));

drop policy if exists "product categories owner delete" on public.market_product_categories;
create policy "product categories owner delete"
on public.market_product_categories for delete
to authenticated
using (exists(
  select 1 from public.market_shops s where s.id=shop_id and s.owner_id=auth.uid()
));

select 'v0.5.20.11 product categories ready' as result;
