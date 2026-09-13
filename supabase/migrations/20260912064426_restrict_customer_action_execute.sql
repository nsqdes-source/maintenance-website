-- Local development exposed new RPCs to anon through default routine privileges.
-- Keep the customer actions available only to authenticated callers.
revoke execute on function public.customer_reject_repair(uuid,text) from public, anon;
revoke execute on function public.customer_cancel_service_request(uuid,text) from public, anon;
grant execute on function public.customer_reject_repair(uuid,text) to authenticated;
grant execute on function public.customer_cancel_service_request(uuid,text) to authenticated;
