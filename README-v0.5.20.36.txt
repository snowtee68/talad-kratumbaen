V0.5.20.36 – Seller live order filter fix
- Backend RPC is confirmed to return pending_shop guest orders.
- Seller action inbox can no longer silently hide live action orders due to stale search/date filters.
- If action filter would show 0 while backend has action orders, it auto-resets to All dates and clears search.
- Shows raw backend feed count: “ระบบพบออเดอร์ร้าน X รายการ”.
- Uses existing v0.5.20.35 RPC; no new SQL.
