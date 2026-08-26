V0.5.22.11 - Global Delivery Switch

1) Run upgrade-v0.5.22.11-global-delivery-switch.sql once in Supabase SQL Editor.
2) Copy/replace index.html, app.js, order.js and sw.js into the project.
3) Deploy/commit normally.

Behavior:
- Admin gets a master switch: "เปิดระบบ Delivery ทั้งระบบ".
- OFF: NEW checkouts are pickup-only. Delivery fields/fare are hidden and delivery-only coupons are not offered.
- ON: each shop immediately returns to its own existing delivery/access configuration.
- Existing orders already created before the switch are NOT rewritten or cancelled. This avoids breaking in-progress orders.
- Per-shop delivery/access settings are never modified by this switch.
