V0.5.22.6 CHECKOUT + WALLET ROOT FIX

1) Fix Checkout silent failure caused by undefined shopBy in openCheckout().
2) Checkout now loads shop state into a local checkoutShopBy map.
3) Checkout async errors are shown to the user instead of failing silently.
4) Coupon Wallet reads saved claims directly; Mission sync no longer blocks shop coupon wallet.
5) No global CSS/layout changes.

Run upgrade-v0.5.22.6-wallet-stability.sql once, then deploy this build.
