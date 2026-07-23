# ตลาดกระทุ่มแบน Version 2

เว็บไซต์รวมร้านค้าแบบ Static HTML/CSS/JavaScript เชื่อมฐานข้อมูล Supabase และ Deploy อัตโนมัติผ่าน Netlify

## ฟังก์ชันที่มี
- ค้นหาและกรองตามหมวดหมู่
- ร้านแนะนำ / เปิดอยู่ตอนนี้ / ร้านโปรด
- เรียงร้านตามชื่อ ร้านใหม่ และระยะทาง
- ร้านใกล้ฉันด้วย Location
- หน้ารายละเอียดร้าน พร้อมโทร LINE Facebook TikTok เว็บไซต์ แชร์ และนำทาง
- แผนที่ OpenStreetMap
- ฟอร์มส่งร้านใหม่เข้าสถานะรอตรวจสอบ
- รองรับมือถือและ iPad

## อัปโหลด GitHub บน iPad
1. แตกไฟล์ ZIP ในแอป Files
2. เข้า repository `snowtee68/talad-kratumbaen`
3. กด Add file > Upload files
4. เลือก 6 ไฟล์: `index.html`, `styles.css`, `app.js`, `config.js`, `supabase.sql`, `README.md`
5. อย่าเลือกไฟล์ ZIP
6. กด Commit changes
7. Netlify จะอัปเดตภายในประมาณ 1–3 นาที

## ตั้งค่า Supabase
1. เปิด Supabase > SQL Editor
2. วางเนื้อหาจาก `supabase.sql` แล้วกด Run
3. ไป Project Settings > API
4. คัดลอก Project URL และ anon public key
5. แก้ `config.js` โดยห้ามใช้ service_role key

## Netlify
- Build command: เว้นว่าง
- Publish directory: `.`
