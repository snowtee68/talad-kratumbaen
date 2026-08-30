V0.5.22.61 - Rider Job Inbox + Accept

แก้ปัญหา:
- ลูกค้าเรียกวินแล้ว วินไม่เห็นรายละเอียดงาน
- ปุ่ม “งานวิน” เดิมแสดงเพียงข้อมูลบัญชีวิน
- ไม่มีการแจ้งเตือนงานใหม่ในหน้าเว็บ

เพิ่ม:
1. หน้า “งานวิน” แสดงงานที่รอรับ
2. แสดงร้าน/จุดรับ, ลูกค้า/จุดส่ง, ระยะทาง, ค่าส่ง
3. ปุ่ม “รับงานนี้”
4. รับงานแบบ atomic — งานเดียวกันรับได้เพียงวินคนแรก
5. งานที่รับแล้วแสดงใน “งานของฉัน”
6. Supabase Realtime แจ้งงานใหม่ขณะ Web App เปิดอยู่
7. ถ้า Browser Notification เปิดสิทธิ์ไว้ จะแจ้งเตือนงานใหม่ขณะ Web App ทำงาน
8. ตอนสร้างงาน ระบบส่ง request event rider_job_created ไปยัง Edge Function send-order-push แบบ best-effort

ต้องรัน SQL 1 ครั้ง:
upgrade-v0.5.22.61-rider-job-inbox-accept.sql

หมายเหตุ Push:
Push ขณะปิด Web App ต้องให้ Edge Function send-order-push ฝั่ง Supabase รองรับ event rider_job_created
แพตช์นี้ไม่เขียนทับ Edge Function เดิม เพราะ source ของ Function เดิมไม่ได้อยู่ใน ZIP และการเขียนทับโดยเดาอาจทำให้ Push ออเดอร์เดิมพัง
ส่วนการเห็นงานและกดรับงาน ใช้งานผ่าน RPC ใน SQL นี้โดยตรง
