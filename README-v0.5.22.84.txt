V0.5.22.84 – BACKEND RIDER PUSH WEBHOOK

เป้าหมาย:
งานวินใหม่ต้อง Push จาก Backend แม้วินไม่ได้เปิดหน้า “งานวิน”
และไม่ฝากการแจ้งเตือนไว้กับ JavaScript ของหน้าร้านเพียงอย่างเดียว

สิ่งที่เพิ่ม:
1) send-rider-push รองรับ Supabase Database Webhook
2) ใช้ RIDER_PUSH_WEBHOOK_SECRET ตรวจสอบ Webhook โดยตรง
3) เพิ่ม market_rider_push_events ป้องกัน Push งานเดียวกันซ้ำ
4) Browser Push เดิมยังคงเป็น fallback แต่ Backend Webhook เป็นเส้นทางหลัก
5) INSERT/UPDATE ที่ยังไม่มี rider_job_id จะถูกข้าม
6) เมื่อ rider_job_id ถูกแนบและ Batch ยังเปิดอยู่ Backend จะส่ง Push ให้ approved riders
7) ถ้าส่งสำเร็จแล้ว การ UPDATE Batch ภายหลังจะไม่ส่งงานเดิมซ้ำ
8) ถ้าส่งไม่สำเร็จเลย idempotency claim จะถูกลบ เพื่อให้ retry ได้

============================================================
ขั้นตอนติดตั้ง
============================================================

A) WEB
Overlay ZIP → Commit → Push

B) SQL (รันครั้งเดียว)
รัน:
upgrade-v0.5.22.84-backend-rider-push-idempotency.sql

C) EDGE FUNCTION
Deploy โค้ด:
supabase/functions/send-rider-push/index.ts
ลง Function เดิมชื่อ:
send-rider-push

D) สร้าง Secret
Supabase → Edge Functions → Secrets
เพิ่ม:
RIDER_PUSH_WEBHOOK_SECRET

ตั้งค่าเป็นข้อความสุ่มยาวอย่างน้อยประมาณ 32 ตัวอักษร
อย่าส่ง Secret นี้ในแชต
เก็บไว้ใช้ในข้อ E ด้วย

E) สร้าง Database Webhook
Supabase → Database → Webhooks → Create webhook

Name:
rider-job-created-push

Table:
public.market_delivery_batches

Events:
INSERT
UPDATE

Method:
POST

URL:
https://ycimxcfvkmrywwxmmxfb.supabase.co/functions/v1/send-rider-push

HTTP Headers:
Content-Type: application/json
x-rider-webhook-secret: <ค่าเดียวกับ RIDER_PUSH_WEBHOOK_SECRET>

F) Edge Function JWT
สำหรับ send-rider-push:
Verify JWT with legacy secret = OFF

เหตุผล:
Database Webhook ไม่มี user JWT
แต่ Function ตรวจ x-rider-webhook-secret เอง
ส่วนการเรียกจาก Browser ยังตรวจ auth.getUser() ตามเดิม

============================================================
วิธีทดสอบ
============================================================

1) เครื่องวินเปิด “แจ้งเตือนงานวิน” ให้มี Push subscription แล้ว
2) ปิดหน้า “งานวิน” / อยู่หน้าอื่น
3) ลูกค้าสั่ง Delivery
4) ร้านรับออเดอร์
5) ลูกค้าแนบสลิป
6) ร้านยืนยันรับเงิน
7) Auto Rider สร้าง Batch + rider_job_id
8) Database Webhook จะเรียก send-rider-push
9) วินควรได้ OS Push โดยไม่ต้องเปิดหน้า “งานวิน”

ดู Logs ที่:
Edge Functions → send-rider-push → Logs

ควรพบ:
rider database webhook
rider push result

ผลสำคัญ:
sent > 0
= ฝั่ง Backend ส่งถึง Push service สำเร็จ

reason = recipients have no push subscription
= เครื่องวินยังไม่ได้บันทึก Push subscription

reason = no recipients
= ไม่มี approved rider user id ที่ระบบหาได้

Invalid rider webhook secret
= Header ของ Database Webhook ไม่ตรงกับ Secret

หมายเหตุ:
OS เป็นผู้ควบคุมเสียงแจ้งเตือนสุดท้าย โดยเฉพาะ iOS/iPadOS
แต่หลัง 22.84 การ “ต้องเปิดหน้างานวินก่อนถึงรู้ว่ามีงาน” ไม่ใช่ design หลักอีกต่อไป
