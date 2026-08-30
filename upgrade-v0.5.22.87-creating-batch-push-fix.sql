-- V0.5.22.87 – Creating Batch Push Fix
--
-- Real production data shows a new rider waiting job as:
--   status='creating'
--   accepted_at IS NULL
--   rider_job_id IS NULL
--
-- V0.5.22.85 incorrectly waited for rider_job_id, so the backend Push never fired.
--
-- This repair:
-- 1) Sends rider Push immediately AFTER INSERT of an open delivery batch.
-- 2) Does NOT require rider_job_id.
-- 3) Keeps UPDATE as a fallback only when a row transitions into an open/waiting state.
-- 4) Never blocks the order/rider flow if Push fails.
-- 5) Existing market_rider_push_events idempotency prevents duplicate notifications.

begin;

create or replace function public.market_rider_push_pgnet_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,extensions,net,vault
as $$
declare
  v_secret text;
  v_request_id bigint;
  v_is_open boolean;
  v_was_open boolean := false;
begin
  v_is_open :=
    new.accepted_at is null
    and new.status in ('creating','waiting_rider','created','open');

  if not v_is_open then
    return new;
  end if;

  if tg_op='UPDATE' then
    v_was_open :=
      old.accepted_at is null
      and old.status in ('creating','waiting_rider','created','open');

    -- The INSERT already sends the Push for normal flow.
    -- UPDATE is only a fallback when the batch newly enters an open state.
    if v_was_open then
      return new;
    end if;
  end if;

  select decrypted_secret
    into v_secret
  from vault.decrypted_secrets
  where name='rider_push_webhook_secret'
  order by updated_at desc nulls last, created_at desc
  limit 1;

  if nullif(v_secret,'') is null then
    raise warning 'Rider Push skipped: Vault secret rider_push_webhook_secret not found';
    return new;
  end if;

  select net.http_post(
    url := 'https://ycimxcfvkmrywwxmmxfb.supabase.co/functions/v1/send-rider-push',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-rider-webhook-secret',v_secret
    ),
    body := jsonb_build_object(
      'source','pg_net_trigger',
      'event','rider_job_created',
      'batch_id',new.id,
      'group_id',new.group_id,
      'rider_job_id',new.rider_job_id,
      'status',new.status,
      'accepted_at',new.accepted_at
    ),
    timeout_milliseconds := 5000
  ) into v_request_id;

  raise log 'Rider Push pg_net queued request_id=% batch_id=% status=% rider_job_id=%',
    v_request_id,new.id,new.status,new.rider_job_id;

  return new;
exception
  when others then
    -- Push is auxiliary. Never break order creation / rider dispatch.
    raise warning 'Rider Push pg_net trigger failed for batch %: %',new.id,sqlerrm;
    return new;
end
$$;

drop trigger if exists trg_market_rider_push_pgnet on public.market_delivery_batches;

create trigger trg_market_rider_push_pgnet
after insert or update of status,accepted_at,rider_job_id
on public.market_delivery_batches
for each row
execute function public.market_rider_push_pgnet_trigger();

commit;

select 'v0.5.22.87 creating batch push fix ready' as result;
