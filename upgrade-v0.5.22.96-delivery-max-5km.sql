-- V0.5.22.96: enforce a 5 km maximum for newly created/changed Rider jobs.
-- Existing jobs over 5 km remain editable for status updates because the trigger
-- rejects only inserts or changes to distance_km.

create or replace function public.rider_enforce_max_route_5km()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.distance_km is not null and new.distance_km>5 then
    if tg_op='INSERT' then
      raise exception 'ระยะทางรวมตามเส้นทางจริงต้องไม่เกิน 5 กม.';
    elsif old.distance_km is distinct from new.distance_km then
      raise exception 'ระยะทางรวมตามเส้นทางจริงต้องไม่เกิน 5 กม.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_rider_jobs_max_route_5km on public.rider_jobs;
create trigger trg_rider_jobs_max_route_5km
before insert or update of distance_km on public.rider_jobs
for each row execute function public.rider_enforce_max_route_5km();

notify pgrst,'reload schema';
select 'v0.5.22.96 delivery max route 5 km ready' as result;
