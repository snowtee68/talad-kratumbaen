V0.5.21.7 — Clean Deploy Package + Mission Popup Fix

- index.html is at ZIP root for direct deployment.
- Removed obsolete nested talad-kratumbaen-upload.zip (July build).
- Mission popup retained and popup seen-state is saved only after it actually opens.
- New popup storage key forces one fresh test after this update.
- Admin Mission reward settings retained.
- Service-worker cache bumped to v0.5.21.7.
- If upgrade-v0.5.21.5-mission-reward-admin.sql already ran successfully, do not run it again.

Verification after deploy:
1) Footer must show V0.5.21.7.
2) Open website with no other modal: Mission popup should appear after ~1.4 seconds.
3) Login Admin and open Admin panel: first section should be 🎁 ตั้งค่ารางวัล Mission.
