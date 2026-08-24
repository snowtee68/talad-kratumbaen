V0.5.20.32 – Force iPhone/PWA Cache Refresh
- บังคับเปลี่ยน Service Worker cache name จาก v5.7.9.16 เป็น v5.7.9.45
- precache index/styles/app ด้วย version query ใหม่
- bump sw registration, styles, order.js/order.css
- คง layout mobile 2 แถว:
  แถว 1: เข้าสู่ระบบ | 📦 ออเดอร์
  แถว 2: ร้านชื่นชอบ | + เพิ่มร้าน
- ไม่มี SQL ใหม่

หลัง Deploy:
1) ปิด PWA/แท็บเว็บบน iPhone ให้หมด
2) เปิด Safari เข้าเว็บ 1 ครั้ง รอ 5-10 วินาที
3) ปิด Safari แล้วเปิดไอคอนจาก Home Screen ใหม่
ถ้ายังเก่า ให้ลบไอคอน Home Screen แล้ว Add to Home Screen ใหม่ 1 ครั้ง
