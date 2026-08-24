V0.5.20.19 – Public Rider separated from Admin

NEW PUBLIC ROUTE
/rider/
- สำหรับลูกค้า/ร้านทั่วไป: สร้างงานเรียกวิน
- สำหรับวิน: สมัครวิน, เปิดพร้อมรับงาน, รับงาน, ติดตามงาน, Push/Realtime
- ไม่มีหน้าจัดการอนุมัติวินของ Admin
- ใช้ระบบ Rider/Push/Proof เดิม จึงไม่ต้องสมัครวินใหม่หรือย้ายข้อมูล

ADMIN / TEST ROUTE
/rider-test/
- URL เดิมยังอยู่
- Admin ยังใช้อนุมัติ/จัดการวินได้
- เพิ่มลิงก์ไปหน้า Public

หมายเหตุ
- ไม่ต้อง Run SQL ใหม่
- Customer Order Delivery ในเว็บหลักยังเรียกวินผ่าน flow เดิม
- URL Public หลัง Deploy: <โดเมนเว็บ>/rider/
