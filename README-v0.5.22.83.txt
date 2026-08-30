V0.5.22.83 – Auto Rider Push Retry + Rider Profile Layout

1) Background Push งานวิน
- เดิมถ้า market_shop_auto_delivery_begin() ตอบ already_called=true หน้าเว็บ return ทันที
  จึงมีงานวินอยู่แล้วแต่ไม่ได้เรียก send-rider-push
- ตอนนี้ใช้ batch เดิมและ retry เฉพาะ Push โดยไม่สร้างงานวินซ้ำ
- เพิ่ม Console log:
  auto rider begin
  auto rider skipped
  auto rider existing batch
  auto rider push invoke
  rider job push result
  rider new-job push failed

2) ตำแหน่งแก้ไขข้อมูลวิน
ลำดับใหม่:
- ข้อมูลวินที่บันทึกไว้
- ✏️ แก้ไขข้อมูลวิน
- 🔔 การแจ้งเตือนงานวิน
- 📦 งานวิน

ติดตั้ง:
Overlay → Commit → Push
ไม่ต้องรัน SQL ใหม่สำหรับ 22.83
ไม่ต้อง Deploy send-rider-push ใหม่สำหรับ 22.83 ถ้า deploy code 22.78/22.80 แล้ว
