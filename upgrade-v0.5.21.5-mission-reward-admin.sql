-- Talad Krathumbaen v0.5.21.5
-- Admin-configurable reward for Mission V1

create table if not exists public.market_mission_settings (
  mission_key text primary key,
  reward_title text not null default '',
  reward_detail text not null default '',
  claim_note text not null default '',
  reward_active boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.market_mission_settings enable row level security;

drop policy if exists "mission settings public read" on public.market_mission_settings;
create policy "mission settings public read"
on public.market_mission_settings for select
to anon, authenticated
using (true);

grant select on public.market_mission_settings to anon, authenticated;
revoke insert, update, delete on public.market_mission_settings from anon, authenticated;

insert into public.market_mission_settings(mission_key)
values ('mission_v1')
on conflict (mission_key) do nothing;

create or replace function public.market_admin_set_mission_reward(
  p_reward_title text default '',
  p_reward_detail text default '',
  p_claim_note text default '',
  p_reward_active boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not exists(select 1 from public.market_profiles where id=auth.uid() and role='admin') then
    raise exception 'admin only';
  end if;
  if p_reward_active and nullif(trim(coalesce(p_reward_title,'')),'') is null then
    raise exception 'กรุณาระบุชื่อรางวัลก่อนเปิดใช้งาน';
  end if;

  insert into public.market_mission_settings(
    mission_key,reward_title,reward_detail,claim_note,reward_active,updated_at,updated_by
  ) values (
    'mission_v1',left(trim(coalesce(p_reward_title,'')),120),left(trim(coalesce(p_reward_detail,'')),500),left(trim(coalesce(p_claim_note,'')),500),coalesce(p_reward_active,false),now(),auth.uid()
  )
  on conflict(mission_key) do update set
    reward_title=excluded.reward_title,
    reward_detail=excluded.reward_detail,
    claim_note=excluded.claim_note,
    reward_active=excluded.reward_active,
    updated_at=now(),
    updated_by=auth.uid();

  return jsonb_build_object('ok',true,'mission_key','mission_v1','reward_active',coalesce(p_reward_active,false));
end $$;

revoke all on function public.market_admin_set_mission_reward(text,text,text,boolean) from public;
grant execute on function public.market_admin_set_mission_reward(text,text,text,boolean) to authenticated;

select 'v0.5.21.5 mission reward admin ready' as result;
