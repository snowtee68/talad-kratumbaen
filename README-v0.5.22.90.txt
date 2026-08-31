V0.5.22.90 – SIGNUP TERMS SAFE UPDATE

ฐาน: V0.5.22.89 (ไม่มีระบบเรียกวิน/เรือรับส่งคน)

เพิ่มเฉพาะ:
- Checkbox ยอมรับข้อตกลงในหน้าสมัครสมาชิก
- กดอ่านข้อความแล้วเปิด Popup ฉบับเต็ม
- ไม่ติ๊ก = สมัครไม่ได้ แต่ Login เดิมไม่ถูกบล็อก
- สมาชิกเดิมใช้งานตามปกติ ไม่บังคับย้อนหลัง
- บันทึก terms_version=1.0 และ terms_accepted_at ใน Supabase Auth user_metadata ตอนสมัคร
- ไม่มี SQL และไม่แก้ Order / Delivery / Rider / Mission / Coupon / Push

ติดตั้ง: Overlay ZIP → Commit → Push
