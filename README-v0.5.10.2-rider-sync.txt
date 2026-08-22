Talad Kratumbaen V0.5.10.2 — Rider Live Sync

ต่อจาก main ล่าสุดของผู้ใช้

เพิ่มฝั่ง rider-test:
- วินกด “รับงาน” -> Market Delivery = วินรับงานแล้ว
- ส่ง display_name + phone ของวินกลับไปให้ Order
- รับสินค้าจุดแรก -> กำลังไปรับ/รับสินค้า
- รับสินค้าครบทุกจุด -> รับสินค้าครบแล้ว
- กดเริ่มจัดส่ง -> กำลังไปส่งลูกค้า
- กดส่งสำเร็จ -> Delivery + Orders ใน batch = completed
- วินถอนงาน -> Market Delivery กลับเป็น “รอวินรับงาน” และล้างชื่อ/เบอร์วินเดิม
- งาน Rider ปกติที่ไม่ได้มาจากตลาดยังทำงานเดิมได้

ติดตั้ง:
1) Supabase SQL Editor -> Run upgrade-v0.5.10.2-rider-market-sync.sql
2) Deploy โปรเจกต์ ZIP นี้ทับ main เดิม
3) rider-test/index.html เปลี่ยน cache เป็น app.js?v=0.5.10.2 แล้ว
4) ไม่ต้องแก้ Edge Function Push

ทดสอบ:
ลูกค้าเรียกวิน -> /rider-test/ -> วินรับงาน
จากนั้นเปิด Order ลูกค้า/ร้าน ควรเห็นชื่อและเบอร์วิน
แล้วทดสอบรับของครบ -> เริ่มจัดส่ง -> ส่งสำเร็จ
