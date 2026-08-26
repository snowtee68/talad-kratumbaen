V0.5.21.3 — ADMIN DELIVERY TOGGLE SQL FIX

Fixes SQL error 42883:
function public.market_shop_activate_order_access(uuid) does not exist

Cause:
V0.5.21.2 tried to REVOKE permissions from the legacy function before guaranteeing
that the function existed.

Fix:
- CREATE OR REPLACE the compatibility function first.
- Then apply REVOKE/GRANT.
- Works whether the old function exists or not.
- Admin Delivery/Selling toggle behavior is unchanged from V0.5.21.2.

IMPORTANT:
Run upgrade-v0.5.21.3-admin-delivery-toggle-sqlfix.sql in Supabase SQL Editor.
After it finishes successfully, deploy this ZIP.

No Order/Payment/Rider/Delivery status logic changes.
Mission V1 remains included.
