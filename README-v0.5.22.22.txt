V0.5.22.22 - Display Name + Review Name

เพิ่ม:
- สมัครสมาชิกใหม่ตั้งชื่อที่ใช้แสดงได้
- สมาชิกเก่าเปลี่ยนชื่อได้ใน “บัญชีของฉัน”
- Header ใช้ชื่อที่ตั้งเองแทน Email/เบอร์
- รีวิวใช้ Display Name
- รีวิวเก่าจะแสดง Display Name ปัจจุบันของเจ้าของรีวิว
- ถ้ายังไม่ตั้งชื่อ จะไม่เปิดเผย Email/เบอร์ และแสดง “สมาชิกตลาด”
- ก่อนรีวิวต้องตั้ง Display Name ก่อน
- ไม่เปลี่ยน UUID / Login / Order / Mission / Coupon / Delivery

วิธีอัปเดต:
1. รัน upgrade-v0.5.22.22-display-name.sql ใน Supabase 1 ครั้ง
2. ทับไฟล์เว็บจาก ZIP
3. Commit + Push
4. Hard Refresh แล้วทดสอบ
