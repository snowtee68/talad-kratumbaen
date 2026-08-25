V0.5.20.58 SAFE UI UPDATE
Base: V0.5.20.57.

1) Dedicated Seller Order Page
- Main Order button opens a page containing only seller orders.
- If account owns one shop, opens that shop directly.
- If multiple shops, asks which shop first.
- Separate small button goes back to Shop / Product Settings.
- Uses the SAME market_orders query, existing renderer, existing status actions and RPCs.
- No database schema/order-flow rewrite.

2) Notification / Deep Link
- Seller notification deep-link opens the dedicated order page for the correct shop.
- If order_id exists, page selects the correct order bucket and scrolls to that order.
- Notification banner also opens seller orders rather than the shop settings page.
- Seller order tabs/search/load-more/action refresh stay on the dedicated order page.

3) Mobile Product Management
- Product name no longer gets squeezed.
- Price stays visible at the right.
- Sale status stays visible on its own line.
- Product action buttons wrap compactly.
- Add/Edit Product form uses a clean single-column mobile layout.

4) Existing V0.5.20.57 order-count badge + V0.5.20.56 alert improvements retained.

No SQL. No RLS. No new tables. No order creation/status schema changes.
