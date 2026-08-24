V0.5.20.23 – Guest Checkout Login Gate Fix
- แก้จุดที่ openCheckout ยังบังคับ Login
- ลูกค้าไม่ Login กดตะกร้า > Checkout ได้
- ระบบสร้าง Anonymous Session อัตโนมัติก่อนเปิด Checkout
- หน้าออเดอร์ลูกค้า Guest ใช้ Anonymous Session เดิม
- ร้าน/Admin ยังต้อง Login ตามเดิม
- ไม่มี SQL ใหม่
