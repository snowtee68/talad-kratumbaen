V0.5.20.35 – Seller Order Feed RPC
IMPORTANT: Run upgrade-v0.5.20.35-seller-order-feed-rpc.sql first.

- Seller order list is now returned by a SECURITY DEFINER RPC.
- RPC verifies auth.uid() is the actual shop owner (or admin).
- Guest customer type no longer affects seller order visibility.
- Seller Hub shows active/action order counts returned from the same feed.
- If the feed fails, UI shows the real error instead of silently showing 0.
