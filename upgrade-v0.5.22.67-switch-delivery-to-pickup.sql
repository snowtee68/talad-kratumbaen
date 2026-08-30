-- V0.5.22.67 Customer switch from waiting rider to self-pickup
-- COD FIX: ค่าจัดส่งวินเรียกเก็บปลายทาง จึงไม่มีเงินค่าจัดส่งที่ต้องคืน
-- Run once in Supabase SQL Editor

create or replace function public.market_customer_switch_delivery_to_pickup(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_group_id uuid;
  v_status text;
  v_accepted_at timestamptz;
  v_customer_id uuid;
begin
  if v_uid is null then raise exception 'login required'; end if;

  select b.group_id,b.status,b.accepted_at
  into v_group_id,v_status,v_accepted_at
  from public.market_delivery_batches b
  where b.id=p_batch_id
  for update;

  if not found then raise exception 'delivery batch not found'; end if;

  select g.customer_id
  into v_customer_id
  from public.market_delivery_groups g
  where g.id=v_group_id;

  if v_customer_id is distinct from v_uid then
    raise exception 'not your delivery';
  end if;

  if v_accepted_at is not null
     or coalesce(v_status,'') in ('accepted','pickup_started','picked_up','delivering','completed') then
    raise exception 'rider already accepted this job';
  end if;

  -- ยกเลิกเฉพาะงานเรียกวิน ไม่ยกเลิกออเดอร์สินค้า
  update public.market_delivery_batches
  set status='cancelled',
      delivery_arrived_at=null
  where id=p_batch_id;

  -- ถ้ามีคอลัมน์ delivery_fee ให้เป็น 0 เพื่อสะท้อนว่าเปลี่ยนเป็นรับเอง
  -- ไม่ถือว่าเป็นการ "คืนเงิน" เพราะค่าจัดส่งยังไม่ได้ชำระให้ระบบ/ร้าน
  begin
    update public.market_delivery_groups
    set delivery_fee=0
    where id=v_group_id;
  exception when undefined_column then
    null;
  end;

  return jsonb_build_object(
    'ok',true,
    'batch_id',p_batch_id,
    'group_id',v_group_id,
    'message','switched to pickup',
    'delivery_fee_payment','collect_at_destination',
    'refund_required',false
  );
end $$;

revoke all on function public.market_customer_switch_delivery_to_pickup(uuid) from public,anon;
grant execute on function public.market_customer_switch_delivery_to_pickup(uuid) to authenticated;

notify pgrst,'reload schema';
select 'v0.5.22.67 switch delivery to pickup COD fix ready' as result;
