# เว็บไซต์ตลาดกระทุ่มแบน

## วิธีใช้บน iPad
1. ดาวน์โหลด ZIP แล้วแตะเพื่อแตกไฟล์ในแอป Files
2. เปิด GitHub repository `snowtee68/talad-kratumbaen`
3. กด Add file > Upload files
4. เลือกไฟล์ทั้งหมดข้างในโฟลเดอร์ ไม่ใช่อัปโหลด ZIP ทั้งก้อน
5. กด Commit changes

## เชื่อม Supabase
เปิด `config.js` แล้วแทนที่ SUPABASE_URL และ SUPABASE_ANON_KEY จาก Supabase > Project Settings > API
ห้ามใช้ service_role key

## เชื่อม Netlify
Deploy from Git, เลือก repository นี้, Build command เว้นว่าง, Publish directory ใช้ `.`
