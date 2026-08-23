V0.5.20.6 – Ready -> Call Rider Flow

- Realtime callback now receives the changed market_orders payload.
- If the changed order belongs to the logged-in customer, its exact order_id and new status become the active focus.
- ready immediately switches customer to "พร้อมรับ / จัดส่ง".
- The changed order / call-rider action is scrolled into view when the customer page is open.
- Notification deep link remains order-aware.
- Backend order_ready push already supported by order-push-webhook; this release fixes live UI movement.
- No SQL changes.
