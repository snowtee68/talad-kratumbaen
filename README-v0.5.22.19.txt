V0.5.22.19 MISSION REPAIR

1) รัน upgrade-v0.5.22.19-mission-repair.sql ใน Supabase SQL Editor 1 ครั้ง
2) Deploy ไฟล์เว็บใน ZIP นี้
3) Login ด้วยบัญชีผู้ใช้ แล้วเปิด Mission ใหม่

สิ่งที่ซ่อม:
- market_mission_shop_views + RLS/unique key สำหรับ Mission เปิดดูร้าน
- market_mission_completed_order_count() สำหรับ Mission ออเดอร์สำเร็จ
- เปลี่ยนข้อความ error ให้แสดงสาเหตุจริง แทน “กรุณารัน Mission V1”

ไม่ลบข้อมูล Mission เดิม และไม่แก้ flow Order/Delivery/Coupon/Rider
