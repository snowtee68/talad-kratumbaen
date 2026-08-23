V0.5.17 – Push Notification Deep Link

เพิ่ม:
- แตะ Push แล้วเปิดหน้าที่เกี่ยวข้องโดยตรง
- new_order / payment_submitted / revision_confirmed / order_cancelled / refund_destination
  -> ฝั่งร้าน / ออเดอร์ร้านที่เกี่ยวข้อง
- shop_accepted / revision_requested / payment_confirmed / order_ready / refund_submitted
  -> ฝั่งลูกค้า / ชุดออเดอร์ที่เกี่ยวข้อง
- ถ้าเว็บเปิดอยู่แล้ว Service Worker navigate ไป URL เป้าหมายและ focus
- ถ้ายังไม่ login URL เป้าหมายค้างไว้; หลัง login ระบบอ่าน deep link แล้วเปิด Order
- รองรับ order_id, group_id, shop_id

สำคัญ:
Edge Function send-order-push ต้องส่ง payload data.url ที่ได้รับจาก body `url`
ถ้า Edge Function เวอร์ชันเดิมยังสร้าง URL เองหรือทิ้ง field url จะต้องอัปเดต Edge Function ด้วย
ZIP นี้อัปเดต Web UI + Service Worker เท่านั้น
ไม่มี SQL ใหม่
