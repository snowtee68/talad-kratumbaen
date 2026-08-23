V0.5.19.2 – Single Service Worker Fix

สาเหตุ:
- เดิม sw.js และ order-push-sw.js ใช้ scope './' เดียวกัน
- Service Worker จึงมีโอกาสแทนที่กัน ทำให้ Push/Deep Link ไม่เสถียร

แก้:
- ใช้ sw.js ตัวเดียวสำหรับ PWA cache + Web Push + Notification click
- ยกเลิก order-push-sw.js
- บังคับ updateViaCache:none
- bump SW เป็น v5.7.9.16
- Notification click navigate URL เป้าหมายก่อน focus
- คง Realtime UI / Backend Push / Delivery / Report / Pickup ทั้งหมด

ไม่มี SQL ใหม่
