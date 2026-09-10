-- Customer-controlled cancellation/rejection workflow.
-- This migration is intentionally additive; previous migrations remain unchanged.

create or replace function public.sync_service_request_workflow(target_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  current_stage text;
  accepted_count integer;
  pending_count integer;
  outcome text;
  derived_stage text;
  legacy_status text;
begin
  select workflow_stage, visit_outcome into current_stage, outcome
  from public.service_requests where id = target_request_id;
  if not found then return; end if;
  if current_stage in ('completed','cancelled','customer_rejected','customer_cancelled') then return; end if;
  if outcome = 'completed' then derived_stage := 'completed';
  elsif outcome = 'needs_followup' then derived_stage := 'needs_followup';
  elsif outcome = 'customer_rejected' then derived_stage := 'customer_rejected';
  else
    select count(*) filter (where status = 'accepted'), count(*) filter (where status = 'pending')
      into accepted_count, pending_count
    from public.service_request_assignments where service_request_id = target_request_id;
    if accepted_count > 0 then derived_stage := 'technician_accepted';
    elsif pending_count > 0 then derived_stage := 'assigned';
    else derived_stage := 'awaiting_assignment'; end if;
  end if;
  legacy_status := case derived_stage
    when 'completed' then 'completed'
    when 'cancelled' then 'cancelled'
    when 'customer_rejected' then 'cancelled'
    when 'customer_cancelled' then 'cancelled'
    when 'assigned' then 'scheduled'
    when 'technician_accepted' then 'scheduled'
    when 'needs_followup' then 'scheduled'
    else 'new' end;
  update public.service_requests set workflow_stage = derived_stage, status = legacy_status, workflow_updated_at = now()
  where id = target_request_id and (workflow_stage is distinct from derived_stage or status is distinct from legacy_status);
end;
$$;

drop function if exists public.customer_cancel_service_request(uuid);
grant execute on function public.customer_cancel_service_request(uuid,text) to authenticated;
grant execute on function public.customer_reject_repair(uuid,text) to authenticated;
