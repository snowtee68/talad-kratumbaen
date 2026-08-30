-- V0.5.22.60 Existing Rider Account Status Fix
-- รันใน Supabase SQL Editor 1 ครั้ง
--
-- ปัญหาที่แก้:
-- บัญชีที่เคยเป็นวินในระบบตั้งแต่ flow รุ่นเดิม Login แล้วหน้าเว็บยังขึ้น "สมัครเป็นวินโครงการ"
--
-- หลักการ:
-- 1) ถ้ามี market_rider_applications -> ใช้สถานะใบสมัครเดิมตามปกติ
-- 2) ถ้าไม่มีใบสมัครใหม่ แต่ user_id มีอยู่ใน rider_profiles และ approved -> ถือว่าเป็นวินเดิมที่อนุมัติแล้ว
-- 3) ไม่ให้สมัครใหม่ ไม่ลบข้อมูลเดิม ไม่เปลี่ยนประวัติงาน Delivery
-- 4) ถ้าวินเดิมแก้ข้อมูลครั้งแรก ระบบจะสร้าง application record ให้โดยคงสถานะ approved

create or replace function public.market_my_rider_application()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'user_id',a.user_id,
        'display_name',a.display_name,
        'phone',a.phone,
        'service_area',a.service_area,
        'vehicle_plate',a.vehicle_plate,
        'status',a.status,
        'admin_note',a.admin_note,
        'created_at',a.created_at,
        'updated_at',a.updated_at,
        'reviewed_at',a.reviewed_at,
        'source','application'
      )
      from public.market_rider_applications a
      where a.user_id=auth.uid()
    ),
    (
      select jsonb_build_object(
        'user_id',rp.user_id,
        'display_name',rp.display_name,
        'phone',rp.phone,
        'service_area','อำเภอกระทุ่มแบนและพื้นที่ใกล้เคียงตามที่ระบบกำหนด',
        'vehicle_plate','',
        'status','approved',
        'admin_note',null,
        'created_at',null,
        'updated_at',null,
        'reviewed_at',null,
        'source','legacy_rider_profile'
      )
      from public.rider_profiles rp
      where rp.user_id=auth.uid()
        and coalesce(rp.approval_status,'approved')='approved'
      limit 1
    ),
    '{}'::jsonb
  );
$$;

revoke all on function public.market_my_rider_application() from public;
grant execute on function public.market_my_rider_application() to authenticated;


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
  v_has_legacy boolean:=false;
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;

  if char_length(v_name)<2 or char_length(v_phone)<8 or
     char_length(v_area)<2 or char_length(v_plate)<2 then
    raise exception 'please complete rider profile';
  end if;

  -- อัปเดต application รุ่นใหม่ถ้ามี
  update public.market_rider_applications
  set display_name=v_name,
      phone=v_phone,
      service_area=v_area,
      vehicle_plate=v_plate,
      updated_at=now()
  where user_id=auth.uid()
    and status='approved';

  -- ถ้ายังไม่มี application ให้ตรวจสิทธิ์วินเดิมจาก rider_profiles
  if not found then
    select exists(
      select 1
      from public.rider_profiles rp
      where rp.user_id=auth.uid()
        and coalesce(rp.approval_status,'approved')='approved'
    ) into v_has_legacy;

    if not v_has_legacy then
      raise exception 'approved rider profile not found';
    end if;

    insert into public.market_rider_applications(
      user_id,display_name,phone,service_area,vehicle_plate,
      status,admin_note,reviewed_by,reviewed_at,created_at,updated_at
    ) values(
      auth.uid(),v_name,v_phone,v_area,v_plate,
      'approved',null,null,now(),now(),now()
    )
    on conflict(user_id) do update set
      display_name=excluded.display_name,
      phone=excluded.phone,
      service_area=excluded.service_area,
      vehicle_plate=excluded.vehicle_plate,
      status='approved',
      updated_at=now();
  end if;

  -- sync ทะเบียนวินหลัก
  update public.rider_profiles
  set display_name=v_name,
      phone=v_phone,
      approval_status='approved'
  where user_id=auth.uid();

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

select 'v0.5.22.60 existing rider account status fix ready' as result;
