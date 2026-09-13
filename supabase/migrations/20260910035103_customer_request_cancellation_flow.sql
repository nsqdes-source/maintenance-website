-- Separate customer cancellation from technician visit outcomes.
alter table public.service_requests drop constraint if exists service_requests_workflow_stage_check;
alter table public.service_requests add constraint service_requests_workflow_stage_check
check (workflow_stage in ('awaiting_assignment','assigned','technician_accepted','completed','needs_followup','customer_rejected','customer_cancelled','cancelled'));

create or replace function public.customer_cancel_service_request(
  target_service_request_id uuid,
  cancellation_reason text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare current_stage text;
begin
  select workflow_stage into current_stage
  from public.service_requests
  where id = target_service_request_id and customer_id = auth.uid()
  for update;

  if not found then raise exception 'request_not_found'; end if;
  if current_stage in ('completed','cancelled','customer_rejected','customer_cancelled') then
    raise exception 'request_already_closed';
  end if;
  if current_stage = 'technician_accepted' then
    raise exception 'technician_already_accepted';
  end if;

  update public.service_requests
  set workflow_stage = 'customer_cancelled',
      status = 'cancelled',
      visit_notes = case
        when nullif(trim(cancellation_reason), '') is null then visit_notes
        when visit_notes is null then 'إلغاء العميل: ' || trim(cancellation_reason)
        else visit_notes || E'\nإلغاء العميل: ' || trim(cancellation_reason)
      end,
      workflow_updated_at = now()
  where id = target_service_request_id;
end;
$$;

create or replace function public.customer_reject_service_request(
  target_service_request_id uuid,
  rejection_reason text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare current_stage text;
begin
  select workflow_stage into current_stage
  from public.service_requests
  where id = target_service_request_id and customer_id = auth.uid()
  for update;

  if not found then raise exception 'request_not_found'; end if;
  if current_stage <> 'technician_accepted' then
    raise exception 'request_not_ready_for_rejection';
  end if;

  update public.service_requests
  set visit_outcome = 'customer_rejected',
      visit_notes = nullif(trim(rejection_reason), ''),
      workflow_updated_at = now()
  where id = target_service_request_id;

  perform public.sync_service_request_workflow(target_service_request_id);
end;
$$;

revoke all on function public.customer_cancel_service_request(uuid,text) from public;
revoke all on function public.customer_reject_service_request(uuid,text) from public;
grant execute on function public.customer_cancel_service_request(uuid,text) to authenticated;
grant execute on function public.customer_reject_service_request(uuid,text) to authenticated;

-- Technician can report completion/follow-up only; customer rejection is now customer-owned.
create or replace function public.technician_record_visit_outcome(
  target_service_request_id uuid,
  new_outcome text,
  outcome_notes text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare technician_row_id uuid;
begin
  if new_outcome not in ('completed','needs_followup') then
    raise exception 'invalid_visit_outcome';
  end if;

  select t.id into technician_row_id
  from public.technicians t
  where t.profile_id = auth.uid() and t.is_active = true limit 1;
  if technician_row_id is null then raise exception 'technician_not_found'; end if;

  if not exists (
    select 1 from public.service_request_assignments a
    where a.service_request_id = target_service_request_id
      and a.technician_id = technician_row_id and a.status = 'accepted'
  ) then raise exception 'accepted_assignment_not_found'; end if;

  update public.service_requests
  set visit_outcome = new_outcome,
      visit_notes = nullif(trim(outcome_notes), ''),
      workflow_updated_at = now()
  where id = target_service_request_id
    and workflow_stage not in ('completed','cancelled','customer_rejected','customer_cancelled');
  if not found then raise exception 'request_already_closed'; end if;

  perform public.sync_service_request_workflow(target_service_request_id);
end;
$$;

grant execute on function public.technician_record_visit_outcome(uuid,text,text) to authenticated;
