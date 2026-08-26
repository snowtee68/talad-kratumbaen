V0.5.21.2 — ADMIN DELIVERY / SELLING TOGGLE
Base: V0.5.21.1

Flow:
1. Admin approves shop -> shop may display on website.
2. Admin separately switches Delivery/Selling ON for selected shop.
3. Only after that can owner add/manage selling setup and enable order acceptance.
4. Admin can turn access OFF at any time; new orders stop immediately.
5. Existing products and existing orders are not deleted/cancelled.

Admin UI:
- Admin > all shops has per-shop button:
  🟢 Delivery เปิด / ⚪ Delivery ปิด

IMPORTANT:
Run upgrade-v0.5.21.2-admin-delivery-toggle.sql before deploy.
No changes to Delivery/Rider/Payment/order status workflow.
Mission V1 remains included.
