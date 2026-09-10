-- Customer-controlled cancellation/rejection workflow.
-- Cancellation is for requests before repair completion; rejection is only for a
-- technician-reported follow-up (part/modification) decision.

create or replace function public.customer_cancel_service_request(target_service_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare current_stage text;
begin
  select workflow_stage into current_stage
  from public.service_requests
  where id = target_service_request_id and customer_id = auth.uid();

  if not found then raise exception 'request_not_found'; end if;
  if current_stage not in ('awaiting_assignment','assigned','technician_accepted') then
    raise exception 'request_cannot_be_cancelled';
  end if;

  update public.service_requests
  set workflow_stage = 'cancelled', status = 'cancelled', workflow_updated_at = now()
  where id = target_service_request_id and customer_id = auth.uid();

  update public.service_request_assignments
  set status = 'cancelled'
  where service_request_id = target_service_request_id
    and status in ('pending','accepted');
end;
$$;

create or replace function public.customer_reject_repair(target_service_request_id uuid, rejection_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare current_stage text;
begin
  select workflow_stage into current_stage
  from public.service_requests
  where id = target_service_request_id and customer_id = auth.uid();

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

revoke all on function public.customer_cancel_service_request(uuid) from public;
revoke all on function public.customer_reject_repair(uuid,text) from public;
grant execute on function public.customer_cancel_service_request(uuid) to authenticated;
grant execute on function public.customer_reject_repair(uuid,text) to authenticated;
