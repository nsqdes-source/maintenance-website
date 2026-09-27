-- Retire the legacy request-level warranty RPC.
-- The active item-level flow requires an issued invoice line with an active warranty.
revoke all on function public.submit_warranty_claim(uuid,text) from public, anon, authenticated;
