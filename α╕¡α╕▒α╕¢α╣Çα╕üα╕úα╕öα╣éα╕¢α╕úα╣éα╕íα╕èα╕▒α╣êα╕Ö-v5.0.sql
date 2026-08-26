-- ตลาดกระทุ่มแบน Main v5.0
-- เพิ่มระบบแก้ไข เปิด/ปิด คัดลอก ปักหมุด และลบโปรโมชั่น
-- รันใน Supabase > SQL Editor เพียงครั้งเดียว

alter table public.market_promotions
  add column if not exists featured boolean not null default false;

alter table public.market_promotions enable row level security;

drop policy if exists "Owners can view own promotions" on public.market_promotions;
create policy "Owners can view own promotions"
on public.market_promotions
for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists "Owners can insert promotions for own shops" on public.market_promotions;
create policy "Owners can insert promotions for own shops"
on public.market_promotions
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.market_shops s
    where s.id = shop_id and s.owner_id = auth.uid()
  )
);

drop policy if exists "Owners can update own promotions" on public.market_promotions;
create policy "Owners can update own promotions"
on public.market_promotions
for update
to authenticated
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.market_shops s
    where s.id = shop_id and s.owner_id = auth.uid()
  )
);

drop policy if exists "Owners can delete own promotions" on public.market_promotions;
create policy "Owners can delete own promotions"
on public.market_promotions
for delete
to authenticated
using (owner_id = auth.uid());
