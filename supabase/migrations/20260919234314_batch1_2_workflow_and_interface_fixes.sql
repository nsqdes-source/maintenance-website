-- Batch 1 + 2: clearer operational lifecycle without altering historical data.
alter table public.service_requests
  add column if not exists confirmed_date date,
  add column if not exists confirmed_time_period text,
  add column if not exists appointment_notes text,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_actor_id uuid references public.profiles(id) on delete set null,
  add column if not exists completion_reviewed_at timestamptz,
  add column if not exists completion_reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.service_requests drop constraint if exists service_requests_workflow_stage_check;
alter table public.service_requests add constraint service_requests_workflow_stage_check check (workflow_stage in (
  'awaiting_assignment','assigned','technician_accepted','in_progress','awaiting_completion_review',
  'needs_followup','reschedule_requested','unable_to_complete','awaiting_admin_quote',
  'awaiting_customer_approval','quote_approved','completed','customer_rejected','customer_cancelled','cancelled'
));

create or replace function public.technician_record_visit_outcome(target_service_request_id uuid,new_outcome text,outcome_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare tech_id uuid; stage text; target_stage text;
begin
  if new_outcome not in ('completed','needs_followup','reschedule_requested','unable_to_complete') then raise exception 'invalid_visit_outcome'; end if;
  select id into tech_id from public.technicians where profile_id = auth.uid() and is_active;
  if tech_id is null then raise exception 'technician_not_found'; end if;
  select workflow_stage into stage from public.service_requests where id = target_service_request_id for update;
  if stage <> 'in_progress' then raise exception 'invalid_workflow_transition'; end if;
  if not exists (select 1 from public.service_request_assignments where service_request_id = target_service_request_id and technician_id = tech_id and status = 'accepted') then raise exception 'accepted_assignment_not_found'; end if;
  target_stage := case when new_outcome = 'completed' then 'awaiting_completion_review' else new_outcome end;
  update public.service_requests set workflow_stage = target_stage, visit_outcome = new_outcome,
    visit_notes = nullif(trim(outcome_notes),''), workflow_updated_at = now()
  where id = target_service_request_id;
end; $$;
revoke all on function public.technician_record_visit_outcome(uuid,text,text) from public,anon;
grant execute on function public.technician_record_visit_outcome(uuid,text,text) to authenticated;

create or replace function public.admin_advance_service_request(target_service_request_id uuid,new_stage text)
returns void language plpgsql security definer set search_path = public as $$
declare current_stage text;
begin
  if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
  select workflow_stage into current_stage from public.service_requests where id = target_service_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if not ((current_stage = 'technician_accepted' and new_stage = 'in_progress') or
    (current_stage = 'needs_followup' and new_stage = 'awaiting_admin_quote') or
    (current_stage = 'quote_approved' and new_stage = 'in_progress') or
    (current_stage = 'awaiting_completion_review' and new_stage = 'completed') or
    (current_stage in ('reschedule_requested','unable_to_complete') and new_stage = 'in_progress')) then raise exception 'invalid_workflow_transition'; end if;
  update public.service_requests set workflow_stage = new_stage, workflow_updated_at = now(),
    completion_reviewed_at = case when new_stage = 'completed' then now() else completion_reviewed_at end,
    completion_reviewed_by = case when new_stage = 'completed' then auth.uid() else completion_reviewed_by end
  where id = target_service_request_id;
end; $$;
revoke all on function public.admin_advance_service_request(uuid,text) from public,anon;
grant execute on function public.admin_advance_service_request(uuid,text) to authenticated;

create or replace function public.admin_confirm_service_request_appointment(target_service_request_id uuid,appointment_date date,appointment_time_period text,notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare current_stage text;
begin
  if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
  if appointment_date is null or appointment_date < current_date or nullif(trim(appointment_time_period),'') is null then raise exception 'invalid_appointment'; end if;
  select workflow_stage into current_stage from public.service_requests where id = target_service_request_id for update;
  if current_stage not in ('technician_accepted','reschedule_requested') then raise exception 'invalid_workflow_transition'; end if;
  update public.service_requests set confirmed_date = appointment_date, confirmed_time_period = trim(appointment_time_period),
    appointment_notes = nullif(trim(notes),''), workflow_stage = 'technician_accepted', workflow_updated_at = now()
  where id = target_service_request_id;
end; $$;
revoke all on function public.admin_confirm_service_request_appointment(uuid,date,text,text) from public,anon;
grant execute on function public.admin_confirm_service_request_appointment(uuid,date,text,text) to authenticated;

create or replace function public.admin_cancel_service_request(target_service_request_id uuid,reason text)
returns void language plpgsql security definer set search_path = public as $$
declare current_stage text;
begin
  if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
  if nullif(trim(reason),'') is null then raise exception 'cancellation_reason_required'; end if;
  select workflow_stage into current_stage from public.service_requests where id = target_service_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if current_stage in ('completed','customer_rejected','customer_cancelled','cancelled') then raise exception 'request_already_closed'; end if;
  update public.service_requests set workflow_stage = 'cancelled', status = 'cancelled', cancellation_reason = trim(reason),
    cancellation_actor_id = auth.uid(), workflow_updated_at = now() where id = target_service_request_id;
end; $$;
revoke all on function public.admin_cancel_service_request(uuid,text) from public,anon;
grant execute on function public.admin_cancel_service_request(uuid,text) to authenticated;
