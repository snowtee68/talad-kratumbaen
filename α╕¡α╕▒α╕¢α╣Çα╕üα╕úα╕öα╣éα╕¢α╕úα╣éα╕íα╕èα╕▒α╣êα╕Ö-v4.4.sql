-- ตลาดกระทุ่มแบน Main v4.4
-- เพิ่มสิทธิ์ให้เจ้าของร้านดูและลบโปรโมชั่นของร้านตนเอง
-- รันใน Supabase > SQL Editor เพียงครั้งเดียว

alter table public.market_promotions enable row level security;

-- เจ้าของโปรโมชั่นสามารถอ่านโปรโมชั่นทั้งหมดของตนเอง รวมถึงโปรหมดอายุ
-- (นโยบาย public select เดิมยังคงทำงานตามเดิม)
drop policy if exists "Owners can view own promotions" on public.market_promotions;
create policy "Owners can view own promotions"
on public.market_promotions
for select
to authenticated
using (owner_id = auth.uid());

-- เจ้าของโปรโมชั่นสามารถลบโปรโมชั่นของตนเองได้
drop policy if exists "Owners can delete own promotions" on public.market_promotions;
create policy "Owners can delete own promotions"
on public.market_promotions
for delete
to authenticated
using (owner_id = auth.uid());

-- ยืนยันว่าเจ้าของร้านเพิ่มโปรโมชั่นได้เฉพาะร้านของตนเอง
-- หากมี policy insert เดิมอยู่แล้ว คำสั่งนี้จะสร้างชื่อใหม่โดยไม่กระทบ policy เดิม
drop policy if exists "Owners can insert promotions for own shops" on public.market_promotions;
create policy "Owners can insert promotions for own shops"
on public.market_promotions
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and exists (
    select 1
    from public.market_shops s
    where s.id = shop_id
      and s.owner_id = auth.uid()
  )
);
