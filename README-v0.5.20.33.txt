V0.5.20.33 – Seller Guest Order Split Query
- แก้หน้า Seller ให้โหลด market_orders ก่อน
- แล้วโหลด group/items/batches/batch_orders แยกกัน
- ไม่ใช้ nested PostgREST query ก้อนเดียวอีก
- Guest Order ที่ร้านมีสิทธิ์อ่านจะไม่หายเพราะ nested relation ใด relation หนึ่ง
- ถ้า query ใดมีปัญหา จะแจ้ง error จริงแทนการดูเหมือนไม่มีออเดอร์
- ไม่มี SQL ใหม่
