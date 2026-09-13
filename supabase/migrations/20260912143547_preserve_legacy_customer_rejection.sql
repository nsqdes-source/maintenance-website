-- Keep the currently deployed client functional while the new quote workflow is rolled out.
-- The old client can reject a needs_followup request; the new client decides a pending quote.
create or replace function public.customer_reject_repair(
  target_service_request_id uuid,
  rejection_notes text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare current_stage text; pending_quote_id uuid;
begin
  select workflow_stage into current_stage
  from public.service_requests
  where id = target_service_request_id and customer_id = auth.uid()
  for update;

  if not found then raise exception 'request_not_found'; end if;

  if current_stage = 'needs_followup' then
    update public.service_requests
    set workflow_stage = 'customer_rejected',
        status = 'cancelled',
        visit_outcome = 'customer_rejected',
        visit_notes = case
          when nullif(trim(rejection_notes), '') is null then visit_notes
          when visit_notes is null then 'رفض العميل: ' || trim(rejection_notes)
          else visit_notes || E'\nرفض العميل: ' || trim(rejection_notes)
        end,
        workflow_updated_at = now()
    where id = target_service_request_id;
    return;
  end if;

  if current_stage <> 'awaiting_customer_approval' then
    raise exception 'repair_rejection_not_available';
  end if;

  select id into pending_quote_id
  from public.service_request_quotes
  where service_request_id = target_service_request_id and status = 'pending'
  for update;
  if pending_quote_id is null then raise exception 'quote_not_found'; end if;

  perform public.customer_decide_service_request_quote(pending_quote_id, false, rejection_notes);
end;
$$;

revoke all on function public.customer_reject_repair(uuid,text) from public, anon;
grant execute on function public.customer_reject_repair(uuid,text) to authenticated;