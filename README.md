# ตลาดกระทุ่มแบน React + Vite Version 6

เวอร์ชันนี้ย้ายโครงสร้างจากไฟล์ HTML/JS เดียว ไปเป็น React + Vite แบบแยกหน้าและแยกส่วน เพื่อรองรับการพัฒนาระยะยาว

## สิ่งที่สร้างแล้ว
- หน้าแรกแบบแอป เน้นพื้นที่กระชับ
- โปรโมชั่นแบบเลื่อนซ้าย–ขวา
- “มีอะไรใหม่วันนี้” แสดงเพียง 5 รายการ
- ร้านแนะนำและร้านเปิดใหม่แบบแถบเลื่อน
- หน้า “ร้านค้า” แยกต่างหาก พร้อมค้นหา ตัวกรอง และโหลดเพิ่มครั้งละ 10 ร้าน
- หน้า “อัปเดต” สำหรับฟีดเต็ม
- Bottom Navigation บนมือถือ
- ระบบเข้าสู่ระบบและสมัครสมาชิก
- ร้านสมัครเองและรออนุมัติ
- Dashboard เจ้าของร้านสำหรับโพสต์ลงฟีด
- ติดตามร้าน
- รองรับ Supabase schema เดิมจาก v4/v5

## ติดตั้งในเครื่อง
1. แตก ZIP
2. เปลี่ยนชื่อ `.env.example` เป็น `.env`
3. ใส่ Supabase URL และ Anon Key
4. รัน:
   npm install
   npm run dev

## Deploy บน Netlify
1. อัปโหลดโฟลเดอร์นี้ขึ้น GitHub
2. ใน Netlify เลือก Import existing project
3. Build command: `npm run build`
4. Publish directory: `dist`
5. เพิ่ม Environment variables:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY

## สำคัญ
- ยังไม่ควรลบเว็บเดิมก่อนทดสอบ v6 ผ่าน Deploy Preview
- รันไฟล์ SQL ในโฟลเดอร์ `supabase` ตามลำดับ หากฐานข้อมูลยังไม่ได้รัน v4/v5
