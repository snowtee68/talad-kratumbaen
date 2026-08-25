V0.5.20.57 SAFE ORDER BADGE FIX
Base: V0.5.20.56.

Root cause:
The Order button badge was showing local unread-notification events, not the actual number of current seller orders.
Therefore an order could exist in the shop but the badge could remain hidden/0, especially after initial sync or after opening notifications.

Fix:
- Badge now shows actual current seller orders requiring shop attention.
- Counts statuses: pending_shop + payment_review.
- Uses the same existing seller order query; no new database/RPC/RLS logic.
- Opening the Order area no longer makes the badge disappear while actionable orders still exist.
- Existing sound/push improvements from V0.5.20.56 retained.

No SQL. No RLS. No order creation/status logic changes.
