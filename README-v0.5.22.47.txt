V0.5.22.47 - Global Modal Header/Taskbar Fix

รวม V0.5.22.46 ทั้งหมด

แก้ปัญหารวมทุกหน้า Popup/Modal:
- Header ตลาดกระทุ่มแบนจะไม่บังชื่อหน้าและปุ่มปิดอีก
- Taskbar ด้านล่างและปุ่มตะกร้าจะไม่ทับปุ่ม/รายละเอียดใน Modal
- เพิ่ม body state market-modal-open ให้ระบบรู้ว่า Modal กำลังเปิด
- เมื่อ Modal เปิด จะซ่อน Header / Taskbar / Cart ชั่วคราว
- Modal ทุกตัวมี z-index สูงกว่า navigation ทั้งหมด
- มือถือ: Modal ทุกหน้าจะทำงานเป็นหน้าจอเต็มและเลื่อนได้เต็มจอ
- ปุ่มปิดอยู่ภายในหน้าจอของ Modal
- Tablet/PC: ยังเป็น Popup แต่จะอยู่เหนือ Header/Taskbar เสมอ
- หน้า “เกี่ยวกับเรา” ใช้หลักเดียวกัน
- ไม่ต้องรัน SQL
