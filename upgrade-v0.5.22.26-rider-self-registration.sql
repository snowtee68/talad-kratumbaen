-- V0.5.22.26 Rider Self Registration + Admin Approval
-- รันใน Supabase SQL Editor 1 ครั้ง
-- ไม่เปลี่ยน logic rider_jobs / delivery เดิม

create table if not exists public.market_rider_applications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  phone text not null,
  service_area text not null,
  vehicle_plate text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.market_rider_applications enable row level security;

drop policy if exists market_rider_applications_select_own on public.market_rider_applications;
create policy market_rider_applications_select_own
on public.market_rider_applications for select
to authenticated
using (user_id=auth.uid());

revoke all on public.market_rider_applications from anon, authenticated;

create or replace function public.market_apply_as_rider(
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
  v_status text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if char_length(v_name)<2 or char_length(v_phone)<8 or char_length(v_area)<2 or char_length(v_plate)<2 then
    raise exception 'please complete rider application';
  end if;

  select status into v_status from public.market_rider_applications where user_id=auth.uid();
  if v_status='approved' then raise exception 'rider already approved'; end if;
  if v_status='pending' then raise exception 'application is pending review'; end if;

  insert into public.market_rider_applications(
    user_id,display_name,phone,service_area,vehicle_plate,status,admin_note,reviewed_by,reviewed_at,created_at,updated_at
  ) values(
    auth.uid(),v_name,v_phone,v_area,v_plate,'pending',null,null,null,now(),now()
  )
  on conflict(user_id) do update set
    display_name=excluded.display_name,
    phone=excluded.phone,
    service_area=excluded.service_area,
    vehicle_plate=excluded.vehicle_plate,
    status='pending',
    admin_note=null,
    reviewed_by=null,
    reviewed_at=null,
    updated_at=now();

  return jsonb_build_object('ok',true,'status','pending');
end $$;

revoke all on function public.market_apply_as_rider(text,text,text,text) from public;
grant execute on function public.market_apply_as_rider(text,text,text,text) to authenticated;

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
        'user_id',user_id,
        'display_name',display_name,
        'phone',phone,
        'service_area',service_area,
        'vehicle_plate',vehicle_plate,
        'status',status,
        'admin_note',admin_note,
        'created_at',created_at,
        'updated_at',updated_at,
        'reviewed_at',reviewed_at
      )
      from public.market_rider_applications
      where user_id=auth.uid()
    ),
    '{}'::jsonb
  );
$$;

revoke all on function public.market_my_rider_application() from public;
grant execute on function public.market_my_rider_application() to authenticated;

create or replace function public.market_admin_rider_applications()
returns table(
  user_id uuid,
  display_name text,
  phone text,
  service_area text,
  vehicle_plate text,
  status text,
  admin_note text,
  created_at timestamptz,
  reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not exists(select 1 from public.market_profiles where id=auth.uid() and role='admin') then
    raise exception 'admin only';
  end if;

  return query
  select a.user_id,a.display_name,a.phone,a.service_area,a.vehicle_plate,a.status,a.admin_note,a.created_at,a.reviewed_at
  from public.market_rider_applications a
  order by case a.status when 'pending' then 0 when 'approved' then 1 else 2 end, a.created_at desc;
end $$;

revoke all on function public.market_admin_rider_applications() from public;
grant execute on function public.market_admin_rider_applications() to authenticated;

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
  if not exists(select 1 from public.market_profiles where id=auth.uid() and role='admin') then
    raise exception 'admin only';
  end if;

  select * into v_app
  from public.market_rider_applications
  where user_id=p_user_id
  for update;

  if not found then raise exception 'application not found'; end if;

  update public.market_rider_applications
  set status=case when p_approve then 'approved' else 'rejected' end,
      admin_note=nullif(trim(coalesce(p_admin_note,'')),''),
      reviewed_by=auth.uid(),
      reviewed_at=now(),
      updated_at=now()
  where user_id=p_user_id;

  if p_approve then
    -- ใช้ทะเบียนวินเดิมของระบบ เพื่อไม่สร้าง rider registry ซ้ำ
    perform public.market_admin_upsert_rider(v_app.display_name,v_app.phone);
  end if;

  return jsonb_build_object('ok',true,'status',case when p_approve then 'approved' else 'rejected' end);
end $$;

revoke all on function public.market_admin_decide_rider_application(uuid,boolean,text) from public;
grant execute on function public.market_admin_decide_rider_application(uuid,boolean,text) to authenticated;

notify pgrst, 'reload schema';

select 'v0.5.22.26 rider self registration ready' as result;
