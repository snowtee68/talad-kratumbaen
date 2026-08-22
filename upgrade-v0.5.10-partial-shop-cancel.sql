-- V0.5.10: cancel only one problem shop, keep other shops going
create or replace function public.market_customer_cancel_problem_shop(p_order_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.market_orders%rowtype; j jsonb; v_refund numeric:=0; v_paid boolean:=false;
begin
 select * into o from public.market_orders where id=p_order_id for update;
 if o.id is null then raise exception 'ไม่พบออเดอร์'; end if;
 if o.customer_id<>auth.uid() then raise exception 'ไม่มีสิทธิ์'; end if;
 if o.status in ('cancelled','completed') then raise exception 'ออเดอร์นี้จบแล้ว'; end if;
 if exists(select 1 from public.market_delivery_batch_orders bo join public.market_delivery_batches b on b.id=bo.batch_id where bo.order_id=o.id and b.status not in ('cancelled','creating')) then raise exception 'ออเดอร์ร้านนี้ส่งให้วินแล้ว ไม่สามารถตัดออกได้'; end if;
 j:=to_jsonb(o); v_refund:=coalesce(nullif(j->>'subtotal','')::numeric,0);
 v_paid:=o.status in ('payment_review','preparing','ready') or lower(coalesce(j->>'payment_status','')) in ('paid','verified','approved');
 update public.market_orders set status='cancelled',rejection_reason='ตัดเฉพาะร้าน: '||left(coalesce(nullif(trim(p_reason),''),'ร้านไม่พร้อม'),300),updated_at=now() where id=o.id;
 if v_paid and exists(select 1 from information_schema.columns where table_schema='public' and table_name='market_orders' and column_name='refund_required') then execute 'update public.market_orders set refund_required=true where id=$1' using o.id; end if;
 if v_paid and exists(select 1 from information_schema.columns where table_schema='public' and table_name='market_orders' and column_name='refund_amount') then execute 'update public.market_orders set refund_amount=$1 where id=$2' using v_refund,o.id; end if;
 if v_paid and exists(select 1 from information_schema.columns where table_schema='public' and table_name='market_orders' and column_name='refund_status') then execute 'update public.market_orders set refund_status=''pending'' where id=$1' using o.id; end if;
 delete from public.market_delivery_batch_orders bo using public.market_delivery_batches b where bo.batch_id=b.id and bo.order_id=o.id and b.status='creating';
 return jsonb_build_object('cancelled',true,'refund_required',v_paid,'refund_amount',case when v_paid then v_refund else 0 end);
end $$;
revoke all on function public.market_customer_cancel_problem_shop(uuid,text) from public;
grant execute on function public.market_customer_cancel_problem_shop(uuid,text) to authenticated;
select 'v0.5.10 partial shop cancellation ready' as result;
