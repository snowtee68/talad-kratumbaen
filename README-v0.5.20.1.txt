V0.5.20.1 – Notification Direct Deep Link Fix

แก้ Deep Link ทั้ง 2 ระบบ:
- ร้าน/ลูกค้า: Service Worker postMessage route เข้า order.js โดยตรง
- Rider: Service Worker postMessage job id เข้า Rider app โดยตรง
- ยัง navigate URL เป็น fallback แต่ไม่พึ่ง navigate เพียงอย่างเดียว
- รองรับ query และ hash deep links
- Main SW v5.7.9.17
- Rider SW v0.4.4
- คง Backend Push + POD + Auto-delete 3 วันทั้งหมด
- ไม่มี SQL ใหม่ และไม่ต้องแก้ Edge Function เพิ่ม
