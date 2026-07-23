# ตลาดกระทุ่มแบน — เว็บรวมร้านค้า

เว็บนี้เป็น Static Website ใช้งานบน Netlify ได้โดยไม่ต้องมี Build command และเชื่อมฐานข้อมูล Supabase เพื่อให้เจ้าของร้านส่งข้อมูลจากหน้าเว็บได้จริง

## เปิดระบบรับร้านค้า (ทำครั้งเดียว)

1. เข้า Supabase และสร้าง Project
2. เปิด **SQL Editor** → **New query**
3. เปิดไฟล์ `supabase.sql` คัดลอกทั้งหมดไปวาง แล้วกด **Run**
4. ไปที่ **Project Settings → API**
5. คัดลอก **Project URL** และ **anon public key**
6. เปิด `config.js` แล้วแทนค่า 2 จุดนี้:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_ANON_PUBLIC_KEY"
};
```

7. อัปโหลดไฟล์ทั้งหมดขึ้น GitHub แล้วรอ Netlify Deploy

## การทำงาน

- เจ้าของร้านกด **+ เพิ่มร้านของฉัน** และส่งแบบฟอร์ม
- ระบบบันทึกข้อมูลลงตาราง `shops` โดยตั้ง `approved = false`
- ร้านยังไม่แสดงทันที เพื่อป้องกันสแปม
- เจ้าของเว็บเข้า Supabase → **Table Editor → shops** → เปลี่ยน `approved` เป็น `true`
- เมื่อรีเฟรชเว็บไซต์ ร้านนั้นจะแสดงให้ทุกคนเห็น

## ความปลอดภัย

Anon key สามารถอยู่ในเว็บได้ เพราะ Row Level Security จำกัดสิทธิ์ไว้แล้ว: บุคคลทั่วไปอ่านได้เฉพาะร้านที่อนุมัติ และเพิ่มได้เฉพาะร้านที่ยังไม่อนุมัติ บุคคลทั่วไปแก้ไขหรือลบร้านไม่ได้

## Netlify

- Branch: `main`
- Base directory: เว้นว่าง
- Build command: เว้นว่าง
- Publish directory: เว้นว่าง
