-- V0.5.22.84 – Backend Rider Push Webhook / Idempotency
-- Run ONCE in Supabase SQL Editor.
--
-- Purpose:
-- Keep rider push delivery idempotent when both Database Webhook and browser fallback
-- reach send-rider-push around the same time.
--
-- No change to orders, fares, rider acceptance, pickup, or auto-rider creation.

begin;

create table if not exists public.market_rider_push_events (
  event_key text primary key,
  event_type text not null,
  batch_id uuid,
  order_id uuid,
  sent_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists market_rider_push_events_batch_idx
  on public.market_rider_push_events(batch_id, sent_at desc);

alter table public.market_rider_push_events enable row level security;

-- This table is backend-only. Do not grant browser roles access.
revoke all on table public.market_rider_push_events from public, anon, authenticated;

comment on table public.market_rider_push_events is
  'Backend-only idempotency ledger for rider Web Push events. V0.5.22.84';

commit;

select 'v0.5.22.84 backend rider push idempotency ready' as result;
