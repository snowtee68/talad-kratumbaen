V0.5.20.40 – Email OR Phone + Password
BASE: Recovery v0.5.20.39. Order/Seller/Rider logic is not modified.

Auth UI:
- Email + password (existing flow)
- Thai mobile phone + password
- 0812345678 is normalized to +66812345678
- Phone account forgot-password displays contact-admin guidance
- Account button displays phone when account has no email

Supabase required settings:
1) Authentication > Sign In / Providers > Phone = Enable
2) Confirm phone = OFF if you want no SMS/OTP cost
3) Anonymous sign-ins = OFF

Security note:
Phone numbers are not verified when Confirm phone is OFF. Admin-assisted password resets must verify the requester by other account/order information before resetting.
No SQL changes.
