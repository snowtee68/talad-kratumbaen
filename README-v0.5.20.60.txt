V0.5.20.60 SAFE STRICT BUYER/SELLER UI
Base V0.5.20.59.

- Buyer page is now strictly "ออเดอร์ที่ฉันสั่งซื้อ".
- Removed Seller / Orders Received tab and seller controls from buyer page.
- Seller workflow remains in the dedicated seller order page.
- Shop owner with no active seller badge: Order button lets them choose Buyer vs Seller.
- Shop owner with active seller orders: tapping the Order badge/button goes directly to seller orders needing action.
- Seller notifications/deep links still go directly to the correct seller shop/order.
- Customer notifications/deep links still go directly to customer orders.
- Realtime refresh preserves whichever dedicated role page is open.
- Existing delivery, payment, rider, order RPC/status, push and badge logic retained.

No SQL. No RLS. No schema changes. No duplication of orders.
