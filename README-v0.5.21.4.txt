V0.5.21.4 — Mission modal close fix

Root cause:
Mission modal HTML was placed after app.js/order.js scripts.
bindEvents() ran before the Mission close button existed, so the close handler was never attached.

Fix:
- Mission modal moved before scripts.
- Uses the same .backdrop + .close structure as existing modals.
- Added delegated [data-close] fallback for future dynamically-added modals.
- Clicking X or outside backdrop closes Mission.

No SQL changes.
Admin Delivery Toggle / Mission progress / Order / Delivery / Payment / Rider logic unchanged.
