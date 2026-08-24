
-- V0.5.20.35 — Seller Order Feed RPC
-- Server-side feed for shop owners. Guest customers are supported because
-- access is validated against shop.owner_id, not customer account type.

create or replace function public.market_shop_owner_order_feed(
  p_shop_id uuid,
  p_limit integer default 50
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'login required';
  end if;

  select exists(
    select 1 from public.market_profiles p
    where p.id=v_uid and p.role='admin'
  ) into v_is_admin;

  if not v_is_admin and not exists(
    select 1 from public.market_shops s
    where s.id=p_shop_id and s.owner_id=v_uid
  ) then
    raise exception 'ไม่มีสิทธิ์ดูออเดอร์ของร้านนี้';
  end if;

  select coalesce(jsonb_agg(order_row order by (order_row->>'created_at')::timestamptz desc),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id',o.id,
      'subtotal',o.subtotal,
      'status',o.status,
      'payment_ref',o.payment_ref,
      'payment_slip_path',o.payment_slip_path,
      'payment_submitted_at',o.payment_submitted_at,
      'response_due_at',o.response_due_at,
      'paid_at',o.paid_at,
      'customer_cancel_reason',o.customer_cancel_reason,
      'customer_cancelled_at',o.customer_cancelled_at,
      'rejection_reason',o.rejection_reason,
      'shop_response_due_at',o.shop_response_due_at,
      'shop_accepted_at',o.shop_accepted_at,
      'shop_viewed_at',o.shop_viewed_at,
      'pickup_completed_at',o.pickup_completed_at,
      'revision_note',o.revision_note,
      'revision_subtotal',o.revision_subtotal,
      'revision_requested_at',o.revision_requested_at,
      'revision_confirmed_at',o.revision_confirmed_at,
      'refund_required',o.refund_required,
      'refund_status',o.refund_status,
      'refund_amount',o.refund_amount,
      'refund_ref',o.refund_ref,
      'refund_slip_path',o.refund_slip_path,
      'refund_submitted_at',o.refund_submitted_at,
      'refund_confirmed_at',o.refund_confirmed_at,
      'refund_destination_type',o.refund_destination_type,
      'refund_destination_promptpay_type',o.refund_destination_promptpay_type,
      'refund_destination_value',o.refund_destination_value,
      'refund_destination_bank',o.refund_destination_bank,
      'refund_destination_name',o.refund_destination_name,
      'refund_destination_submitted_at',o.refund_destination_submitted_at,
      'created_at',o.created_at,
      'customer_id',o.customer_id,
      'group_id',o.group_id,
      'group',case when g.id is null then null else jsonb_build_object(
        'id',g.id,
        'customer_name',g.customer_name,
        'customer_phone',g.customer_phone,
        'delivery_address',g.delivery_address,
        'fulfillment_method',g.fulfillment_method,
        'pickup_requested_at',g.pickup_requested_at,
        'status',g.status,
        'batches',coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id',b.id,
              'status',b.status,
              'rider_job_id',b.rider_job_id,
              'rider_name',b.rider_name,
              'rider_phone',b.rider_phone,
              'delivery_fee',b.delivery_fee,
              'distance_km',b.distance_km,
              'accepted_at',b.accepted_at,
              'pickup_started_at',b.pickup_started_at,
              'picked_up_at',b.picked_up_at,
              'delivering_at',b.delivering_at,
              'delivery_arrived_at',b.delivery_arrived_at,
              'proof_path',b.proof_path,
              'proof_uploaded_at',b.proof_uploaded_at,
              'customer_confirmed_at',b.customer_confirmed_at,
              'delivery_issue_status',b.delivery_issue_status,
              'delivery_issue_note',b.delivery_issue_note,
              'delivery_issue_at',b.delivery_issue_at,
              'proof_deleted_at',b.proof_deleted_at,
              'completed_at',b.completed_at,
              'batch_orders',coalesce((
                select jsonb_agg(jsonb_build_object('order_id',bo.order_id))
                from public.market_delivery_batch_orders bo
                where bo.batch_id=b.id
              ),'[]'::jsonb)
            )
            order by b.created_at desc
          )
          from public.market_delivery_batches b
          where b.group_id=g.id
        ),'[]'::jsonb)
      ) end,
      'items',coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_name',i.product_name,
          'unit_price',i.unit_price,
          'qty',i.qty,
          'options_json',i.options_json,
          'note',i.note
        ) order by i.created_at)
        from public.market_order_items i
        where i.order_id=o.id
      ),'[]'::jsonb)
    ) as order_row
    from public.market_orders o
    left join public.market_delivery_groups g on g.id=o.group_id
    where o.shop_id=p_shop_id
    order by o.created_at desc
    limit greatest(1,least(coalesce(p_limit,50),100))
  ) q;

  return v_result;
end $$;

revoke all on function public.market_shop_owner_order_feed(uuid,integer) from public;
grant execute on function public.market_shop_owner_order_feed(uuid,integer) to authenticated;

select 'v0.5.20.35 seller order feed rpc ready' as result;
