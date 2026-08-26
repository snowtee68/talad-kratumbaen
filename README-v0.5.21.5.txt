ตลาดกระทุ่มแบน V0.5.21.5 - Mission Reward Admin

เพิ่ม:
- Admin ตั้งชื่อรางวัล รายละเอียด และวิธีรับรางวัลของ Mission ได้จาก Dashboard
- เปิด/ปิดการแสดงรางวัลได้
- ผู้ใช้เห็นรางวัลเดียวกันในหน้า Mission
- เมื่อทำ Mission ครบ จะแสดงว่ามีสิทธิ์รับรางวัล
- ไม่แก้เงื่อนไข Mission เดิม และไม่กระทบ Delivery

ก่อน Deploy:
1) เข้า Supabase > SQL Editor
2) รันไฟล์ upgrade-v0.5.21.5-mission-reward-admin.sql หนึ่งครั้ง
3) Deploy ไฟล์เว็บเวอร์ชันนี้ขึ้น Netlify
4) Login Admin > Dashboard > ตั้งค่ารางวัล Mission
