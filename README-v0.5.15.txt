V0.5.15 – Post Checkout Direct Status

เพิ่ม:
- หลังลูกค้ากดยืนยันสั่งซื้อ ระบบไม่ค้างหน้า Checkout และไม่ต้องกด “ดูสถานะออเดอร์”
- เปิดหน้า “ออเดอร์ที่ฉันสั่ง” ให้อัตโนมัติ
- โฟกัส/ไฮไลต์ชุดคำสั่งซื้อที่เพิ่งสร้างไว้ด้านบน
- แสดงข้อความชัด:
  * ร้าน Auto Accept -> สถานะรอชำระ และกดชำระได้ทันที
  * ร้าน Manual -> รอร้านยืนยัน
- เมื่อร้าน Manual กดรับ Realtime จะอัปเดตสถานะให้ลูกค้าโดยไม่ต้อง Refresh

ยังอยู่ครบ:
- Address Dropdown / Saved Address / Fare Popup
- 25 บาท 0–2 กม. / +10 บาททุก 2 กม. / +10 บาทต่อจุดเพิ่ม
- สูงสุด 5 จุดรับ / ไม่เกิน 10 กม.
- Realtime + 5-minute fallback
- Delivery / Rider / Partial cancellation / Refund
- Pickup Completion
- Shop Insight Report

SQL: ไม่มี SQL ใหม่
Deploy ZIP นี้ทับ V0.5.14 ได้เลย
