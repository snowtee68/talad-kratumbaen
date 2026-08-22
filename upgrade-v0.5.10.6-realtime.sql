-- V0.5.10.6 Realtime publication enablement
-- Safe to run more than once.
do $$
declare t text;
begin
  foreach t in array array[
    'market_orders',
    'market_delivery_groups',
    'market_delivery_batches',
    'market_delivery_batch_orders',
    'rider_jobs',
    'rider_job_stops'
  ]
  loop
    if to_regclass('public.'||t) is not null
       and not exists(
         select 1 from pg_publication_tables
         where pubname='supabase_realtime'
           and schemaname='public'
           and tablename=t
       ) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;

select 'v0.5.10.6 realtime ready' as result;
