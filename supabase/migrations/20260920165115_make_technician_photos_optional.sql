create or replace function public.technician_record_visit_outcome(target_service_request_id uuid,new_outcome text,outcome_notes text default null)
returns void language plpgsql security definer set search_path = public,pg_temp as $$
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
