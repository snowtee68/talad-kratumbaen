V0.5.20.5 – Order-aware Customer Status Navigation

แก้:
- Customer Notification ใช้ order_id เป็นตัวกำหนดสถานะ/Tab โดยตรง
- ไม่ใช้สถานะรวมของ multi-shop group มาตัดสินแทน Order ที่แจ้งเตือน
- payment_review -> รอ/กำลังเตรียมสินค้า
- preparing -> รอ/กำลังเตรียมสินค้า
- ready -> พร้อมรับ/จัดส่ง
- completed -> ประวัติ
- Deep Link โหลด status ล่าสุดจาก DB ก่อนเปิด Customer Hub
- Realtime ที่มี focused order จะอัปเดต tab ตาม status ล่าสุด
- bump SW/cache เพื่อไม่ใช้ logic เก่า

ไม่มี SQL ใหม่
