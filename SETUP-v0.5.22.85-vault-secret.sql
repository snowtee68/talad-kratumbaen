-- V0.5.22.85 – ONE-TIME VAULT SECRET SETUP
-- Replace PASTE_YOUR_CURRENT_RIDER_PUSH_WEBHOOK_SECRET_HERE locally in SQL Editor.
-- Use the SAME value currently stored in Edge Function secret RIDER_PUSH_WEBHOOK_SECRET.
-- Do NOT commit your edited secret to GitHub.

do $$
declare
  v_id uuid;
begin
  select id into v_id
  from vault.decrypted_secrets
  where name='rider_push_webhook_secret'
  order by updated_at desc nulls last, created_at desc
  limit 1;

  if v_id is null then
    perform vault.create_secret(
      'PASTE_YOUR_CURRENT_RIDER_PUSH_WEBHOOK_SECRET_HERE',
      'rider_push_webhook_secret',
      'V0.5.22.85 pg_net -> send-rider-push authentication'
    );
  else
    perform vault.update_secret(
      v_id,
      'PASTE_YOUR_CURRENT_RIDER_PUSH_WEBHOOK_SECRET_HERE',
      'rider_push_webhook_secret',
      'V0.5.22.85 pg_net -> send-rider-push authentication'
    );
  end if;
end $$;

select name, created_at, updated_at
from vault.decrypted_secrets
where name='rider_push_webhook_secret';
