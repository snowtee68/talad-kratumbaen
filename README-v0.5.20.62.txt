V0.5.20.62 SAFE SHOP-CLOSED DELIVERY GUARD
Base V0.5.20.61.

New-order availability now also follows the shop's main open/closed state:
- temporarily_closed = blocks new orders immediately
- today's opening_hours marked closed = blocks new orders for that day
- outside today's configured opening time = blocks new orders until the shop opens
- open_24_hours = does not block based on opening hours
- existing market_shop_order_settings enabled/paused/time checks still apply

Safety:
- Existing orders are NOT cancelled or modified when a shop closes.
- Seller can continue processing orders already received.
- Shop state is checked when opening menu, when entering checkout, and AGAIN immediately before market_create_checkout_v041.
- No SQL/RLS/schema changes.
- No Delivery/Rider/Payment/Order status RPC changes.
