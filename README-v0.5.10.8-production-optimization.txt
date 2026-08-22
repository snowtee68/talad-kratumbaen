V0.5.10.8 – Production Optimization

ต่อจาก V0.5.10.7 และรวมทุกระบบก่อนหน้า

ปรับ Order realtime:
- Realtime เป็นช่องทางหลัก
- เมื่อ Realtime connected: ไม่มี polling ทุก 15 วินาทีอีก
- Query reconciliation 1 ครั้งตอน login/start และตอนกลับเข้าเว็บ
- ถ้า Realtime error/timeout/closed: เปิด fallback polling ทุก 60 วินาทีชั่วคราว
- เมื่อ Realtime reconnect สำเร็จ: หยุด fallback polling ทันที
- เมื่อ browser/tab เข้า background: ปิด Realtime + polling เพื่อลด connection/query
- เมื่อกลับ foreground: sync 1 ครั้ง แล้ว reconnect Realtime
- Push Notification เดิมไม่เปลี่ยน

ผลโดยหลักการ:
เดิม 100 หน้าจอเปิด 1 ชั่วโมง polling 15 วินาที = 24,000 รอบ polling/ชม.
ใหม่ เมื่อ Realtime ปกติ = ไม่มี periodic polling เหล่านั้น
(ยังมี query เฉพาะตอนเข้า/กลับหน้า และ query ที่เกิดจาก event จริง)

ติดตั้ง:
- Deploy ZIP ทับ main
- ไม่ต้อง Run SQL ใหม่ หากเคย Run upgrade-v0.5.10.6-realtime.sql แล้ว
- ไม่ต้องแก้ Edge Function

ขั้นต่อไป:
- ทดสอบ functional flow จริง
- แล้วทำ load test 100 -> 500 -> 1000 virtual users
