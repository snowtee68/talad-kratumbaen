
-- Talad Kratumbaen v0.5.9
-- Delivery batches + partial readiness + rider tracking + shop seen + product limit 100

-- =========================================================
-- 1) PRODUCT LIMIT: 100 PRODUCTS / SHOP
-- =========================================================
create or replace function public.market_limit_products_per_shop()
returns trigger
language plpgsql
set search_path=public
as $$
declare v_count integer;
begin
  if tg_op='INSERT' then
    select count(*) into v_count from public.market_products where shop_id=new.shop_id;
    if v_count >= 100 then
      raise exception 'ร้านหนึ่งเพิ่มสินค้าได้สูงสุด 100 รายการ';
    end if;
  elsif tg_op='UPDATE' and new.shop_id is distinct from old.shop_id then
    select count(*) into v_count from public.market_products where shop_id=new.shop_id and id<>new.id;
    if v_count >= 100 then
      raise exception 'ร้านหนึ่งเพิ่มสินค้าได้สูงสุด 100 รายการ';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_market_limit_products_per_shop on public.market_products;
create trigger trg_market_limit_products_per_shop
before insert or update of shop_id on public.market_products
for each row execute function public.market_limit_products_per_shop();

-- =========================================================
-- 2) SHOP "SEEN ORDER" STATE
-- =========================================================
alter table public.market_orders
  add column if not exists shop_viewed_at timestamptz;

create or replace function public.market_shop_mark_orders_viewed(p_order_ids uuid[])
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_count integer;
begin
  update public.market_orders o
     set shop_viewed_at=coalesce(o.shop_viewed_at,now()),
         updated_at=now()
   where o.id=any(p_order_ids)
     and exists (
       select 1 from public.market_shops s
       where s.id=o.shop_id and s.owner_id=auth.uid()
     );
  get diagnostics v_count=row_count;
  return v_count;
end $$;

revoke all on function public.market_shop_mark_orders_viewed(uuid[]) from public;
grant execute on function public.market_shop_mark_orders_viewed(uuid[]) to authenticated;

