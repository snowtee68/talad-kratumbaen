V0.5.22.92 – TERMS MODAL SWAP FIX

แก้แบบไม่ซ้อน Popup:
- เมื่อกด “ข้อตกลงและเงื่อนไข” ระบบจะซ่อนหน้าสมัครชั่วคราวก่อน
- เปิดหน้าข้อตกลงเพียงหน้าเดียว จึงไม่มีปัญหาหน้าสมัครบังอีก
- ปิดข้อตกลงด้วย X / แตะพื้นหลัง / ปุ่ม “เข้าใจแล้ว” แล้วระบบกลับหน้าสมัครเดิม
- ค่าที่กรอกในฟอร์มสมัครยังอยู่ เพราะไม่ได้ reset form
- เพิ่ม CSS #termsModal z-index:2200!important เป็น safety fallback

ไม่แก้ Login / Signup / Order / Delivery / Rider / Push / Mission / Coupon
ไม่มี SQL

ติดตั้ง: Overlay ZIP → Commit → Push
