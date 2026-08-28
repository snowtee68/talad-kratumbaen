-- V0.5.22.19 Mission Repair
-- ซ่อมเฉพาะโครงสร้างที่ Mission ใช้งาน โดยไม่ลบข้อมูลเดิม

create table if not exists public.market_mission_shop_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.market_shops(id) on delete cascade,
  last_viewed_at timestamptz not null default now(),
  primary key (user_id, shop_id)
);

-- รองรับฐานที่เคยสร้างตารางไว้แล้วแต่ไม่มี unique constraint สำหรับ upsert
create unique index if not exists market_mission_shop_views_user_shop_uidx
  on public.market_mission_shop_views(user_id, shop_id);

alter table public.market_mission_shop_views enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='market_mission_shop_views' and policyname='mission_views_select_own') then
    create policy mission_views_select_own on public.market_mission_shop_views
      for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='market_mission_shop_views' and policyname='mission_views_insert_own') then
    create policy mission_views_insert_own on public.market_mission_shop_views
      for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='market_mission_shop_views' and policyname='mission_views_update_own') then
    create policy mission_views_update_own on public.market_mission_shop_views
      for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

grant select, insert, update on public.market_mission_shop_views to authenticated;

-- Mission “อุดหนุนร้านในชุมชน”
-- นับเฉพาะออเดอร์ที่จบกระบวนการจริง:
--   pickup   = ร้านกดว่าลูกค้ารับสินค้าแล้ว
--   delivery = batch ของออเดอร์นั้นส่งสำเร็จ
-- ไม่นับรายการยกเลิกหรือคืนเงินสำเร็จแล้ว
create or replace function public.market_mission_completed_order_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct o.id)::bigint
  from public.market_orders o
  join public.market_delivery_groups g on g.id = o.group_id
  where o.customer_id = auth.uid()
    and coalesce(o.status::text, '') <> 'cancelled'
    and coalesce(o.refund_status::text, '') <> 'completed'
    and (
      (g.fulfillment_method = 'pickup' and o.pickup_completed_at is not null)
      or
      (g.fulfillment_method = 'delivery' and exists (
        select 1
        from public.market_delivery_batch_orders bo
        join public.market_delivery_batches b on b.id = bo.batch_id
        where bo.order_id = o.id
          and b.status = 'completed'
      ))
    );
$$;

revoke all on function public.market_mission_completed_order_count() from public;
grant execute on function public.market_mission_completed_order_count() to authenticated;

-- ให้ PostgREST refresh schema cache ทันที
notify pgrst, 'reload schema';
