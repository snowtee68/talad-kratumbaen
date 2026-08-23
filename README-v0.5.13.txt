V0.5.13 Pickup Completion Flow

เพิ่ม:
- รับสินค้าเอง: ร้านแจ้งพร้อมรับ -> ร้านกด “ลูกค้ารับสินค้าแล้ว”
- แต่ละร้านจบแยกกันได้ ถ้าสั่งหลายร้าน
- เมื่อทุกร้านที่ไม่ถูกยกเลิกรับสินค้าครบ ชุดคำสั่งซื้อเป็น completed
- ลูกค้าเห็นร้านไหนรับแล้ว / ยังรอรับ
- Report ยอดขายจริงนับเมื่อ Fulfilled:
  * Pickup = ร้านกดลูกค้ารับสินค้าแล้ว
  * Delivery = Rider batch ส่งสำเร็จ
- ไม่เปลี่ยน status ของ Order เป็น completed เพื่อหลีกเลี่ยง constraint เดิม
- Realtime V0.5.11, Delivery, Refund, Insight เดิมอยู่ครบ

ติดตั้ง:
1) Run upgrade-v0.5.13-pickup-completion.sql
2) Deploy ZIP นี้ทับ V0.5.12
3) Commit / Push origin
ไม่ต้องแก้ Edge Function Push
