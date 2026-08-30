V0.5.22.66 - Rider Background Push

เพิ่ม:
- Push งานวินใหม่จาก Server สำหรับกรณีพัก/ล็อกหน้าจอ
- Dedicated Edge Function send-rider-push
- ส่งไปเฉพาะบัญชีวินที่ approved และมี push subscription
- ปุ่ม “เปิดแจ้งเตือนงานวิน” ในหน้างานวิน
- Notification click เปิด ?rider_jobs=1 และพยายามเปิดหน้างานวินโดยตรง
- เก็บระบบเสียง Realtime V0.5.22.65 ไว้สำหรับตอน Web App เปิดอยู่

ต้องรัน SQL และ Deploy Edge Function ตาม DEPLOY-v0.5.22.66-RIDER-PUSH.txt
