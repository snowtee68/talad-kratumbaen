-- V0.5.22.98: รายชื่อผู้รับ Push งานใหม่ต้องเป็น Rider ที่อนุมัติ
-- และเปิดสถานะ "พร้อมรับงาน" เท่านั้น
-- รันใน Supabase SQL Editor 1 ครั้ง (รันซ้ำได้)

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

select count(*) as online_approved_rider_push_recipients
from public.market_push_approved_rider_user_ids();

