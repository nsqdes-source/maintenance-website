create or replace function public.customer_cancel_service_request(target_service_request_id uuid,cancellation_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare stage text;
begin
  select workflow_stage into stage from public.service_requests
  where id = target_service_request_id and customer_id = auth.uid() for update;
  if not found then raise exception 'request_not_found'; end if;
  if stage not in ('awaiting_assignment','assigned') then raise exception 'request_cannot_be_cancelled'; end if;
  update public.service_requests set workflow_stage = 'customer_cancelled', status = 'cancelled',
    visit_notes = case when nullif(trim(cancellation_reason),'') is null then visit_notes
      else concat_ws(E'\n',visit_notes,'Cancellation: ' || trim(cancellation_reason)) end,
    workflow_updated_at = now() where id = target_service_request_id;
end; $$;
revoke all on function public.customer_cancel_service_request(uuid,text) from public,anon;
grant execute on function public.customer_cancel_service_request(uuid,text) to authenticated;
