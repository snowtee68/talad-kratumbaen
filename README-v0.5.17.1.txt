V0.5.17.1 – Notification Deep Link FIX

แก้บั๊ก V0.5.17:
- Deep-link functions ถูกบรรจุครบ
- ไม่ทำให้ order.js หยุดทำงาน / ปุ่มร้านค้าหาย
- แตะ Push แล้วเปิดหน้าที่เกี่ยวข้อง
- new_order / payment_submitted / revision_confirmed / refund_destination -> ฝั่งร้าน
- shop_accepted / revision_requested / payment_confirmed / order_ready / refund_submitted -> ฝั่งลูกค้า
- รองรับ group_id / order_id / shop_id
- ถ้ายังไม่ Login หลัง Login จะกลับไปเปิด Order เป้าหมาย

คง V0.5.16 ทั้งหมด:
- Delivery fare preview ก่อนสั่ง
- Address dropdown / saved address / 10km
- Realtime + low poll
- Pickup completion
- Shop report
- Delivery / Rider / Refund / Partial cancellation

ไม่มี SQL ใหม่
Edge Function send-order-push-v0.5.17 ที่ Deploy แล้วใช้ต่อได้
