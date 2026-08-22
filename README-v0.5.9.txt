Talad Kratumbaen v0.5.9 — Delivery Integration

รวมในรอบเดียว:
- จำกัดสินค้า 100 รายการต่อร้าน (หน้าเว็บ + DB trigger)
- บันทึกว่าร้านเปิดดู Order แล้วหรือยัง
- หลายร้าน: ร้านที่พร้อมสามารถไป Delivery ก่อนได้ ไม่ต้องรอร้านที่ยังไม่พร้อม
- ร้านที่ยังไม่พร้อมยังคง Order ไว้ และเรียกวินรอบถัดไปได้
- แต่ละเที่ยว Delivery เก็บเป็น Batch แยกกัน จึงรองรับหลายเที่ยวต่อ Checkout
- ลูกค้าเห็นสถานะ: รอวิน > วินรับงาน > ไปรับสินค้า > รับครบ > กำลังส่ง > สำเร็จ
- ลูกค้าและร้านเห็นชื่อวิน/เบอร์โทร/ปุ่มโทร เมื่อ Rider ส่งข้อมูลมา
- เชื่อมกับ rider_create_multistop_job เดิม
- ถ้ามีตาราง public.rider_jobs ระบบ SQL จะสร้าง Trigger sync สถานะอัตโนมัติ
- มี RPC market_rider_update_delivery_batch สำหรับ Rider app กรณี schema Rider เก็บชื่อ/เบอร์ในตารางอื่น

ติดตั้ง:
1) Supabase SQL Editor: Run upgrade-v0.5.9-delivery-integration.sql
2) ดูผลลัพธ์:
   result = v0.5.9 delivery integration ready
   rider_jobs_auto_bridge_enabled = true/false
3) วางไฟล์โปรเจกต์จาก ZIP นี้ทับโปรเจกต์เดิม
4) Commit / Push origin / Netlify Deploy
5) ไม่ต้องแก้ Edge Function Push

สำคัญเรื่อง Rider:
- ถ้า rider_jobs_auto_bridge_enabled = true:
  ระบบจะ sync status จาก public.rider_jobs อัตโนมัติเท่าที่ชื่อ field มาตรฐานตรงกัน
- ถ้า = false หรือ Rider เก็บชื่อ/เบอร์ในตารางอื่น:
  ใช้ rider-delivery-bridge.js ใน Rider app และเรียก syncMarketDeliveryStatus()
  ตอนรับงาน/ไปรับ/รับครบ/กำลังส่ง/ส่งสำเร็จ

Partial Delivery:
ตัวอย่าง A+B พร้อม แต่ C ยังทำไม่เสร็จ
- ลูกค้าจะเห็น “พร้อมส่ง 2 ร้าน · รออีก 1 ร้าน”
- กด “ส่งเฉพาะ 2 ร้านที่พร้อม”
- A+B ได้ Batch/งานวินเที่ยวแรก
- C ยังไม่ถูกยกเลิก
- เมื่อ C พร้อม ลูกค้าสามารถเรียกวินเที่ยวที่สองได้
- ระบบเตือนว่าการแบ่งเที่ยวอาจมีค่าส่งเพิ่ม
