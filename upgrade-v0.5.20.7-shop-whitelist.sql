-- V0.5.20.7 Public Orders with Admin Shop Whitelist
-- All shops start LOCKED unless explicitly enabled by an admin.

create table if not exists public.market_order_shop_access (
  shop_id uuid primary key references public.market_shops(id) on delete cascade,
  enabled boolean not null default false,
  enabled_at timestamptz,
  enabled_by uuid,
  note text,
  updated_at timestamptz not null default now()
);

alter table public.market_order_shop_access enable row level security;

drop policy if exists "order access public read" on public.market_order_shop_access;
create policy "order access public read"
on public.market_order_shop_access for select
to anon,authenticated
using (true);

-- No direct insert/update/delete policy is granted to normal users.
-- Admin changes access only through this RPC.
create or replace function public.market_admin_set_order_shop_access(
  p_shop_id uuid,
  p_enabled boolean,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_shop_name text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not exists(
    select 1 from public.market_profiles
    where id=auth.uid() and role='admin'
  ) then
    raise exception 'admin only';
  end if;

  select name into v_shop_name
  from public.market_shops
  where id=p_shop_id;

  if v_shop_name is null then raise exception 'ไม่พบร้านค้า'; end if;

  insert into public.market_order_shop_access(
    shop_id,enabled,enabled_at,enabled_by,note,updated_at
  )
  values(
    p_shop_id,p_enabled,
    case when p_enabled then now() else null end,
    auth.uid(),nullif(trim(p_note),''),now()
  )
  on conflict(shop_id) do update
  set enabled=excluded.enabled,
      enabled_at=case when excluded.enabled then now() else null end,
      enabled_by=auth.uid(),
      note=excluded.note,
      updated_at=now();

  return jsonb_build_object(
    'shop_id',p_shop_id,
    'shop_name',v_shop_name,
    'enabled',p_enabled
  );
end $$;

revoke all on function public.market_admin_set_order_shop_access(uuid,boolean,text) from public;
grant execute on function public.market_admin_set_order_shop_access(uuid,boolean,text) to authenticated;

-- HARD GUARD: even if someone bypasses the website UI or calls checkout RPC directly,
-- market_orders cannot be inserted for a shop that Admin has not enabled.
create or replace function public.market_enforce_order_shop_access()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(
    select 1
    from public.market_order_shop_access a
    where a.shop_id=new.shop_id and a.enabled=true
  ) then
    raise exception 'ร้านนี้ยังไม่ได้เปิดสิทธิ์รับออเดอร์ผ่านระบบจริง';
  end if;

  if not exists(
    select 1
    from public.market_shop_order_settings s
    where s.shop_id=new.shop_id and s.enabled=true
  ) then
    raise exception 'ร้านนี้ยังไม่ได้เปิดรับออเดอร์';
  end if;

  return new;
end $$;

drop trigger if exists trg_market_enforce_order_shop_access on public.market_orders;
create trigger trg_market_enforce_order_shop_access
before insert on public.market_orders
for each row execute function public.market_enforce_order_shop_access();

-- Helper view for Admin inspection.
create or replace view public.market_order_shop_access_admin_view as
select
  s.id as shop_id,
  s.name as shop_name,
  s.status as shop_status,
  coalesce(a.enabled,false) as order_access_enabled,
  a.enabled_at,
  a.note,
  coalesce(os.enabled,false) as shop_order_switch,
  coalesce(os.accepting_status,'open') as accepting_status
from public.market_shops s
left join public.market_order_shop_access a on a.shop_id=s.id
left join public.market_shop_order_settings os on os.shop_id=s.id;

select 'v0.5.20.7 shop whitelist ready' as result;
