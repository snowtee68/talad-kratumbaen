# ตลาดกระทุ่มแบน React V6.1

โปรเจกต์ React + Vite สำหรับ Deploy บน Netlify และเชื่อม Supabase

## อัปโหลดขึ้น GitHub
อัปโหลด **เนื้อหาภายในโฟลเดอร์นี้ทั้งหมด** ไปยัง root ของ branch `react-v6` โดยหน้า GitHub ต้องมองเห็น `package.json` ทันที ไม่ควรมีโฟลเดอร์ซ้อนอีกชั้น

## ตั้งค่า Netlify
- Branch: `react-v6`
- Build command: `npm run build`
- Publish directory: `dist`
- Environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

## ตรวจสอบก่อนใช้งานจริง
โครงสร้างฐานข้อมูลเดิมอาจใช้ชื่อคอลัมน์แตกต่างกัน โปรดตรวจตาราง `shops`, `market_posts`, `market_events`, `market_follows` และ RLS ให้ตรงกับโค้ด โดยเฉพาะ `status`, `owner_id`, `created_at`, `cover_url`, `image_url` และ relation ระหว่าง `market_posts` กับ `shops`
