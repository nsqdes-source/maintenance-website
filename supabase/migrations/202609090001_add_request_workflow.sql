-- Automatic service-request workflow.
-- workflow_stage is authoritative; legacy status is synchronized for compatibility.

alter table public.service_requests
  add column if not exists workflow_stage text not null default 'awaiting_assignment',
  add column if not exists visit_outcome text,
  add column if not exists visit_notes text,
  add column if not exists workflow_updated_at timestamptz not null default now();

alter table public.service_requests drop constraint if exists service_requests_workflow_stage_check;
alter table public.service_requests add constraint service_requests_workflow_stage_check
check (workflow_stage in ('awaiting_assignment','assigned','technician_accepted','completed','needs_followup','customer_rejected','cancelled'));

alter table public.service_requests drop constraint if exists service_requests_visit_outcome_check;
alter table public.service_requests add constraint service_requests_visit_outcome_check
check (visit_outcome is null or visit_outcome in ('completed','needs_followup','customer_rejected'));

create or replace function public.sync_service_request_workflow(target_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  current_stage text;
  accepted_count integer;
  pending_count integer;
  rejected_count integer;
  outcome text;
  derived_stage text;
  legacy_status text;
begin
  select workflow_stage, visit_outcome into current_stage, outcome
  from public.service_requests where id = target_request_id;
  if not found then return; end if;
  if current_stage = 'cancelled' then return; end if;

  if outcome = 'completed' then
    derived_stage := 'completed';
  elsif outcome = 'needs_followup' then
    derived_stage := 'needs_followup';
  elsif outcome = 'customer_rejected' then
    derived_stage := 'customer_rejected';
  else
    select count(*) filter (where status = 'accepted'),
           count(*) filter (where status = 'pending'),
           count(*) filter (where status = 'rejected')
      into accepted_count, pending_count, rejected_count
    from public.service_request_assignments
    where service_request_id = target_request_id;

    if accepted_count > 0 then derived_stage := 'technician_accepted';
    elsif pending_count > 0 then derived_stage := 'assigned';
    else derived_stage := 'awaiting_assignment';
    end if;
  end if;

  legacy_status := case derived_stage
    when 'completed' then 'completed'
    when 'cancelled' then 'cancelled'
    when 'assigned' then 'scheduled'
    when 'technician_accepted' then 'scheduled'
    when 'needs_followup' then 'scheduled'
    when 'customer_rejected' then 'cancelled'
    else 'new'
  end;

  update public.service_requests
  set workflow_stage = derived_stage,
      status = legacy_status,
      workflow_updated_at = now()
  where id = target_request_id
    and (workflow_stage is distinct from derived_stage or status is distinct from legacy_status);
end;
$$;

create or replace function public.trg_sync_service_request_workflow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_service_request_workflow(coalesce(new.service_request_id, old.service_request_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists service_request_assignment_workflow_trigger on public.service_request_assignments;
create trigger service_request_assignment_workflow_trigger
after insert or update of status or delete on public.service_request_assignments
for each row execute function public.trg_sync_service_request_workflow();

create or replace function public.trg_sync_new_service_request_workflow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_service_request_workflow(new.id);
  return new;
end;
$$;

drop trigger if exists service_request_initial_workflow_trigger on public.service_requests;
create trigger service_request_initial_workflow_trigger
after insert on public.service_requests
for each row execute function public.trg_sync_new_service_request_workflow();

-- Backfill existing requests from their current assignment state.
do $$
declare request_row record;
begin
  for request_row in select id from public.service_requests loop
    perform public.sync_service_request_workflow(request_row.id);
  end loop;
end;
$$;

create or replace function public.technician_record_visit_outcome(
  target_service_request_id uuid,
  new_outcome text,
  outcome_notes text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare technician_row_id uuid;
begin
  if new_outcome not in ('completed','needs_followup','customer_rejected') then
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
    and workflow_stage not in ('completed','cancelled','customer_rejected');
  if not found then raise exception 'request_already_closed'; end if;

  perform public.sync_service_request_workflow(target_service_request_id);
end;
$$;

revoke all on function public.sync_service_request_workflow(uuid) from public;
revoke all on function public.trg_sync_service_request_workflow() from public;
revoke all on function public.trg_sync_new_service_request_workflow() from public;
grant execute on function public.technician_record_visit_outcome(uuid,text,text) to authenticated;
