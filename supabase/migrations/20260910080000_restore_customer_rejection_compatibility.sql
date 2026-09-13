-- Restore the customer rejection RPC lost when the later cancellation migration was rewritten.
-- Include the terminal stage introduced by that later migration in the workflow constraint.
alter table public.service_requests
  drop constraint if exists service_requests_workflow_stage_check;

alter table public.service_requests
  add constraint service_requests_workflow_stage_check
  check (workflow_stage in (
    'awaiting_assignment', 'assigned', 'technician_accepted', 'completed',
    'needs_followup', 'customer_rejected', 'customer_cancelled', 'cancelled'
  ));

create or replace function public.customer_reject_repair(
  target_service_request_id uuid,
  rejection_notes text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare current_stage text;
begin
  select workflow_stage into current_stage
  from public.service_requests
  where id = target_service_request_id and customer_id = auth.uid()
  for update;

  if not found then raise exception 'request_not_found'; end if;
  if current_stage <> 'needs_followup' then
    raise exception 'repair_rejection_not_available';
  end if;

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
  where id = target_service_request_id and customer_id = auth.uid();
end;
$$;

revoke all on function public.customer_reject_repair(uuid,text) from public;
grant execute on function public.customer_reject_repair(uuid,text) to authenticated;
