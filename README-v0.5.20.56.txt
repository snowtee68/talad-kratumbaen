V0.5.20.56 SAFE
Base: V0.5.20.55 REBUILT

1. Order badge mobile fix
- Does NOT change order counting/query logic.
- Badge number is rendered inside the Order button instead of floating outside its edge.
- Prevents clipping on narrow/older phones.

2. Order alert improvement
- Does NOT change order status/RPC/database logic.
- When web/PWA is open: stronger ~8-second alert and repeats every 20 seconds while unread.
- Stops repeating as soon as the order notification area is viewed.
- Web Push asks supported OS/browser for requireInteraction + stronger vibration.
- iOS may still control/limit notification sound duration when app is backgrounded/locked.

No SQL. No RLS changes. No Order RPC changes.
