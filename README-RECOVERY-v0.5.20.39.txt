RECOVERY v0.5.20.39
Base: v0.5.20.21-product-quick-toggle (before Guest Checkout changes)
Purpose:
- Restore known member checkout + seller order UI baseline.
- Keep product quick on/off feature from v0.5.20.21.
- Force fresh browser/PWA cache so newer broken order.js is not reused.

IMPORTANT:
- Do NOT run or delete any SQL for this recovery deploy.
- Existing database orders are preserved.
- Existing later SQL/RPC can remain for now; this frontend does not depend on the v0.5.20.35 seller feed RPC.
- Test member order first before reintroducing Guest Checkout.
