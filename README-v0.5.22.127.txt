V0.5.22.127

1) Notification click routing
- Generic Push payloads no longer fall back to the homepage.
- order_tab=auto checks for seller orders needing action (pending_shop/payment_review) first.
- If seller work exists, opens Seller Orders directly; otherwise opens customer orders.

2) Delivery fare
- Checkout estimate is persisted on market_delivery_groups.
- New delivery batches inherit the estimate immediately.
- Customer UI falls back to the group estimate before rider_jobs.
- Rider UI falls back to batch fee and finally recalculates from distance/pickup count.

Run upgrade-v0.5.22.127-push-route-and-fare-source.sql once in Supabase SQL Editor.
