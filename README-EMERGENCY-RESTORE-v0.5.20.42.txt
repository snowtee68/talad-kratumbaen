EMERGENCY RESTORE v0.5.20.42
Base: v0.5.20.39 RECOVERY (known-good member/order frontend)
Purpose:
- Restore shop listing / member login / seller order UI to the known-good baseline.
- Force browser/PWA cache refresh.
- NO database changes.
- NO SQL.
- Do NOT delete Supabase data/users/shops/orders.
After deploy, hard refresh once. Existing shop/order data should reappear if DB is intact.
