V0.5.18 – Consolidated Master Build

ฐาน:
- สร้างจาก talad-kratumbaen-main (7).zip ที่ใช้งานจริง

แก้:
- ORDER_UI_VERSION = 0.5.18
- index.html order.js cache version = 0.5.18
- ต่อไปไม่ต้องแก้เลข version เองในรอบนี้
- Rider payer แก้จาก receiver กลับเป็น recipient ตาม flow ที่เคยใช้งานได้
- ก่อนเรียกวินจะแสดงค่าส่งประมาณ + ผู้ชำระ = ลูกค้าปลายทาง ให้ยืนยัน

ตรวจว่าฟีเจอร์หลักยังอยู่:
- Address dropdown / Saved address
- Delivery fare preview
- จำกัด 10 กม. / สูงสุด 5 จุดรับ
- Realtime + Poll fallback 5 นาที
- Push + Notification Deep Link
- Multi-shop Delivery / Partial cancellation
- Rider tracking
- Pickup completion
- Shop Sales Report
- Refund
- Product limit 100

เพิ่ม BUILD-MANIFEST.json เพื่อใช้ตรวจฟีเจอร์ในเวอร์ชันถัดไป

SQL:
ไม่มี SQL ใหม่สำหรับ V0.5.18
Edge Function send-order-push V0.5.17 ที่ Deploy ไปแล้วใช้ต่อได้
