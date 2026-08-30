V0.5.22.88 – RIDER NOTIFICATION DEEP LINK FIX

สถานะก่อนแก้:
- Background Rider Push ส่งถึงเครื่องแล้ว
- ปัญหาเหลือเฉพาะกด Notification แล้วเปิดแอป แต่ไม่เปิดหน้ารับงาน

สิ่งที่แก้:
1) Push งานใหม่แนบ rider_batch ไปกับ URL
2) Service Worker เก็บ route ของ Notification click ลง Cache Storage ก่อน focus/open app
3) ส่ง postMessage ไปยังหน้าเดิมด้วย
4) พยายาม navigate + focus ตามปกติ แต่ app ไม่พึ่ง query string เพียงอย่างเดียว
5) เมื่อ PWA กลับ foreground:
   - อ่าน pending route จาก message / URL / Cache Storage
   - refresh auth ถ้าจำเป็น
   - reload rider application เพื่อยืนยันว่าเป็นวิน approved
   - เปิด Rider modal
   - โหลด Rider inbox
   - scroll ไปที่ปุ่มรับงานของ batch ที่กดมาจาก Notification
6) route เก็บไว้ไม่เกิน 10 นาทีและลบหลังเปิดสำเร็จ
7) ไม่มี MutationObserver / setInterval ใหม่
8) ไม่เปลี่ยน Auto Rider, Delivery, Payment, Accept RPC หรือ Push Trigger

ติดตั้ง:
A) Web:
- Overlay ZIP → Commit → Push

B) Edge Function:
- Deploy supabase/functions/send-rider-push/index.ts ทับ send-rider-push เดิม
- Verify JWT with legacy secret คง OFF

ไม่ต้องรัน SQL เพิ่ม
ไม่ต้องเปลี่ยน Secret
ไม่ต้องแก้ pg_net Trigger

ทดสอบ:
1) ปิด/ออกจากหน้างานวิน
2) สร้างงานใหม่ให้ Background Push เด้ง
3) แตะ Notification
4) PWA ควรเปิดหน้า Rider และโหลดงานทันที
