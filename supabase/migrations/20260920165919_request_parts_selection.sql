alter table public.service_requests add column if not exists requested_parts jsonb not null default '[]'::jsonb;

create or replace function public.technician_record_visit_outcome(target_service_request_id uuid,new_outcome text,outcome_notes text default null,selected_parts jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public,pg_temp as $$
declare tech_id uuid; stage text; target_stage text;
begin
 if new_outcome not in ('completed','needs_followup','reschedule_requested','unable_to_complete') then raise exception 'invalid_visit_outcome'; end if;
 if jsonb_typeof(coalesce(selected_parts,'[]'::jsonb)) <> 'array' then raise exception 'invalid_requested_parts'; end if;
 if new_outcome = 'needs_followup' and jsonb_array_length(coalesce(selected_parts,'[]'::jsonb)) = 0 then raise exception 'requested_parts_required'; end if;
 select id into tech_id from public.technicians where profile_id = auth.uid() and is_active;
 if tech_id is null then raise exception 'technician_not_found'; end if;
 select workflow_stage into stage from public.service_requests where id = target_service_request_id for update;
 if stage <> 'in_progress' then raise exception 'invalid_workflow_transition'; end if;
 if not exists (select 1 from public.service_request_assignments where service_request_id = target_service_request_id and technician_id = tech_id and status = 'accepted') then raise exception 'accepted_assignment_not_found'; end if;
 target_stage := case when new_outcome = 'completed' then 'awaiting_completion_review' else new_outcome end;
 update public.service_requests set workflow_stage = target_stage, visit_outcome = new_outcome, visit_notes = nullif(trim(outcome_notes),''), requested_parts = case when new_outcome='needs_followup' then coalesce(selected_parts,'[]'::jsonb) else '[]'::jsonb end, workflow_updated_at = now() where id = target_service_request_id;
end; $$;
revoke all on function public.technician_record_visit_outcome(uuid,text,text,jsonb) from public,anon;
grant execute on function public.technician_record_visit_outcome(uuid,text,text,jsonb) to authenticated;

create policy "technicians read active catalog parts" on public.service_catalog_parts for select to authenticated
using (is_active and public.current_user_has_role(array['technician']::public.app_role[]));
