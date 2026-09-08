V0.5.22.126 – Delivery Fare + Seller Notification Deep Link Fix

แก้ไข
1) หน้าลูกค้าในสถานะรอจัดส่ง แสดงค่าจัดส่งจาก market_delivery_batches และ fallback จาก rider_jobs เมื่อข้อมูลเดิมยังไม่ sync
2) หน้า Rider รับงาน fallback ค่าจัดส่ง/ระยะทางจาก market_delivery_batches หาก rider_jobs ขาดค่า
3) เพิ่ม SQL sync/backfill ค่าจัดส่งระหว่าง market_delivery_batches.delivery_fee และ rider_jobs.fare_estimate
4) กด Push “ออเดอร์ใหม่/รอตรวจเงิน” บังคับเข้า Seller Orders เสมอ แม้ payload เก่าส่ง order_tab ผิดหรือไม่มี URL
5) ถ้า Push ไม่มี order_id/shop_id ระบบเลือกออเดอร์ล่าสุดที่ร้านต้องทำจริง (pending_shop/payment_review) และเปิดการ์ดนั้น

ไฟล์ SQL ที่ต้องรัน: upgrade-v0.5.22.126-delivery-fare-sync.sql
หลังอัปโหลดเว็บ ให้ reload/ปิดเปิด PWA หนึ่งครั้งเพื่อให้ Service Worker V0.5.22.126 ทำงาน
