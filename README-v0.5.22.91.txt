V0.5.22.91 – TERMS MODAL FIX

แก้ปัญหา:
- กด “ข้อตกลงและเงื่อนไขการใช้งาน” ในหน้าสมัครแล้วเหมือนไม่เปิด
- สาเหตุ: Terms modal อยู่ใต้ Auth modal เพราะใช้ z-index เดียวกัน
- แก้ให้ Terms modal แสดงอยู่เหนือหน้าสมัครโดยตรง

ไม่แก้ Login / Signup logic / Order / Delivery / Rider / Push / Mission / Coupon
ไม่มี SQL

ติดตั้ง: Overlay ZIP → Commit → Push
