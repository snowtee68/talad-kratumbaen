V0.5.20.63 CLOSED SHOP ORDER BUTTON FIX
Base: V0.5.20.62.

Root cause confirmed:
- Main storefront correctly showed market_shops.temporarily_closed.
- But the live openShopMenu code still fetched only id,name,cover_url.
- Therefore shopAvailability() never received temporarily_closed and kept Add to Cart enabled.

Fix:
1. openShopMenu now fetches temporarily_closed/open_24_hours/opening_hours.
2. openShopMenu passes the live shop record into shopAvailability().
3. Product buttons are disabled and show the actual closed reason.
4. addProduct re-checks live shop + order settings before allowing an item into cart.
5. Checkout guards from V0.5.20.62 remain as the final protection.

Existing orders remain unaffected.
No SQL/RLS/Delivery/Rider/Payment/status RPC changes.
