-- V0.5.22.10 Admin Analytics periods
-- Adds calendar-based Today / 7 days / 30 days / All-time reporting.
-- "Today" is based on Asia/Bangkok and starts at 00:00 local time.

create or replace function public.market_analytics_summary_v2(p_period text default '7d')
returns table(event_type text,event_count bigint,unique_sessions bigint)
language plpgsql
security definer
set search_path=public
as $$
declare
  t text;
  v_period text:=lower(coalesce(p_period,'7d'));
  v_today timestamptz:=(date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok');
  v_start timestamptz;
begin
  if not exists(select 1 from public.market_profiles where id=auth.uid() and role='admin') then
    raise exception 'admin only';
  end if;

  if v_period='today' then v_start:=v_today;
  elsif v_period='7d' then v_start:=v_today-interval '6 days';
  elsif v_period='30d' then v_start:=v_today-interval '29 days';
  elsif v_period='all' then v_start:=null;
  else raise exception 'invalid analytics period';
  end if;

  if to_regclass('public.market_analytics_events') is not null then t:='market_analytics_events';
  elsif to_regclass('public.market_events') is not null then t:='market_events';
  elsif to_regclass('public.analytics_events') is not null then t:='analytics_events';
  else return;
  end if;

  if v_start is null then
    return query execute format(
      'select e.event_type::text, count(*)::bigint, count(distinct e.session_id)::bigint from public.%I e group by e.event_type order by e.event_type',t
    );
  else
    return query execute format(
      'select e.event_type::text, count(*)::bigint, count(distinct e.session_id)::bigint from public.%I e where e.created_at >= $1 group by e.event_type order by e.event_type',t
    ) using v_start;
  end if;
exception when undefined_column then
  raise exception 'analytics event table schema is not compatible';
end $$;

create or replace function public.market_analytics_top_shops_v2(p_period text default '7d',p_limit integer default 10)
returns table(shop_id uuid,shop_name text,view_count bigint)
language plpgsql
security definer
set search_path=public
as $$
declare
  t text;
  v_period text:=lower(coalesce(p_period,'7d'));
  v_today timestamptz:=(date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok');
  v_start timestamptz;
  v_limit integer:=greatest(1,least(coalesce(p_limit,10),50));
begin
  if not exists(select 1 from public.market_profiles where id=auth.uid() and role='admin') then
    raise exception 'admin only';
  end if;

  if v_period='today' then v_start:=v_today;
  elsif v_period='7d' then v_start:=v_today-interval '6 days';
  elsif v_period='30d' then v_start:=v_today-interval '29 days';
  elsif v_period='all' then v_start:=null;
  else raise exception 'invalid analytics period';
  end if;

  if to_regclass('public.market_analytics_events') is not null then t:='market_analytics_events';
  elsif to_regclass('public.market_events') is not null then t:='market_events';
  elsif to_regclass('public.analytics_events') is not null then t:='analytics_events';
  else return;
  end if;

  if v_start is null then
    return query execute format(
      'select s.id::uuid, s.name::text, count(*)::bigint from public.%I e join public.market_shops s on s.id=e.shop_id where e.event_type=''shop_view'' and e.shop_id is not null group by s.id,s.name order by count(*) desc,s.name limit $1',t
    ) using v_limit;
  else
    return query execute format(
      'select s.id::uuid, s.name::text, count(*)::bigint from public.%I e join public.market_shops s on s.id=e.shop_id where e.event_type=''shop_view'' and e.shop_id is not null and e.created_at >= $1 group by s.id,s.name order by count(*) desc,s.name limit $2',t
    ) using v_start,v_limit;
  end if;
exception when undefined_column then
  raise exception 'analytics event table schema is not compatible';
end $$;

revoke all on function public.market_analytics_summary_v2(text) from public;
revoke all on function public.market_analytics_top_shops_v2(text,integer) from public;
grant execute on function public.market_analytics_summary_v2(text) to authenticated;
grant execute on function public.market_analytics_top_shops_v2(text,integer) to authenticated;

select 'v0.5.22.10 analytics periods ready' as result;
