V0.5.22.86 – RIDER PUSH SUBSCRIPTION SELF-REPAIR

สาเหตุที่แก้:
- Backend send-rider-push ทำงานแล้ว
- Push service ตอบ 410 Unregistered
- Server ลบ endpoint ที่ตายแล้ว แต่ Browser/PWA ยังอาจคืน local subscription เก่า
- หน้า “งานวิน” จึงเคยแสดงว่าเปิดแจ้งเตือน ทั้งที่ Server ส่งหาเครื่องไม่ได้

สิ่งที่ 22.86 เปลี่ยน:
1) หน้า “งานวิน” ไม่ใช้แค่ local PushManager subscription ตัดสินว่าพร้อม
2) ตรวจ endpoint ของเครื่องกับ market_push_subscriptions บน Server
3) ถ้า endpoint หายจาก Server:
   - unsubscribe local endpoint เก่า
   - subscribe ใหม่ด้วย VAPID public key เดิม
   - upsert endpoint/keys ใหม่กลับ Server
4) ถ้า repair สำเร็จ หน้าแสดง:
   “ซ่อมการแจ้งเตือนงานวินแล้ว”
   หรือ
   “ตรวจสอบกับเซิร์ฟเวอร์แล้ว”
5) ถ้าซ่อมอัตโนมัติไม่ได้ จะเปลี่ยนปุ่มเป็น
   “ซ่อมการแจ้งเตือนงานวิน”
6) ไม่มี setInterval ใหม่
7) ไม่มี MutationObserver ใหม่
8) ไม่เปลี่ยน Order / Auto Rider / ค่า Delivery / Rider accept flow
9) ไม่ต้องรัน SQL เพิ่ม
10) ไม่ต้อง Deploy Edge Function ใหม่สำหรับ 22.86
    ใช้ Backend 22.85 เดิมได้

ติดตั้ง:
- Overlay ZIP → Commit → Push
- เปิดเว็บบนเครื่องวินแล้ว Refresh
- เข้า “งานวิน”
- รอข้อความตรวจสอบ Push
- ถ้าขึ้น “ซ่อม...แล้ว” หรือ “ตรวจสอบกับเซิร์ฟเวอร์แล้ว” จึงทดสอบ Order ใหม่

หมายเหตุ iPhone/iPad:
Web Push ต้องใช้งานผ่าน PWA/Home Screen ตามข้อกำหนดของ iOS และ Notification permission ต้องเปิดอยู่
