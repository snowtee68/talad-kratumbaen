-- V0.5.22.63 Rider Delivery Proof + Notification Support
-- รันใน Supabase SQL Editor 1 ครั้ง

-- Bucket รูปหลักฐานส่งมอบ
insert into storage.buckets(id,name,public)
values('rider-delivery-proof','rider-delivery-proof',false)
on conflict(id) do nothing;

-- วินอัปโหลดได้เฉพาะ path: batch_id / auth.uid() / filename
drop policy if exists market_rider_delivery_proof_insert_own on storage.objects;
create policy market_rider_delivery_proof_insert_own
on storage.objects for insert
to authenticated
with check (
  bucket_id='rider-delivery-proof'
  and (storage.foldername(name))[2]=auth.uid()::text
);

drop policy if exists market_rider_delivery_proof_select_own on storage.objects;
create policy market_rider_delivery_proof_select_own
on storage.objects for select
to authenticated
using (
  bucket_id='rider-delivery-proof'
  and (storage.foldername(name))[2]=auth.uid()::text
);

drop policy if exists market_rider_delivery_proof_delete_own on storage.objects;
create policy market_rider_delivery_proof_delete_own
on storage.objects for delete
to authenticated
using (
  bucket_id='rider-delivery-proof'
  and (storage.foldername(name))[2]=auth.uid()::text
);

create or replace function public.market_rider_submit_delivery_proof(
  p_batch_id uuid,
  p_proof_path text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_name text;
  v_phone text;
  v_ok boolean:=false;
  v_status text;
  v_path text:=trim(coalesce(p_proof_path,''));
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if v_path='' then raise exception 'proof path required'; end if;
  if position('/'||auth.uid()::text||'/' in '/'||v_path)=0 then
    raise exception 'invalid proof path';
  end if;

  select a.display_name,a.phone,(a.status='approved')
  into v_name,v_phone,v_ok
  from public.market_rider_applications a
  where a.user_id=auth.uid();

  if not coalesce(v_ok,false) then
    select rp.display_name,rp.phone,(coalesce(rp.approval_status,'approved')='approved')
    into v_name,v_phone,v_ok
    from public.rider_profiles rp
    where rp.user_id=auth.uid()
    limit 1;
  end if;

  if not coalesce(v_ok,false) then raise exception 'approved rider only'; end if;

  select b.status into v_status
  from public.market_delivery_batches b
  where b.id=p_batch_id
    and b.accepted_at is not null
    and (
      lower(coalesce(b.rider_phone,''))=lower(coalesce(v_phone,''))
      or lower(coalesce(b.rider_name,''))=lower(coalesce(v_name,''))
    )
  for update;

  if not found then raise exception 'rider job not found or not owned by this rider'; end if;
  if v_status<>'delivering' then raise exception 'delivery is not in delivering status'; end if;

  update public.market_delivery_batches
  set proof_path=v_path,
      proof_uploaded_at=now(),
      delivery_arrived_at=coalesce(delivery_arrived_at,now())
  where id=p_batch_id;

  return jsonb_build_object(
    'ok',true,
    'batch_id',p_batch_id,
    'proof_path',v_path,
    'delivery_arrived_at',now()
  );
end $$;

revoke all on function public.market_rider_submit_delivery_proof(uuid,text) from public;
grant execute on function public.market_rider_submit_delivery_proof(uuid,text) to authenticated;

notify pgrst, 'reload schema';

select 'v0.5.22.63 rider proof + notifications ready' as result;
