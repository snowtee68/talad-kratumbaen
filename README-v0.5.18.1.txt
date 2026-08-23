V0.5.18.1 – New Order Redirect Fix

แก้:
- หลังสร้าง Order ดึง group_id ให้ถูกต้องทั้งกรณี RPC คืน object และคืน UUID/string โดยตรง
- Push new_order ใช้ group_id เดียวกับ Order ที่เพิ่งสร้าง
- หน้าออเดอร์ฝั่งลูกค้าโฟกัสชุดใหม่ ไม่ค้าง Tab “พร้อมรับ/จัดส่ง” จาก Order ก่อนหน้า
- หากหา group ใหม่ไม่พบ จะกลับ Tab รอดำเนินการแทนการค้างหน้าล่าสุด

คงทุก Feature จาก V0.5.18
ไม่มี SQL ใหม่
