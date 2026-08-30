-- V0.5.22.85 – pg_net Rider Push Trigger
-- Replaces the Dashboard Database Webhook that cannot be created because
-- schema supabase_functions is missing in this project.
--
-- Prerequisites:
--   1) pg_net enabled (already confirmed)
--   2) Vault available
--   3) Run V0.5.22.84 idempotency SQL first
--   4) Deploy V0.5.22.85 send-rider-push Edge Function
--
-- IMPORTANT:
-- Store the SAME RIDER_PUSH_WEBHOOK_SECRET value in Supabase Vault first,
-- using the Dashboard Vault UI or vault.create_secret(). Do not hard-code it here.

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
begin
  -- Only an open delivery batch with an attached rider job is push-worthy.
  if new.rider_job_id is null
     or new.accepted_at is not null
     or new.status not in ('creating','waiting_rider','created','open') then
    return new;
  end if;

  -- INSERT: fire only if rider_job_id is already present.
  -- UPDATE: fire only when rider_job_id changes from null/different to the current value.
  if tg_op='UPDATE'
     and old.rider_job_id is not distinct from new.rider_job_id then
    return new;
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

  raise log 'Rider Push pg_net queued request_id=% batch_id=%',v_request_id,new.id;
  return new;
exception
  when others then
    -- Never block order/rider business flow because Push failed.
    raise warning 'Rider Push pg_net trigger failed for batch %: %',new.id,sqlerrm;
    return new;
end
$$;

drop trigger if exists trg_market_rider_push_pgnet on public.market_delivery_batches;

create trigger trg_market_rider_push_pgnet
after insert or update of rider_job_id,status,accepted_at
on public.market_delivery_batches
for each row
execute function public.market_rider_push_pgnet_trigger();

commit;

select 'v0.5.22.85 pg_net rider push trigger ready' as result;
