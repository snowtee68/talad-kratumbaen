-- V0.5.11 Realtime Orders
-- Enable market_orders in Supabase Realtime publication only if not already present.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='market_orders'
  ) then
    alter publication supabase_realtime add table public.market_orders;
  end if;
end $$;

select 'v0.5.11 realtime orders ready' as result;
