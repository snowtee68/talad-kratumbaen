V0.5.10.6 – Realtime Sync

เพิ่ม:
- ลูกค้า: Order / ร้านพร้อม / Rider รับงาน / สถานะจัดส่ง เปลี่ยนบนหน้าที่เปิดอยู่เอง
- ร้าน: ออเดอร์ใหม่ / ลูกค้าชำระ / สถานะ Rider เปลี่ยนเอง
- วิน: งานใหม่ งานถูกเปลี่ยน/ยกเลิก และจุดรับที่เสร็จแล้วอัปเดตเอง
- ใช้ Supabase Realtime postgres_changes
- Poll 15 วินาทีเดิมยังอยู่เป็น fallback ถ้า Realtime หลุด
- กลับจากพักหน้าจอ ระบบ reconnect + refresh ให้เอง
- Push Notification เดิมยังใช้เวลาปิดเว็บ/จอดับ

ติดตั้ง:
1) Run upgrade-v0.5.10.6-realtime.sql
2) Deploy ZIP นี้ทับ main
3) ไม่ต้องแก้ Edge Function Push

หมายเหตุ:
Realtime จะ refresh เฉพาะหน้า Order/Rider ที่กำลังเปิด ไม่ refresh เว็บทั้งหน้า
