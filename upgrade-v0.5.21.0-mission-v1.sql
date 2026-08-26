create table if not exists public.market_mission_shop_views (
 user_id uuid not null references auth.users(id) on delete cascade,
 shop_id uuid not null references public.market_shops(id) on delete cascade,
 first_viewed_at timestamptz not null default now(),
 last_viewed_at timestamptz not null default now(),
 primary key (user_id,shop_id)
);
alter table public.market_mission_shop_views enable row level security;
drop policy if exists "mission views select own" on public.market_mission_shop_views;
create policy "mission views select own" on public.market_mission_shop_views for select to authenticated using(auth.uid()=user_id);
drop policy if exists "mission views insert own" on public.market_mission_shop_views;
create policy "mission views insert own" on public.market_mission_shop_views for insert to authenticated with check(auth.uid()=user_id);
drop policy if exists "mission views update own" on public.market_mission_shop_views;
create policy "mission views update own" on public.market_mission_shop_views for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
grant select,insert,update on public.market_mission_shop_views to authenticated;
