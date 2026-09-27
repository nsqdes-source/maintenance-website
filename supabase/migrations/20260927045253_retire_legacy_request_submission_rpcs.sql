-- Retire legacy public request submission RPCs.
-- The active /request page uses submit_service_request_v4.

revoke execute on function public.submit_service_request_v2(
  text,text,text,text,text,text,text,text,double precision,double precision,date,text
) from public, anon, authenticated;

revoke execute on function public.submit_service_request_v3(
  text,text,text,text,text,text,text,text,double precision,double precision,date,text,
  text,text,text,text,text,text,text,text,text,text,timestamptz
) from public, anon, authenticated;

revoke execute on function public.submit_service_request_with_images(
  text,text,text,text,text,text,text,double precision,double precision
) from public, anon, authenticated;
