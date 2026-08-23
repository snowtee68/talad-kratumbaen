-- V0.5.20 Rider Proof of Delivery + Customer Confirmation
-- Run after delivery integration and Rider Backend Push v0.4.2.

alter table public.market_delivery_batches
  add column if not exists delivery_arrived_at timestamptz,
  add column if not exists proof_path text,
  add column if not exists proof_uploaded_at timestamptz,
  add column if not exists customer_confirmed_at timestamptz,
  add column if not exists delivery_issue_status text,
  add column if not exists delivery_issue_note text,
  add column if not exists delivery_issue_at timestamptz,
  add column if not exists proof_hold boolean not null default false,
  add column if not exists proof_delete_after timestamptz,
  add column if not exists proof_deleted_at timestamptz;

alter table public.market_delivery_batches
  drop constraint if exists market_delivery_batches_delivery_issue_status_check;
alter table public.market_delivery_batches
  add constraint market_delivery_batches_delivery_issue_status_check
  check (delivery_issue_status is null or delivery_issue_status in ('open','resolved'));

-- Private bucket. Proof images are never public URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('rider-delivery-proof','rider-delivery-proof',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public=false,
  file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

-- Rider can upload/delete only proof files under <job_id>/<rider_user_id>/...
drop policy if exists "rider proof upload own job" on storage.objects;
create policy "rider proof upload own job"
on storage.objects for insert to authenticated
with check (
  bucket_id='rider-delivery-proof'
  and (storage.foldername(name))[2]=auth.uid()::text
  and exists(
    select 1 from public.rider_jobs j
    where j.id::text=(storage.foldername(name))[1]
      and j.assigned_rider_id=auth.uid()
  )
);

drop policy if exists "rider proof delete own job" on storage.objects;
create policy "rider proof delete own job"
on storage.objects for delete to authenticated
using (
  bucket_id='rider-delivery-proof'
  and (storage.foldername(name))[2]=auth.uid()::text
  and exists(
    select 1 from public.rider_jobs j
    where j.id::text=(storage.foldername(name))[1]
      and j.assigned_rider_id=auth.uid()
  )
);

-- Customer, involved shops, or assigned rider may view a proof via signed URL.
drop policy if exists "delivery participants read rider proof" on storage.objects;
create policy "delivery participants read rider proof"
on storage.objects for select to authenticated
using (
  bucket_id='rider-delivery-proof'
  and exists(
    select 1
    from public.market_delivery_batches b
    join public.market_delivery_groups g on g.id=b.group_id
    where b.rider_job_id::text=(storage.foldername(name))[1]
      and (
        g.customer_id=auth.uid()
        or b.rider_user_id=auth.uid()
        or exists(
          select 1
          from public.market_delivery_batch_orders bo
          join public.market_orders o on o.id=bo.order_id
          join public.market_shops s on s.id=o.shop_id
          where bo.batch_id=b.id and s.owner_id=auth.uid()
        )
      )
  )
);

create or replace function public.rider_mark_delivery_arrived(
  p_job_id uuid,
  p_proof_path text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  j public.rider_jobs%rowtype;
  b public.market_delivery_batches%rowtype;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if coalesce(trim(p_proof_path),'')='' then raise exception 'กรุณาแนบรูปหลักฐานการส่งมอบ'; end if;

  select * into j from public.rider_jobs where id=p_job_id for update;
  if j.id is null then raise exception 'ไม่พบงานวิน'; end if;
  if j.assigned_rider_id<>auth.uid() then raise exception 'งานนี้ไม่ได้เป็นของวินบัญชีนี้'; end if;
  if j.status<>'delivering' then raise exception 'งานต้องอยู่สถานะกำลังจัดส่ง'; end if;
  if p_proof_path not like p_job_id::text||'/'||auth.uid()::text||'/%' then
    raise exception 'ตำแหน่งไฟล์หลักฐานไม่ถูกต้อง';
  end if;

  select * into b from public.market_delivery_batches where rider_job_id=p_job_id for update;
  if b.id is null then raise exception 'ไม่พบรอบจัดส่งของตลาด'; end if;

  update public.market_delivery_batches
     set delivery_arrived_at=coalesce(delivery_arrived_at,now()),
         proof_path=p_proof_path,
         proof_uploaded_at=now(),
         proof_hold=false,
         proof_delete_after=now()+interval '3 days',
         proof_deleted_at=null,
         updated_at=now()
   where id=b.id;

  return jsonb_build_object(
    'batch_id',b.id,
    'group_id',b.group_id,
    'status','waiting_customer_confirmation',
    'proof_delete_after',now()+interval '3 days'
  );
end $$;
revoke all on function public.rider_mark_delivery_arrived(uuid,text) from public;
grant execute on function public.rider_mark_delivery_arrived(uuid,text) to authenticated;

create or replace function public.market_customer_confirm_delivery(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  b public.market_delivery_batches%rowtype;
  v_group_id uuid;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select * into b from public.market_delivery_batches where id=p_batch_id for update;
  if b.id is null then raise exception 'ไม่พบรอบจัดส่ง'; end if;

  if not exists(
    select 1 from public.market_delivery_groups g
    where g.id=b.group_id and g.customer_id=auth.uid()
  ) then raise exception 'ไม่มีสิทธิ์ยืนยันการรับสินค้า'; end if;

  if b.delivery_arrived_at is null then raise exception 'วินยังไม่ได้แจ้งถึงปลายทาง'; end if;
  if b.delivery_issue_status='open' then raise exception 'รายการนี้มีการแจ้งปัญหา กรุณาแก้ไขปัญหาก่อน'; end if;

  update public.market_delivery_batches
     set status='completed',
         customer_confirmed_at=coalesce(customer_confirmed_at,now()),
         completed_at=coalesce(completed_at,now()),
         proof_delete_after=case when proof_hold then null else coalesce(proof_delete_after,now()+interval '3 days') end,
         updated_at=now()
   where id=b.id;

  update public.rider_jobs
     set status='completed',updated_at=now()
   where id=b.rider_job_id and status<>'cancelled';

  update public.market_orders o
     set status='completed',updated_at=now()
   where exists(
     select 1 from public.market_delivery_batch_orders bo
     where bo.batch_id=b.id and bo.order_id=o.id
   ) and o.status<>'cancelled';

  v_group_id:=b.group_id;
  if not exists(
    select 1 from public.market_orders o
    where o.group_id=v_group_id and o.status not in ('completed','cancelled')
  ) then
    update public.market_delivery_groups set status='completed',updated_at=now() where id=v_group_id;
  end if;

  return jsonb_build_object('batch_id',b.id,'group_id',v_group_id,'completed',true);
end $$;
revoke all on function public.market_customer_confirm_delivery(uuid) from public;
grant execute on function public.market_customer_confirm_delivery(uuid) to authenticated;

create or replace function public.market_customer_report_delivery_issue(
  p_batch_id uuid,
  p_note text
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if coalesce(trim(p_note),'')='' then raise exception 'กรุณาระบุปัญหาที่พบ'; end if;

  update public.market_delivery_batches b
     set delivery_issue_status='open',
         delivery_issue_note=left(trim(p_note),500),
         delivery_issue_at=now(),
         proof_hold=true,
         proof_delete_after=null,
         updated_at=now()
   where b.id=p_batch_id
     and b.delivery_arrived_at is not null
     and exists(
       select 1 from public.market_delivery_groups g
       where g.id=b.group_id and g.customer_id=auth.uid()
     );
  if not found then raise exception 'ไม่สามารถแจ้งปัญหารายการนี้ได้'; end if;
  return true;
end $$;
revoke all on function public.market_customer_report_delivery_issue(uuid,text) from public;
grant execute on function public.market_customer_report_delivery_issue(uuid,text) to authenticated;

-- Admin resolves a dispute. Photo enters a fresh 3-day retention window afterwards.
create or replace function public.market_admin_resolve_delivery_issue(p_batch_id uuid,p_note text default null)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(select 1 from public.market_profiles p where p.id=auth.uid() and p.role='admin') then
    raise exception 'admin only';
  end if;
  update public.market_delivery_batches
     set delivery_issue_status='resolved',
         delivery_issue_note=coalesce(nullif(trim(p_note),''),delivery_issue_note),
         proof_hold=false,
         proof_delete_after=now()+interval '3 days',
         updated_at=now()
   where id=p_batch_id;
  return found;
end $$;
revoke all on function public.market_admin_resolve_delivery_issue(uuid,text) from public;
grant execute on function public.market_admin_resolve_delivery_issue(uuid,text) to authenticated;

-- Cleanup helper for service-role Edge Function.
create or replace function public.market_delivery_proofs_due_for_cleanup(p_limit integer default 100)
returns table(batch_id uuid,proof_path text)
language sql
security definer
set search_path=public
as $$
  select b.id,b.proof_path
  from public.market_delivery_batches b
  where b.proof_path is not null
    and b.proof_deleted_at is null
    and coalesce(b.proof_hold,false)=false
    and b.proof_delete_after is not null
    and b.proof_delete_after<=now()
  order by b.proof_delete_after
  limit greatest(1,least(coalesce(p_limit,100),500));
$$;
revoke all on function public.market_delivery_proofs_due_for_cleanup(integer) from public,anon,authenticated;
grant execute on function public.market_delivery_proofs_due_for_cleanup(integer) to service_role;

create or replace function public.market_mark_delivery_proof_deleted(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.market_delivery_batches
     set proof_deleted_at=now(),proof_path=null,updated_at=now()
   where id=p_batch_id and coalesce(proof_hold,false)=false;
end $$;
revoke all on function public.market_mark_delivery_proof_deleted(uuid) from public,anon,authenticated;
grant execute on function public.market_mark_delivery_proof_deleted(uuid) to service_role;

-- Realtime for customer/shop UI when rider reaches destination or customer confirms.
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='market_delivery_batches') then
    alter publication supabase_realtime add table public.market_delivery_batches;
  end if;
end $$;

select 'v0.5.20 rider proof of delivery ready' as result;
