-- V0.5.22.22 Display Name + Review Name
-- รันใน Supabase SQL Editor 1 ครั้ง
-- ไม่เปลี่ยน UUID / Email / เบอร์โทร / Login เดิม

alter table public.market_profiles
  add column if not exists display_name text;

create or replace function public.market_set_my_display_name(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_name text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  v_name := left(regexp_replace(trim(coalesce(p_display_name,'')), '\s+', ' ', 'g'), 50);
  if char_length(v_name) < 2 then raise exception 'display name must contain at least 2 characters'; end if;

  insert into public.market_profiles(id,display_name)
  values(auth.uid(),v_name)
  on conflict(id) do update set display_name=excluded.display_name;

  return jsonb_build_object('ok',true,'display_name',v_name);
end $$;

revoke all on function public.market_set_my_display_name(text) from public;
grant execute on function public.market_set_my_display_name(text) to authenticated;

create or replace function public.market_public_shop_reviews(p_shop_id text)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',r.id,
        'shop_id',r.shop_id,
        'reviewer_name',coalesce(nullif(trim(p.display_name),''),'สมาชิกตลาด'),
        'rating',r.rating,
        'comment',r.comment,
        'status',r.status,
        'created_at',r.created_at
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  from (
    select *
    from public.market_reviews
    where shop_id::text=p_shop_id
      and status='approved'
    order by created_at desc
    limit 50
  ) r
  left join public.market_profiles p on p.id=r.user_id;
$$;

revoke all on function public.market_public_shop_reviews(text) from public;
grant execute on function public.market_public_shop_reviews(text) to anon, authenticated;

notify pgrst, 'reload schema';

select 'v0.5.22.22 display name ready' as result;
