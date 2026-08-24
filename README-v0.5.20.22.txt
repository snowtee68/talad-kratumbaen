V0.5.20.22 – Guest Checkout
- ลูกค้าดูสินค้า/ใส่ตะกร้า/Checkout ได้โดยไม่สมัครสมาชิก
- ตอนกดสร้างออเดอร์ ระบบสร้าง Supabase Anonymous Session เบื้องหลัง
- Existing RLS/RPC, payment, delivery, refund และ customer order tracking ยังใช้ auth.uid เดิม จึงไม่ต้องเปิดข้อมูลออเดอร์เป็น public
- Guest ดูสถานะออเดอร์ได้จากเครื่อง/Browser เดิม
- ผู้ใช้ที่ Login อยู่ยังใช้งานแบบสมาชิกตามเดิม
- ร้านค้า/Admin/Rider ไม่เปลี่ยนสิทธิ์
IMPORTANT: Supabase Dashboard > Authentication > Providers > Anonymous Sign-Ins ต้องเปิด Enable ก่อนใช้งาน
- ไม่มี SQL ใหม่
