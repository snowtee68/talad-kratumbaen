-- V0.5.22.59 Rider Approval -> rider_profiles Registry Fix
-- รันใน Supabase SQL Editor 1 ครั้ง
--
-- เป้าหมาย:
-- 1) เมื่อ Admin อนุมัติใบสมัครวิน ให้สร้าง/อัปเดต rider_profiles ด้วย user_id เดียวกัน
-- 2) ซ่อมข้อมูลใบสมัครที่อนุมัติไปแล้วก่อนติดตั้งแพตช์นี้
-- 3) เมื่อวินแก้ชื่อ/เบอร์ภายหลัง ให้ rider_profiles เปลี่ยนตาม
-- 4) ไม่ลบทะเบียนวินเดิม / ไม่ลบประวัติงาน Delivery

-- ---------------------------------------------------------------------------
-- Approval function
-- ---------------------------------------------------------------------------
create or replace function public.market_admin_decide_rider_application(
  p_user_id uuid,
  p_approve boolean,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_app public.market_rider_applications%rowtype;
begin
  if not exists(
    select 1
    from public.market_profiles
    where id=auth.uid() and role='admin'
  ) then
    raise exception 'admin only';
  end if;

  select *
  into v_app
  from public.market_rider_applications
  where user_id=p_user_id
  for update;

  if not found then
    raise exception 'application not found';
  end if;

  update public.market_rider_applications
  set status=case when p_approve then 'approved' else 'rejected' end,
      admin_note=nullif(trim(coalesce(p_admin_note,'')),''),
      reviewed_by=auth.uid(),
      reviewed_at=now(),
      updated_at=now()
  where user_id=p_user_id
  returning * into v_app;

  if p_approve then
    -- rider_profiles คือทะเบียนบัญชีวินที่ flow รับงาน Delivery ใช้งานจริง
    -- jsonb_populate_record ช่วยให้ใช้ได้แม้ตารางมีคอลัมน์เสริมต่างเวอร์ชันกัน
    insert into public.rider_profiles
    select (jsonb_populate_record(
      null::public.rider_profiles,
      jsonb_build_object(
        'user_id',v_app.user_id,
        'display_name',v_app.display_name,
        'phone',v_app.phone,
        'approval_status','approved',
        'created_at',coalesce(v_app.created_at,now()),
        'updated_at',now(),
        'approved_at',now(),
        'approved_by',auth.uid(),
        'vehicle_plate',v_app.vehicle_plate
      )
    )).*
    on conflict (user_id) do update
    set display_name=excluded.display_name,
        phone=excluded.phone,
        approval_status='approved';

    -- คงทะเบียน legacy ไว้เพื่อ compatibility กับ flow Delivery เดิม
    -- แต่หน้า directory จะให้ rider_profiles เป็นแหล่งหลักและ de-duplicate ตามเบอร์
    perform public.market_admin_upsert_rider(v_app.display_name,v_app.phone);
  end if;

  return jsonb_build_object(
    'ok',true,
    'status',case when p_approve then 'approved' else 'rejected' end
  );
end $$;

revoke all on function public.market_admin_decide_rider_application(uuid,boolean,text) from public;
grant execute on function public.market_admin_decide_rider_application(uuid,boolean,text) to authenticated;


-- ---------------------------------------------------------------------------
-- Repair riders that were already approved before V0.5.22.59.
-- This includes the rider just approved but missing from "วินในระบบ".
-- ---------------------------------------------------------------------------
insert into public.rider_profiles
select (jsonb_populate_record(
  null::public.rider_profiles,
  jsonb_build_object(
    'user_id',a.user_id,
    'display_name',a.display_name,
    'phone',a.phone,
    'approval_status','approved',
    'created_at',coalesce(a.created_at,now()),
    'updated_at',now(),
    'approved_at',coalesce(a.reviewed_at,now()),
    'approved_by',a.reviewed_by,
    'vehicle_plate',a.vehicle_plate
  )
)).*
from public.market_rider_applications a
where a.status='approved'
on conflict (user_id) do update
set display_name=excluded.display_name,
    phone=excluded.phone,
    approval_status='approved';


-- ---------------------------------------------------------------------------
-- Keep the real rider registry in sync when an approved rider edits profile.
-- ---------------------------------------------------------------------------
create or replace function public.market_update_my_rider_profile(
  p_display_name text,
  p_phone text,
  p_service_area text,
  p_vehicle_plate text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_name text:=left(regexp_replace(trim(coalesce(p_display_name,'')),'\s+',' ','g'),120);
  v_phone text:=left(trim(coalesce(p_phone,'')),20);
  v_area text:=left(regexp_replace(trim(coalesce(p_service_area,'')),'\s+',' ','g'),160);
  v_plate text:=left(regexp_replace(trim(coalesce(p_vehicle_plate,'')),'\s+',' ','g'),40);
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;

  if char_length(v_name)<2 or char_length(v_phone)<8 or
     char_length(v_area)<2 or char_length(v_plate)<2 then
    raise exception 'please complete rider profile';
  end if;

  update public.market_rider_applications
  set display_name=v_name,
      phone=v_phone,
      service_area=v_area,
      vehicle_plate=v_plate,
      updated_at=now()
  where user_id=auth.uid()
    and status='approved';

  if not found then
    raise exception 'approved rider profile not found';
  end if;

  update public.rider_profiles
  set display_name=v_name,
      phone=v_phone,
      approval_status='approved'
  where user_id=auth.uid();

  if not found then
    insert into public.rider_profiles
    select (jsonb_populate_record(
      null::public.rider_profiles,
      jsonb_build_object(
        'user_id',auth.uid(),
        'display_name',v_name,
        'phone',v_phone,
        'approval_status','approved',
        'created_at',now(),
        'updated_at',now(),
        'approved_at',now(),
        'vehicle_plate',v_plate
      )
    )).*;
  end if;

  return jsonb_build_object(
    'ok',true,
    'status','approved',
    'display_name',v_name,
    'phone',v_phone,
    'service_area',v_area,
    'vehicle_plate',v_plate
  );
end $$;

revoke all on function public.market_update_my_rider_profile(text,text,text,text) from public;
grant execute on function public.market_update_my_rider_profile(text,text,text,text) to authenticated;

notify pgrst, 'reload schema';

select
  (select count(*) from public.market_rider_applications where status='approved') as approved_applications,
  (select count(*)
   from public.rider_profiles rp
   join public.market_rider_applications a on a.user_id=rp.user_id
   where a.status='approved' and coalesce(rp.approval_status,'')='approved') as synced_rider_profiles,
  'v0.5.22.59 rider approval registry fix ready' as result;
