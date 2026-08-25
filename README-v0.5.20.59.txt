V0.5.20.59 SAFE ORDER ROLE FLOW
Base: V0.5.20.58.

Order button behavior:
- Customer-only account -> opens My Orders directly.
- Account that owns a shop -> shows two clear choices:
  1. My Purchases (customer orders)
  2. Orders Received by Shop (seller orders)
- Seller with multiple shops chooses the shop only after choosing seller orders.

Notifications / deep links:
- Seller notification still opens the dedicated seller order page for the correct shop/order.
- Customer notification still opens the customer order flow.
- No notification is routed through the role-choice screen when the notification already identifies its role/order.

All V0.5.20.58 dedicated seller page and mobile product layout fixes retained.
No SQL. No RLS. No order creation/status/RPC changes.
