V0.5.20.29 – Guest orders -> Seller
1) Run upgrade-v0.5.20.29-guest-order-seller-visibility.sql in Supabase SQL Editor.
2) Deploy this ZIP.
3) Test in Incognito as guest, then open seller account on another device.

Fix:
- shop owner can SELECT its own market_orders even when customer is anonymous
- shop owner can read related delivery group and order items
- customer still only sees own orders
- admin retains access
- seller UI now reports a real query error instead of silently looking empty
