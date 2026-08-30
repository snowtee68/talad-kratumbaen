V0.5.22.87 – CREATING BATCH PUSH FIX

สาเหตุที่พบจากข้อมูลจริง:
งานวินล่าสุดถูกสร้างเป็น
  status = creating
  accepted_at = null
  rider_job_id = null

22.85 จึงไม่ยิง Push เพราะรอ rider_job_id ซึ่งใน flow จริงยังเป็น null ได้

สิ่งที่แก้:
- pg_net Trigger ยิง Push ตั้งแต่ INSERT ของ market_delivery_batches
  เมื่อ status อยู่ใน creating / waiting_rider / created / open
  และ accepted_at ยังเป็น null
- ไม่รอ rider_job_id
- Edge Function send-rider-push ไม่ข้ามงานเพียงเพราะ rider_job_id เป็น null
- UPDATE ใช้เป็น fallback เฉพาะเมื่อ batch เพิ่งเปลี่ยนเข้าสถานะรอวิน
- ระบบ idempotency จาก 22.84 ยังกันงานเดียวกันแจ้งซ้ำ
- ไม่เปลี่ยน Order, ค่า Delivery, การรับงานวิน หรือ Self Pickup

ติดตั้ง:
1) Deploy:
   supabase/functions/send-rider-push/index.ts
   ทับ Function เดิมชื่อ send-rider-push
2) Verify JWT with legacy secret = OFF เหมือนเดิม
3) Run SQL:
   upgrade-v0.5.22.87-creating-batch-push-fix.sql
4) Overlay ZIP → Commit → Push

ไม่ต้อง:
- Create Database Webhook
- ตั้ง Secret ใหม่
- รัน Vault setup ใหม่
- รัน 22.84/22.85 SQL ซ้ำ

ทดสอบ:
- เครื่องวินมี Push พร้อม/ซ่อมแล้ว
- ออกจากหน้างานวิน
- สร้าง Delivery order ใหม่จนร้านยืนยันรับเงิน
- เมื่อ market_delivery_batches INSERT เป็น status=creating
  pg_net จะเรียก send-rider-push ทันที
- Edge Function Logs ควรมี:
  rider database webhook
  rider push result

ถ้า sent > 0 = backend ส่ง Push service สำเร็จ
