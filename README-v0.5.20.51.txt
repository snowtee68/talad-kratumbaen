V0.5.20.51 – HARD FIX Recommended Slider on Mobile
Base: V0.5.20.50.
Cause fixed: recommendedGrid still had generic class="grid", so responsive grid rules could interfere/squeeze cards.
Changes:
- recommendedGrid no longer uses generic .grid.
- dedicated horizontal flex slider.
- nowrap + forced card min-width.
- mobile card width = min(360px, 88vw), so one large card is shown with a hint of the next card.
- native finger swipe horizontally enabled.
- scroll snap enabled.
All prior updates included. No SQL. Order/Seller/Rider/Auth unchanged.
