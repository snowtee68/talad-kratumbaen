-- V0.5.22.59 Rider Profile Edit
-- รันใน Supabase SQL Editor 1 ครั้ง
-- ให้เฉพาะวินที่ได้รับอนุมัติแล้วแก้ข้อมูลของตนเองได้
-- ไม่เปลี่ยนสถานะ approved และไม่ต้องสมัครใหม่

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

  if char_length(v_name)<2 or char_length(v_phone)<8 or char_length(v_area)<2 or char_length(v_plate)<2 then
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

select 'v0.5.22.59 rider profile edit ready' as result;
