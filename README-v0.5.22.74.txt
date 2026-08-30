V0.5.22.74 – Push Registration Diagnostic Fix
รวม V0.5.22.73 ทั้งหมดไว้แล้ว

แก้ปัญหา:
- กดเปิดแจ้งเตือนแล้วขึ้น “ใช้เวลานานเกินไป”
- เอา timeout 20 วินาทีออกทั้งฝั่งลูกค้า/ร้านค้า
- ฝั่งวินใช้ helper Push เดียวกัน จึงได้การแก้นี้ด้วย
- แสดงสถานะทีละขั้น:
  1/5 ขอสิทธิ์ Notification
  2/5 อ่าน VAPID Public Key
  3/5 ลงทะเบียน Service Worker
  4/5 สร้าง Push subscription
  5/5 บันทึก subscription ลง Supabase
- หากล้มเหลว จะแสดง Error จริงของขั้นตอนนั้นแทนข้อความ timeout
- bump Service Worker / cache / asset query เป็น V0.5.22.74

คงของเดิม:
- Order Role Choice จาก 22.72
- Seller Push UI จาก 22.73
- Push subscription เดียวของบัญชีต่ออุปกรณ์
- ไม่มี SQL ใหม่
- ไม่แก้ Edge Function / VAPID secrets / Database Trigger

ติดตั้ง:
1. แตก ZIP ทับไฟล์เดิม
2. Commit + Push
3. บน iPad/iPhone/PWA ให้ปิดหน้าเว็บหรือแอปจาก Home Screenแล้วเปิดใหม่หนึ่งครั้ง
4. เข้า ออเดอร์ > ออเดอร์ที่ร้านได้รับ
5. กด “เปิดแจ้งเตือนออเดอร์ร้าน”
6. หากยังไม่สำเร็จ ให้ดูว่าค้าง/พังที่ขั้น 1/5 ถึง 5/5 และส่งข้อความนั้นมาได้ทันที
