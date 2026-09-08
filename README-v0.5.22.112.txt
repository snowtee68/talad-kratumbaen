ตลาดกระทุ่มแบน V0.5.22.112 — Direct Seller Order From Lock-screen Push

ผลลัพธ์ที่ต้องได้:
- พักหน้าจอหรือปิด PWA
- มี Notification แจ้งออเดอร์ใหม่หรือสลิปรอตรวจ
- กด Notification หนึ่งครั้ง
- ระบบเปิดหน้า "ออเดอร์ที่ร้านได้รับ" ของร้านและออเดอร์ที่เกี่ยวข้องทันที
- ไม่ต้องกดแถบแจ้งเตือนด้านบนซ้ำ

แก้ไข:
- เก็บ title และ body ของ Push ใน Service Worker เพิ่มเติม
- จำแนก Push ฝั่งร้านจากทั้ง event และข้อความบน Notification
- สร้าง order_tab=seller เมื่อ Backend ส่ง URL/event มาไม่ครบ
- บันทึกเส้นทางก่อนเปิดหรือ focus PWA เพื่อรองรับมือถือที่ตัด query string
- ยังคงทางสำรองของ V0.5.22.111 สำหรับการกดแถบแจ้งเตือนภายในเว็บ

ติดตั้ง:
1. ต้องมี V0.5.22.108 แล้ว
2. วาง index.html, app.js, order.js และ sw.js ทับไฟล์เดิม
3. ไม่ต้องลง .109-.111 แยก
4. ไม่ต้องรัน SQL และไม่ต้อง Deploy Edge Function
5. ปิด PWA ให้สนิท แล้วเปิดใหม่หนึ่งครั้งเพื่อให้ Service Worker V0.5.22.112 ทำงาน
6. ล้าง Notification เก่า และสร้างออเดอร์ใหม่เพื่อทดสอบ

สำคัญ: ต้องกด Notification ที่สร้างหลังอัปเดตเท่านั้น เพราะ Notification เก่าไม่มี title/body/order metadata ใน data ของ Service Worker รุ่นใหม่
