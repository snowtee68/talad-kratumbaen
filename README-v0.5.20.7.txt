V0.5.20.7 – Public Launch with Admin Shop Whitelist

- ORDER_PUBLIC_ENABLED=true: เปิดระบบสั่งซื้อให้ผู้ใช้จริง
- ปุ่มสั่งซื้อขึ้นเฉพาะร้านที่:
  1) Admin เปิด market_order_shop_access.enabled=true
  2) ร้านเปิด market_shop_order_settings.enabled=true
  3) มีสินค้าที่ sale_status=available
- Database Trigger กันการสร้าง Order ของร้านที่ Admin ไม่อนุญาต แม้ยิง RPC ตรง
- ร้านค้าไม่สามารถให้สิทธิ์ตัวเองได้
- ร้านที่ Admin อนุญาตแล้วยังเปิด/พักร้านเองได้ตามปกติ
- ต้อง Run upgrade-v0.5.20.7-shop-whitelist.sql ก่อน Deploy เว็บ
