V0.5.11 – Realtime + Low Poll Fallback

เปลี่ยนระบบแจ้งเตือน Order:
- ตัด Poll ทุก 15 วินาทีออกแล้ว
- ใช้ Supabase Realtime (market_orders) เป็นหลัก
- เมื่อมี INSERT / UPDATE / DELETE จะ sync notification หลัง debounce 700ms
- Poll fallback เหลือทุก 5 นาที และทำเฉพาะตอนหน้าเว็บ visible
- ยังมี initial sync 1 ครั้งตอน login/start
- ตอน logout/auth change จะ remove Realtime channel ป้องกัน channel ค้าง
- ระบบ Delivery / Rider / Partial shop cancellation / Product limit จาก V0.5.10 อยู่ครบ

ผลต่อ request:
เดิม Poll = 240 รอบ/ชั่วโมง/เครื่อง
ใหม่ fallback = สูงสุด 12 รอบ/ชั่วโมง/เครื่อง ขณะหน้าเว็บ visible
Realtime จะส่ง event เมื่อข้อมูลเปลี่ยนจริง

ติดตั้ง:
1) Run upgrade-v0.5.11-realtime-orders.sql
2) Deploy ZIP นี้ทับ V0.5.10
3) Commit / Push origin
ไม่ต้องแก้ Edge Function Push