-- =========================================================
-- 3) DELIVERY BATCHES
-- One checkout group can now have multiple rider trips.
-- This allows ready shops A+B to go first while shop C waits.
-- =========================================================
create table if not exists public.market_delivery_batches (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.market_delivery_groups(id) on delete cascade,
  rider_job_id uuid,
  status text not null default 'creating',
  rider_name text,
  rider_phone text,
  rider_user_id uuid,
  delivery_fee numeric(12,2),
  distance_km numeric(10,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  pickup_started_at timestamptz,
  picked_up_at timestamptz,
  delivering_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);

alter table public.market_delivery_batches
  drop constraint if exists market_delivery_batches_status_check;
alter table public.market_delivery_batches
  add constraint market_delivery_batches_status_check
  check (status in (
    'creating','waiting_rider','accepted','pickup_started',
    'picked_up','delivering','completed','cancelled'
  ));

create unique index if not exists market_delivery_batches_rider_job_unique
  on public.market_delivery_batches(rider_job_id)
  where rider_job_id is not null;

create index if not exists market_delivery_batches_group_idx
  on public.market_delivery_batches(group_id,created_at desc);

create table if not exists public.market_delivery_batch_orders (
  batch_id uuid not null references public.market_delivery_batches(id) on delete cascade,
  order_id uuid not null references public.market_orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(batch_id,order_id)
);

-- An order can be in only one active/real delivery batch.
create unique index if not exists market_delivery_batch_orders_order_unique
  on public.market_delivery_batch_orders(order_id);

alter table public.market_delivery_batches enable row level security;
alter table public.market_delivery_batch_orders enable row level security;

drop policy if exists "delivery batch participants read" on public.market_delivery_batches;
create policy "delivery batch participants read"
on public.market_delivery_batches for select to authenticated
using (
  exists (
    select 1 from public.market_delivery_groups g
    where g.id=group_id and g.customer_id=auth.uid()
  )
  or exists (
    select 1
    from public.market_delivery_batch_orders bo
    join public.market_orders o on o.id=bo.order_id
    join public.market_shops s on s.id=o.shop_id
    where bo.batch_id=id and s.owner_id=auth.uid()
  )
  or rider_user_id=auth.uid()
);

drop policy if exists "delivery batch order participants read" on public.market_delivery_batch_orders;
create policy "delivery batch order participants read"
on public.market_delivery_batch_orders for select to authenticated
using (
  exists (
    select 1
    from public.market_delivery_batches b
    join public.market_delivery_groups g on g.id=b.group_id
    where b.id=batch_id and g.customer_id=auth.uid()
  )
  or exists (
    select 1
    from public.market_orders o
    join public.market_shops s on s.id=o.shop_id
    where o.id=order_id and s.owner_id=auth.uid()
  )
  or exists (
    select 1 from public.market_delivery_batches b
    where b.id=batch_id and b.rider_user_id=auth.uid()
  )
);

-- =========================================================
-- 4) CUSTOMER CREATES ONE DELIVERY TRIP FROM READY SHOPS ONLY
-- =========================================================
create or replace function public.market_create_delivery_batch(
  p_group_id uuid,
  p_order_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_batch uuid;
  v_requested integer;
  v_valid integer;
begin
  if p_order_ids is null or coalesce(array_length(p_order_ids,1),0)=0 then
    raise exception 'ไม่มีร้านที่พร้อมส่ง';
  end if;

  if not exists (
    select 1 from public.market_delivery_groups g
    where g.id=p_group_id
      and g.customer_id=auth.uid()
      and g.fulfillment_method='delivery'
  ) then
    raise exception 'ไม่มีสิทธิ์สร้างงานจัดส่งนี้';
  end if;

  v_requested:=array_length(p_order_ids,1);

  select count(*) into v_valid
  from public.market_orders o
  where o.id=any(p_order_ids)
    and o.group_id=p_group_id
    and o.customer_id=auth.uid()
    and o.status='ready'
    and not exists (
      select 1 from public.market_delivery_batch_orders bo
      join public.market_delivery_batches b on b.id=bo.batch_id
      where bo.order_id=o.id and b.status<>'cancelled'
    );

  if v_valid<>v_requested then
    raise exception 'มีบางร้านยังไม่พร้อม หรือถูกนำไปสร้างงานวินแล้ว';
  end if;

  insert into public.market_delivery_batches(group_id,status)
  values(p_group_id,'creating')
  returning id into v_batch;

  insert into public.market_delivery_batch_orders(batch_id,order_id)
  select v_batch,unnest(p_order_ids);

  return v_batch;
end $$;

revoke all on function public.market_create_delivery_batch(uuid,uuid[]) from public;
grant execute on function public.market_create_delivery_batch(uuid,uuid[]) to authenticated;

create or replace function public.market_attach_delivery_batch(
  p_batch_id uuid,
  p_rider_job_id uuid,
  p_delivery_fee numeric,
  p_distance_km numeric
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists (
    select 1
    from public.market_delivery_batches b
    join public.market_delivery_groups g on g.id=b.group_id
    where b.id=p_batch_id and g.customer_id=auth.uid() and b.status='creating'
  ) then
    raise exception 'ไม่มีสิทธิ์หรือรอบจัดส่งไม่พร้อม';
  end if;

  update public.market_delivery_batches
     set rider_job_id=p_rider_job_id,
         delivery_fee=p_delivery_fee,
         distance_km=p_distance_km,
         status='waiting_rider',
         updated_at=now()
   where id=p_batch_id;
  return true;
end $$;

revoke all on function public.market_attach_delivery_batch(uuid,uuid,numeric,numeric) from public;
grant execute on function public.market_attach_delivery_batch(uuid,uuid,numeric,numeric) to authenticated;

create or replace function public.market_cancel_delivery_batch_creation(p_batch_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.market_delivery_batches b
     set status='cancelled',cancelled_at=now(),updated_at=now()
   where b.id=p_batch_id
     and b.status='creating'
     and exists (
       select 1 from public.market_delivery_groups g
       where g.id=b.group_id and g.customer_id=auth.uid()
     );
  return found;
end $$;

revoke all on function public.market_cancel_delivery_batch_creation(uuid) from public;
grant execute on function public.market_cancel_delivery_batch_creation(uuid) to authenticated;

-- =========================================================
-- 5) RIDER STATUS / CONTACT BRIDGE
-- Rider app can call this RPC with its rider job id.
-- First authenticated rider to update the job becomes the rider owner.
-- =========================================================
create or replace function public.market_rider_update_delivery_batch(
  p_rider_job_id uuid,
  p_status text,
  p_rider_name text default null,
  p_rider_phone text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  b public.market_delivery_batches%rowtype;
begin
  if p_status not in ('accepted','pickup_started','picked_up','delivering','completed','cancelled') then
    raise exception 'สถานะวินไม่ถูกต้อง';
  end if;

  select * into b
  from public.market_delivery_batches
  where rider_job_id=p_rider_job_id
  for update;

  if b.id is null then raise exception 'ไม่พบงานจัดส่ง'; end if;

  if b.rider_user_id is not null and b.rider_user_id<>auth.uid() then
    raise exception 'งานนี้เป็นของวินคนอื่น';
  end if;

  update public.market_delivery_batches
     set rider_user_id=coalesce(rider_user_id,auth.uid()),
         rider_name=coalesce(nullif(trim(p_rider_name),''),rider_name),
         rider_phone=coalesce(nullif(regexp_replace(coalesce(p_rider_phone,''),'[^0-9+]','','g'),''),rider_phone),
         status=p_status,
         accepted_at=case when p_status='accepted' then coalesce(accepted_at,now()) else accepted_at end,
         pickup_started_at=case when p_status='pickup_started' then coalesce(pickup_started_at,now()) else pickup_started_at end,
         picked_up_at=case when p_status='picked_up' then coalesce(picked_up_at,now()) else picked_up_at end,
         delivering_at=case when p_status='delivering' then coalesce(delivering_at,now()) else delivering_at end,
         completed_at=case when p_status='completed' then coalesce(completed_at,now()) else completed_at end,
         cancelled_at=case when p_status='cancelled' then coalesce(cancelled_at,now()) else cancelled_at end,
         updated_at=now()
   where id=b.id;

  return jsonb_build_object('batch_id',b.id,'status',p_status);
end $$;

revoke all on function public.market_rider_update_delivery_batch(uuid,text,text,text) from public;
grant execute on function public.market_rider_update_delivery_batch(uuid,text,text,text) to authenticated;

-- =========================================================
-- 6) AUTO-BRIDGE IF EXISTING RIDER SYSTEM USES public.rider_jobs
-- Does not assume columns exist: it reads NEW as JSON.
-- =========================================================
create or replace function public.market_sync_rider_job_to_delivery()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  j jsonb:=to_jsonb(new);
  v_job uuid;
  raw_status text;
  mapped text;
  v_name text;
  v_phone text;
begin
  begin
    v_job:=(j->>'id')::uuid;
  exception when others then
    return new;
  end;

  raw_status:=lower(coalesce(j->>'status',''));
  mapped:=case
    when raw_status in ('accepted','assigned','claimed') then 'accepted'
    when raw_status in ('pickup_started','to_pickup','heading_to_pickup') then 'pickup_started'
    when raw_status in ('picked_up','collected','pickup_complete') then 'picked_up'
    when raw_status in ('delivering','in_transit','on_delivery','to_dropoff') then 'delivering'
    when raw_status in ('completed','delivered','done') then 'completed'
    when raw_status in ('cancelled','canceled') then 'cancelled'
    else null
  end;

  v_name:=coalesce(j->>'rider_name',j->>'driver_name',j->>'courier_name');
  v_phone:=coalesce(j->>'rider_phone',j->>'driver_phone',j->>'courier_phone');

  if mapped is not null then
    update public.market_delivery_batches
       set status=mapped,
           rider_name=coalesce(nullif(v_name,''),rider_name),
           rider_phone=coalesce(nullif(v_phone,''),rider_phone),
           accepted_at=case when mapped='accepted' then coalesce(accepted_at,now()) else accepted_at end,
           pickup_started_at=case when mapped='pickup_started' then coalesce(pickup_started_at,now()) else pickup_started_at end,
           picked_up_at=case when mapped='picked_up' then coalesce(picked_up_at,now()) else picked_up_at end,
           delivering_at=case when mapped='delivering' then coalesce(delivering_at,now()) else delivering_at end,
           completed_at=case when mapped='completed' then coalesce(completed_at,now()) else completed_at end,
           cancelled_at=case when mapped='cancelled' then coalesce(cancelled_at,now()) else cancelled_at end,
           updated_at=now()
     where rider_job_id=v_job;
  end if;

  return new;
end $$;

do $$
begin
  if to_regclass('public.rider_jobs') is not null then
    execute 'drop trigger if exists trg_market_sync_rider_job on public.rider_jobs';
    execute 'create trigger trg_market_sync_rider_job after insert or update on public.rider_jobs for each row execute function public.market_sync_rider_job_to_delivery()';
  end if;
end $$;

select
  'v0.5.9 delivery integration ready' as result,
  to_regclass('public.rider_jobs') is not null as rider_jobs_auto_bridge_enabled;
