V0.5.20.64 ACTUAL CLOSED-SHOP GUARD FIX

Confirmed defect in V0.5.20.63:
openShopMenu passed shopAvailability(setting, shop), but shopAvailability was still declared as shopAvailability(setting).
JavaScript ignored the second argument, so temporarily_closed was never evaluated.

Fixed:
- shopAvailability(setting, shop) now actually evaluates market_shops.temporarily_closed.
- Also evaluates today's closed flag and configured opening hours.
- openShopMenu disables Add to Cart while closed.
- addProduct performs a fresh live check before adding.
- Existing checkout guard remains.
- Existing orders are unaffected.

No SQL / RLS / Delivery / Rider / Payment / status RPC changes.
