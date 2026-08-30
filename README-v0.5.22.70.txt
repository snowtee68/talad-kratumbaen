V0.5.22.70 – Rider Cancel / Pickup Sync Fix

แก้ปัญหา:
- ลูกค้ากด “เปลี่ยนเป็นมารับเองที่ร้าน” แล้ว หน้าวินยังเห็นปุ่มรับงาน

การแก้:
1) Rider inbox จะไม่คืนงานที่ group เปลี่ยนเป็น pickup แล้ว
2) RPC รับงานวินตรวจ fulfillment_method ซ้ำแบบ server-side/atomic
3) ต่อให้หน้าวินค้างจาก cache ก็รับงานที่ถูกยกเลิกไม่ได้
4) Realtime UPDATE จะถอดการ์ดงานที่ cancelled ออกจากหน้าวินทันที แล้ว reload inbox
5) ก่อนวินกดรับงาน frontend ตรวจสถานะจริงอีกครั้ง

ติดตั้ง:
- นำไฟล์ใน ZIP ทับ repo แล้ว Commit/Push
- รัน SQL: upgrade-v0.5.22.70-rider-cancel-sync-fix.sql เพียงครั้งเดียว
- ไม่ต้องรัน SQL 22.66 / 22.68 / 22.69 ซ้ำ
