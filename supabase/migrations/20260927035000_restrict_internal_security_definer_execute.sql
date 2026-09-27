-- Restrict SECURITY DEFINER helpers that are not intended for anonymous direct RPC use.
-- Public submission RPCs and upload-token attachment RPCs remain unchanged intentionally.

revoke execute on function public.admin_add_technician(uuid,text[],text) from anon;
revoke execute on function public.admin_update_technician(uuid,text[],boolean,text) from anon;
revoke execute on function public.admin_update_user_role(uuid,public.app_role,text[]) from anon;
revoke execute on function public.customer_reject_service_request(uuid,text) from anon;
revoke execute on function public.sync_service_request_workflow(uuid) from anon;
revoke execute on function public.technician_complete_service_request(uuid) from anon;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_catalog_part_tax_rate() from public, anon, authenticated;
revoke execute on function public.set_catalog_service_tax_rate() from public, anon, authenticated;
revoke execute on function public.trg_sync_new_service_request_workflow() from public, anon, authenticated;
revoke execute on function public.trg_sync_service_request_workflow() from public, anon, authenticated;
