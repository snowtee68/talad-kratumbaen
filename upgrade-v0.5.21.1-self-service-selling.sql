-- V0.5.21.1 Self-service selling after shop approval
-- Approval to DISPLAY a shop remains separate from permission to SELL.
-- Approved shop owners may activate selling themselves. Admin retains a master suspension.

alter table public.market_order_shop_access
  add column if not exists admin_suspended boolean not null default false;

create or replace function public.market_shop_activate_order_access(p_shop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_shop public.market_shops%rowtype; v_suspended boolean;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select * into v_shop from public.market_shops where id=p_shop_id;
  if v_shop.id is null then raise exception 'ไม่พบร้านค้า'; end if;
  if v_shop.owner_id is distinct from auth.uid() then raise exception 'คุณไม่ใช่เจ้าของร้านนี้'; end if;
  if v_shop.status is distinct from 'approved' then raise exception 'ร้านต้องได้รับการอนุมัติก่อนเปิดขาย'; end if;

  select admin_suspended into v_suspended from public.market_order_shop_access where shop_id=p_shop_id;
  if coalesce(v_suspended,false) then raise exception 'ผู้ดูแลระบบระงับสิทธิ์ขายของร้านนี้ชั่วคราว'; end if;

  insert into public.market_order_shop_access(shop_id,enabled,enabled_at,enabled_by,note,updated_at,admin_suspended)
  values(p_shop_id,true,now(),auth.uid(),'เปิดใช้งานโดยเจ้าของร้าน',now(),false)
  on conflict(shop_id) do update set enabled=true,enabled_at=coalesce(market_order_shop_access.enabled_at,now()),enabled_by=auth.uid(),updated_at=now();
  return jsonb_build_object('shop_id',p_shop_id,'enabled',true);
end $$;
revoke all on function public.market_shop_activate_order_access(uuid) from public;
grant execute on function public.market_shop_activate_order_access(uuid) to authenticated;

-- Admin master switch. Disable = suspend, so a seller cannot simply re-enable it.
create or replace function public.market_admin_set_order_shop_access(p_shop_id uuid,p_enabled boolean,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_shop_name text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not exists(select 1 from public.market_profiles where id=auth.uid() and role='admin') then raise exception 'admin only'; end if;
  select name into v_shop_name from public.market_shops where id=p_shop_id;
  if v_shop_name is null then raise exception 'ไม่พบร้านค้า'; end if;
  insert into public.market_order_shop_access(shop_id,enabled,enabled_at,enabled_by,note,updated_at,admin_suspended)
  values(p_shop_id,p_enabled,case when p_enabled then now() else null end,auth.uid(),nullif(trim(p_note),''),now(),not p_enabled)
  on conflict(shop_id) do update set enabled=excluded.enabled,enabled_at=case when excluded.enabled then coalesce(market_order_shop_access.enabled_at,now()) else null end,enabled_by=auth.uid(),note=excluded.note,updated_at=now(),admin_suspended=not excluded.enabled;
  return jsonb_build_object('shop_id',p_shop_id,'shop_name',v_shop_name,'enabled',p_enabled,'admin_suspended',not p_enabled);
end $$;
revoke all on function public.market_admin_set_order_shop_access(uuid,boolean,text) from public;
grant execute on function public.market_admin_set_order_shop_access(uuid,boolean,text) to authenticated;

-- Harden the insert guard: shop must still be approved and not admin-suspended.
create or replace function public.market_enforce_order_shop_access()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.market_shops s join public.market_order_shop_access a on a.shop_id=s.id where s.id=new.shop_id and s.status='approved' and a.enabled=true and coalesce(a.admin_suspended,false)=false) then
    raise exception 'ร้านนี้ยังไม่เปิดรับออเดอร์ผ่านระบบ หรือถูกระงับสิทธิ์';
  end if;
  if not exists(select 1 from public.market_shop_order_settings s where s.shop_id=new.shop_id and s.enabled=true) then raise exception 'ร้านนี้ยังไม่ได้เปิดรับออเดอร์'; end if;
  return new;
end $$;

create or replace view public.market_order_shop_access_admin_view as
select s.id shop_id,s.name shop_name,s.status shop_status,coalesce(a.enabled,false) order_access_enabled,coalesce(a.admin_suspended,false) admin_suspended,a.enabled_at,a.note,coalesce(os.enabled,false) shop_order_switch,coalesce(os.accepting_status,'open') accepting_status
from public.market_shops s left join public.market_order_shop_access a on a.shop_id=s.id left join public.market_shop_order_settings os on os.shop_id=s.id;

select 'v0.5.21.1 self-service selling ready' as result;
