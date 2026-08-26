V0.5.21.8 — Mission Fulfillment Fix + Global Toggle

1. Mission “อุดหนุนร้านในชุมชน” no longer counts market_orders.status=completed alone.
   Pickup counts only pickup_completed_at. Delivery counts only completed delivery batches.
   Fully refunded/cancelled orders are excluded.
2. Admin now has a global 🎯 เปิดระบบ Mission switch.
   OFF hides Mission nav and suppresses Mission welcome popup.
3. Reward setting remains separate via “เปิดแสดงรางวัลนี้ให้ผู้ใช้”.
4. Run upgrade-v0.5.21.8-mission-fulfillment-toggle.sql once before/with deploy.
5. Frontend/cache version updated to V0.5.21.8.
