V0.5.22.85 – PG_NET BACKEND RIDER PUSH

ใช้ pg_net Trigger โดยตรง แทน Dashboard Database Webhook
เพราะโปรเจกต์นี้ไม่มี schema supabase_functions

ติดตั้งตามลำดับ:
1) ถ้ายังไม่ได้รัน 22.84 idempotency SQL ให้รันก่อน:
   upgrade-v0.5.22.84-backend-rider-push-idempotency.sql
2) Deploy supabase/functions/send-rider-push/index.ts ทับ Function send-rider-push เดิม
3) Verify JWT with legacy secret = OFF
4) เปิด SETUP-v0.5.22.85-vault-secret.sql ใน SQL Editor
   เปลี่ยน PASTE_YOUR_CURRENT_RIDER_PUSH_WEBHOOK_SECRET_HERE
   เป็นค่าเดียวกับ Edge Function Secret: RIDER_PUSH_WEBHOOK_SECRET
   แล้ว Run (อย่า Commit ไฟล์ที่ใส่ secret จริงขึ้น GitHub)
5) รัน upgrade-v0.5.22.85-pg-net-rider-push-trigger.sql
6) Overlay web files → Commit → Push
7) ไม่ต้อง Create Database Webhook ใน Dashboard

ทดสอบ:
- เครื่องวินเปิด Push ไว้ แล้วปิดหน้างานวิน
- ทำ Order Delivery ใหม่จนร้านยืนยันรับเงิน
- เมื่อ rider_job_id ถูกสร้าง Trigger จะ queue HTTP ผ่าน pg_net
- Edge Function Logs ควรเห็น rider database webhook และ rider push result
