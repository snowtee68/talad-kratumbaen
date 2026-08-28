V0.5.22.20 - Mission Recalculate + Auto Expire (COMBINED)

เวอร์ชันนี้รวมทุกอย่างไว้ในชุดเดียว ไม่ต้องลง V0.5.22.20 เก่าก่อน

แก้ไข:
1. แก้ error: db.rpc(...).catch is not a function
2. Mission V1 คำนวณสถานะใหม่จากข้อมูลจริงทุกครั้ง
3. ออเดอร์นับ Mission เมื่อรับเองสำเร็จจริง หรือ Delivery ส่งสำเร็จจริง
4. ถอนคูปอง Mission ที่เคยได้ผิด เฉพาะกรณียังไม่ถูกใช้
5. คูปองที่ใช้กับออเดอร์แล้วจะไม่ถูกย้อนลบ
6. Admin ตั้ง "วัน/เวลาสิ้นสุดการรับรางวัล" ได้
7. เมื่อพ้นเวลารับรางวัล:
   - ปุ่ม Mission จะหาย
   - Popup Mission จะไม่แสดงอีก
   - ระบบจะไม่แจก/Sync คูปอง Mission เพิ่ม
   - ประวัติข้อมูล Mission เดิมไม่ถูกลบ

วิธีอัปเดต:
1. Supabase SQL Editor: รัน upgrade-v0.5.22.20-mission-recalculate.sql จำนวน 1 ครั้ง
2. นำ index.html, app.js, order.js, sw.js ไปทับไฟล์เดิม
3. Commit + Push
4. หลัง deploy ให้ Refresh/Hard Refresh แล้วทดสอบ

หมายเหตุ:
- ZIP นี้คือ V0.5.22.20 ฉบับรวมล่าสุด ให้ใช้ชุดนี้แทนไฟล์ V0.5.22.20 ที่ส่งก่อนหน้า
