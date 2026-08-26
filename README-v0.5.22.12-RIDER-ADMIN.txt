V0.5.22.12 - Rider Admin Registry

1) Run upgrade-v0.5.22.12-rider-admin-registry.sql once in Supabase SQL Editor.
2) Deploy index.html, app.js, order.js and sw.js.
3) Login as Admin -> Rider / จัดการวิน / ไรเดอร์.

What it does:
- Automatically remembers rider name + phone when a Market delivery batch receives rider contact data.
- Backfills riders from historical Market delivery batches.
- Admin can add riders in advance and mark registry entries enabled/disabled.
- Admin sees rider phone, active-job count, successful-job count, and recent Delivery jobs.
- Existing Delivery acceptance/status flow is not changed.

Important: "disabled" here is an Admin registry status only. V0.5.22.12 does NOT block the external rider system from accepting a job, because that would require changing the rider application's own acceptance flow and could break live deliveries.
