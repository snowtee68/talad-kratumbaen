-- V0.5.22.99: ซิงก์ Rider ที่อนุมัติแล้วและควบคุมสถานะรับงาน
-- รันใน Supabase SQL Editor 1 ครั้ง (รันซ้ำได้)

-- ซ่อม Rider ที่อนุมัติในหน้าเว็บหลัก แต่ยังไม่มีแถวใน rider_profiles
insert into public.rider_profiles
select (jsonb_populate_record(
  null::public.rider_profiles,
  jsonb_build_object(
    'user_id',a.user_id,
    'display_name',a.display_name,
    'phone',a.phone,
    'approval_status','approved',
    'online',false,
    'created_at',coalesce(a.created_at,now()),
    'updated_at',now(),
    'approved_at',coalesce(a.reviewed_at,now()),
    'approved_by',a.reviewed_by,
    'vehicle_plate',a.vehicle_plate,
    'plate',a.vehicle_plate
  )
)).*
from public.market_rider_applications a
where a.status='approved'
on conflict (user_id) do update
set display_name=excluded.display_name,
    phone=excluded.phone,
    approval_status='approved';

-- หน้า Rider เรียกฟังก์ชันนี้ทุกครั้งหลังเข้าสู่ระบบ เพื่อซ่อมข้อมูลเฉพาะบัญชีตนเอง
create or replace function public.market_ensure_my_rider_profile()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_app public.market_rider_applications%rowtype;
  v_profile jsonb;
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;

  select * into v_app
  from public.market_rider_applications
  where user_id=auth.uid() and status='approved';

  if found then
    insert into public.rider_profiles
    select (jsonb_populate_record(
      null::public.rider_profiles,
      jsonb_build_object(
        'user_id',v_app.user_id,
        'display_name',v_app.display_name,
        'phone',v_app.phone,
        'approval_status','approved',
        'online',false,
        'created_at',coalesce(v_app.created_at,now()),
        'updated_at',now(),
        'approved_at',coalesce(v_app.reviewed_at,now()),
        'approved_by',v_app.reviewed_by,
        'vehicle_plate',v_app.vehicle_plate,
        'plate',v_app.vehicle_plate
      )
    )).*
    on conflict (user_id) do update
    set display_name=excluded.display_name,
        phone=excluded.phone,
        approval_status='approved';
  end if;

  select to_jsonb(rp) into v_profile
  from public.rider_profiles rp
  where rp.user_id=auth.uid()
    and coalesce(rp.approval_status,'pending')='approved';

  return coalesce(v_profile,jsonb_build_object('ok',false,'status','not_approved'));
end $$;

revoke all on function public.market_ensure_my_rider_profile() from public, anon;
grant execute on function public.market_ensure_my_rider_profile() to authenticated;

-- เปลี่ยนเปิด/พักรับงานผ่าน RPC เพื่อลดปัญหา RLS บล็อกการ update โดยตรง
create or replace function public.market_set_my_rider_online(p_online boolean)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;

  perform public.market_ensure_my_rider_profile();

  update public.rider_profiles
  set online=coalesce(p_online,false)
  where user_id=auth.uid()
    and coalesce(approval_status,'pending')='approved';

  if not found then
    raise exception 'approved rider profile not found';
  end if;

  return jsonb_build_object('ok',true,'online',coalesce(p_online,false));
end $$;

revoke all on function public.market_set_my_rider_online(boolean) from public, anon;
grant execute on function public.market_set_my_rider_online(boolean) to authenticated;

-- ส่ง Push เฉพาะ Rider ที่อนุมัติและเปิดรับงาน
create or replace function public.market_push_approved_rider_user_ids()
returns table(user_id uuid)
language sql
security definer
set search_path=public
as $$
  select distinct rp.user_id
  from public.rider_profiles rp
  where rp.user_id is not null
    and coalesce(rp.approval_status,'pending')='approved'
    and coalesce(rp.online,false)=true;
$$;

revoke all on function public.market_push_approved_rider_user_ids()
  from public, anon, authenticated;
grant execute on function public.market_push_approved_rider_user_ids()
  to service_role;

notify pgrst,'reload schema';

select
  (select count(*) from public.market_rider_applications where status='approved') as approved_applications,
  (select count(*) from public.rider_profiles where coalesce(approval_status,'pending')='approved') as approved_rider_profiles,
  'v0.5.22.99 rider availability sync ready' as result;
