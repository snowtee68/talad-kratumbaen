V0.5.10.1 – Delivery Payer Safety Hotfix

แก้:
- invalid payer: ใช้ค่า recipient ที่ rider_create_multistop_job รองรับ
- ค่าเริ่มต้นของระบบตลาด = ลูกค้าปลายทางเป็นผู้จ่ายค่าวิน
- ก่อนสร้าง Rider Job มีหน้าต่างยืนยันว่า “ผู้ชำระค่าจัดส่ง: ลูกค้าปลายทาง”
- ลูกค้าไม่สามารถบังคับเลือกร้านต้นทางให้จ่ายแทนได้
- ถ้าลูกค้ายกเลิกหน้าต่างยืนยัน ระบบยกเลิก Delivery Batch ที่กำลังสร้าง ไม่ทิ้ง Batch ค้าง
- ระบบ Partial Delivery / Partial Shop Cancellation / Rider tracking ของ V0.5.10 อยู่ครบ

หลักการ:
caller จะใช้ได้ในอนาคตเมื่อมี flow ให้ร้านยืนยันรับผิดชอบค่าส่งก่อนเท่านั้น
ตอนนี้ตลาดใช้ recipient เพื่อไม่ให้ร้านถูกบังคับจ่ายโดยไม่รับรู้

ติดตั้ง:
1) ต้องเคย Run SQL V0.5.9 FIX + V0.5.10 + RLS recursion FIX + delivery retry duplicate FIX แล้ว
2) วางไฟล์เว็บจาก ZIP นี้ทับโปรเจกต์เดิม
3) Commit / Push origin
4) ไม่ต้อง Run SQL เพิ่มสำหรับ payer hotfix นี้
