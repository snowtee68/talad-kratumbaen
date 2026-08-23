-- V0.5.20 schedule proof cleanup (run AFTER deploying rider-proof-cleanup Edge Function)
-- Required Edge Function secret: RIDER_PROOF_CLEANUP_SECRET
-- This SQL uses Vault values below; replace PROJECT_REF only if this project changes.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- IMPORTANT: set the same random secret in Edge Function RIDER_PROOF_CLEANUP_SECRET and here.
-- For this project use the supplied value in README.
do $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name='rider_proof_cleanup_url' order by created_at desc limit 1;
  if v_id is null then
    perform vault.create_secret('https://ycimxcfvkmrywwxmmxfb.supabase.co/functions/v1/rider-proof-cleanup','rider_proof_cleanup_url','Proof cleanup function URL');
  else
    perform vault.update_secret(v_id,'https://ycimxcfvkmrywwxmmxfb.supabase.co/functions/v1/rider-proof-cleanup','rider_proof_cleanup_url','Proof cleanup function URL');
  end if;

  select id into v_id from vault.secrets where name='rider_proof_cleanup_secret' order by created_at desc limit 1;
  if v_id is null then
    perform vault.create_secret('snowtee_proof_cleanup_2026_M4qT8nV2xK7pR5wL9cH3sB6dF1aZ','rider_proof_cleanup_secret','Proof cleanup shared secret');
  else
    perform vault.update_secret(v_id,'snowtee_proof_cleanup_2026_M4qT8nV2xK7pR5wL9cH3sB6dF1aZ','rider_proof_cleanup_secret','Proof cleanup shared secret');
  end if;
end $$;

select cron.unschedule(jobid) from cron.job where jobname='rider-proof-cleanup-hourly';
select cron.schedule(
  'rider-proof-cleanup-hourly',
  '17 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='rider_proof_cleanup_url' order by created_at desc limit 1),
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-rider-proof-cleanup-secret',(select decrypted_secret from vault.decrypted_secrets where name='rider_proof_cleanup_secret' order by created_at desc limit 1)
    ),
    timeout_milliseconds := 5000
  );
  $cron$
);
select 'rider proof cleanup scheduled hourly' as result;
