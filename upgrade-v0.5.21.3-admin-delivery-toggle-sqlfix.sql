-- V0.5.21.2 Admin-controlled Selling / Delivery access
-- Purpose:
-- 1) Shop approval (display on website) remains separate.
-- 2) Only Admin can enable/disable Selling/Delivery per shop.
-- 3) Shop owners may configure/open orders only after Admin enables access.
-- Existing enabled shops remain enabled; this migration does NOT bulk-disable anything.

alter table public.market_order_shop_access
  add column if not exists admin_suspended boolean not null default false;

-- Owners must no longer self-activate access.
-- Do not REVOKE before CREATE because some existing databases never had this legacy function.
-- We create/replace it first, then restrict it safely.
create or replace function public.market_shop_activate_order_access(p_shop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not exists(select 1 from public.market_profiles where id=auth.uid() and role='admin') then
    raise exception 'เฉพาะ Admin เท่านั้นที่เปิดสิทธิ์ขาย/Delivery ได้';
  end if;
  return public.market_admin_set_order_shop_access(p_shop_id,true,'เปิดสิทธิ์โดย Admin');
end $$;
revoke all on function public.market_shop_activate_order_access(uuid) from public;
revoke execute on function public.market_shop_activate_order_access(uuid) from anon;
grant execute on function public.market_shop_activate_order_access(uuid) to authenticated;

-- Admin-only list for UI switches.
create or replace function public.market_admin_list_order_shop_access()
returns table(shop_id uuid, enabled boolean, admin_suspended boolean, note text)
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not exists(select 1 from public.market_profiles where id=auth.uid() and role='admin') then
    raise exception 'admin only';
  end if;
  return query
  select s.id,
         coalesce(a.enabled,false),
         coalesce(a.admin_suspended,false),
         a.note
  from public.market_shops s
  left join public.market_order_shop_access a on a.shop_id=s.id
  order by s.created_at desc;
end $$;
revoke all on function public.market_admin_list_order_shop_access() from public;
grant execute on function public.market_admin_list_order_shop_access() to authenticated;

-- Admin switch: enabled=true opens access, false closes access.
create or replace function public.market_admin_set_order_shop_access(
  p_shop_id uuid,
  p_enabled boolean,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_shop_name text; v_status text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not exists(select 1 from public.market_profiles where id=auth.uid() and role='admin') then
    raise exception 'admin only';
  end if;

  select name,status into v_shop_name,v_status
  from public.market_shops where id=p_shop_id;

  if v_shop_name is null then raise exception 'ไม่พบร้านค้า'; end if;
  if p_enabled and v_status is distinct from 'approved' then
    raise exception 'ต้องอนุมัติร้านให้แสดงบนเว็บก่อน จึงเปิดสิทธิ์ขาย/Delivery ได้';
  end if;

  insert into public.market_order_shop_access(
    shop_id,enabled,enabled_at,enabled_by,note,updated_at,admin_suspended
  )
  values(
    p_shop_id,p_enabled,case when p_enabled then now() else null end,
    auth.uid(),nullif(trim(p_note),''),now(),not p_enabled
  )
  on conflict(shop_id) do update
    set enabled=excluded.enabled,
        enabled_at=case when excluded.enabled then coalesce(market_order_shop_access.enabled_at,now()) else null end,
        enabled_by=auth.uid(),
        note=excluded.note,
        updated_at=now(),
        admin_suspended=not excluded.enabled;

  -- Turning Admin access OFF also prevents new orders immediately.
  -- We deliberately do not delete products or existing orders.
  if not p_enabled then
    update public.market_shop_order_settings
       set enabled=false,updated_at=now()
     where shop_id=p_shop_id;
  end if;

  return jsonb_build_object(
    'shop_id',p_shop_id,
    'shop_name',v_shop_name,
    'enabled',p_enabled
  );
end $$;
revoke all on function public.market_admin_set_order_shop_access(uuid,boolean,text) from public;
grant execute on function public.market_admin_set_order_shop_access(uuid,boolean,text) to authenticated;

select 'v0.5.21.3 admin delivery toggle SQL fix ready' as result;
