V0.5.20.43 SAFE PHONE LOGIN
Base: Stable/Emergency Restore V0.5.20.42.
ONLY auth modal + auth event handlers changed.
NO order.js business logic changed.
NO shop/review/promotion loading logic changed.
NO SQL.
Phone Provider stays OFF. Uses deterministic internal email alias through existing Email+Password Auth.
Requires Email Provider ON and Confirm email OFF for immediate phone signup.
Phone forgot-password = contact admin.
