V0.5.20 – Rider Proof of Delivery + Customer Confirmation

เพิ่ม
- วินกด “ถึงปลายทาง / ส่งมอบสินค้า” แทนกดจบงานเอง
- วินต้องถ่าย/แนบรูปหลักฐานส่งมอบ
- รูปเก็บ Private bucket และเปิดผ่าน Signed URL อายุ 2 นาที
- หลังวินส่งมอบ: งานยังอยู่ delivering แต่มีสถานะ UI “รอลูกค้ายืนยัน”
- ลูกค้ากด “ได้รับสินค้าแล้ว” -> จึง Completed จริง
- ลูกค้ากด “ยังไม่ได้รับ / มีปัญหา” -> Hold รูปทันที ไม่ลบ
- ร้านค้าและลูกค้าเห็นชื่อวิน เบอร์โทร ค่าส่ง และ Timeline หลังจบงาน
- รูปปกติลบหลัง 3 วัน; ข้อมูลข้อความ/Timeline ยังอยู่
- Admin resolve ปัญหาแล้ว รูปจะเข้ารอบลบ 3 วันใหม่
- Rider Backend Push ที่ติดตั้ง v0.4.2 ใช้ต่อได้

ติดตั้งตามลำดับ
1) Run upgrade-v0.5.20-rider-proof-delivery.sql
2) Deploy เว็บ ZIP V0.5.20
3) Edge Function ใหม่: rider-proof-cleanup -> ใช้ edge-function-rider-proof-cleanup-v0.5.20.ts
4) ตั้ง Secret RIDER_PROOF_CLEANUP_SECRET = snowtee_proof_cleanup_2026_M4qT8nV2xK7pR5wL9cH3sB6dF1aZ
5) ปิด Verify JWT ของ rider-proof-cleanup
6) Run schedule-v0.5.20-proof-cleanup.sql

หมายเหตุ
- ไม่ต้องเปลี่ยน rider-push ที่ Deploy v0.4.2 แล้ว
- รูป Proof สูงสุด 5 MB ใน bucket; หน้า Rider จะบีบรูปก่อนอัปโหลด (~450 KB เป้าหมาย)
