V0.5.20.41 – FREE Phone + Password (No SMS / No Phone Provider)

Base: V0.5.20.40 / Recovery order system.

How it works:
- User enters Thai phone e.g. 0812345678.
- Web normalizes to +66812345678.
- Internally creates deterministic synthetic email:
  66812345678@phone.talad-kratumbaen.invalid
- Supabase uses normal Email+Password auth.
- User never needs or sees the synthetic email.
- Login by phone deterministically maps to the same internal account.
- Phone is stored in user_metadata as phone_e164 / phone_local.
- Forgot password for phone accounts instructs user to contact admin.

Supabase settings:
- Phone Provider: KEEP OFF. No Twilio needed.
- Anonymous Sign-ins: OFF.
- Email Provider: ON.
- Confirm Email: MUST BE OFF for phone-alias signup to create a session immediately.
  (If Confirm Email is ON, synthetic address cannot receive confirmation.)

No SQL changes.
Order/Seller/Rider code is not modified by this feature.
