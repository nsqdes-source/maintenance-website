-- Workflow V2
alter table public.service_request_assignments drop constraint if exists assignment_status_chk;
alter table public.service_request_assignments add constraint assignment_status_chk check (status in ('pending','accepted','rejected','cancelled','completed'));
alter table public.service_requests drop constraint if exists service_requests_workflow_stage_check;
alter table public.service_requests add constraint service_requests_workflow_stage_check check (workflow_stage in ('awaiting_assignment','assigned','technician_accepted','in_progress','completed','needs_followup','awaiting_admin_quote','awaiting_customer_approval','quote_approved','customer_rejected','customer_cancelled','cancelled'));
create table public.service_request_events (id uuid primary key default gen_random_uuid(),service_request_id uuid not null references public.service_requests(id) on delete cascade,actor_id uuid references public.profiles(id) on delete set null,event_type text not null,from_stage text,to_stage text,details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create index service_request_events_request_idx on public.service_request_events(service_request_id,created_at desc);
alter table public.service_request_events enable row level security;
grant select on public.service_request_events to authenticated;
create policy "participants read events" on public.service_request_events for select to authenticated using (exists (select 1 from public.service_requests r where r.id = service_request_id and (r.customer_id = (select auth.uid()) or public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) or exists (select 1 from public.service_request_assignments a join public.technicians t on t.id = a.technician_id where a.service_request_id = r.id and t.profile_id = (select auth.uid())))));
create or replace function public.sync_service_request_workflow(target_request_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare stage text; next_stage text; legacy text;
begin
 select workflow_stage into stage from public.service_requests where id = target_request_id for update;
 if not found then return; end if;
 next_stage := stage;
 if stage in ('awaiting_assignment','assigned','technician_accepted') then
  if exists (select 1 from public.service_request_assignments where service_request_id = target_request_id and status = 'accepted') then next_stage := 'technician_accepted';
  elsif exists (select 1 from public.service_request_assignments where service_request_id = target_request_id and status = 'pending') then next_stage := 'assigned';
  else next_stage := 'awaiting_assignment'; end if;
 end if;
 legacy := case when next_stage = 'completed' then 'completed' when next_stage in ('customer_rejected','customer_cancelled','cancelled') then 'cancelled' when next_stage = 'awaiting_assignment' then 'new' else 'scheduled' end;
 update public.service_requests set workflow_stage = next_stage,status = legacy,workflow_updated_at = now() where id = target_request_id and (workflow_stage is distinct from next_stage or status is distinct from legacy);
 if next_stage = 'completed' then update public.service_request_assignments set status = 'completed',responded_at = coalesce(responded_at,now()) where service_request_id = target_request_id and status = 'accepted';
 elsif next_stage in ('customer_rejected','customer_cancelled','cancelled') then update public.service_request_assignments set status = 'cancelled',responded_at = coalesce(responded_at,now()) where service_request_id = target_request_id and status in ('pending','accepted'); end if;
end; $$;
create or replace function public.log_service_request_stage_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
 if old.workflow_stage is distinct from new.workflow_stage then insert into public.service_request_events(service_request_id,actor_id,event_type,from_stage,to_stage) values(new.id,auth.uid(),'stage_changed',old.workflow_stage,new.workflow_stage); end if;
 return new;
end; $$;
create trigger service_request_stage_event_trigger after update of workflow_stage on public.service_requests for each row execute function public.log_service_request_stage_change();
create or replace function public.technician_record_visit_outcome(target_service_request_id uuid,new_outcome text,outcome_notes text default null) returns void language plpgsql security definer set search_path = public as $$
declare tech_id uuid; stage text;
begin
 if new_outcome not in ('completed','needs_followup') then raise exception 'invalid_visit_outcome'; end if;
 select id into tech_id from public.technicians where profile_id = auth.uid() and is_active;
 if tech_id is null then raise exception 'technician_not_found'; end if;
 select workflow_stage into stage from public.service_requests where id = target_service_request_id for update;
 if stage <> 'in_progress' then raise exception 'invalid_workflow_transition'; end if;
 if not exists (select 1 from public.service_request_assignments where service_request_id = target_service_request_id and technician_id = tech_id and status = 'accepted') then raise exception 'accepted_assignment_not_found'; end if;
 update public.service_requests set workflow_stage = new_outcome,visit_outcome = new_outcome,visit_notes = nullif(trim(outcome_notes),''),workflow_updated_at = now() where id = target_service_request_id;
end; $$;
revoke all on function public.technician_record_visit_outcome(uuid,text,text) from public,anon;
grant execute on function public.technician_record_visit_outcome(uuid,text,text) to authenticated;
update public.service_request_assignments a set status = 'completed',responded_at = coalesce(responded_at,now()) from public.service_requests r where r.id = a.service_request_id and r.workflow_stage = 'completed' and a.status = 'accepted';
create or replace function public.admin_advance_service_request(target_service_request_id uuid,new_stage text)
returns void language plpgsql security definer set search_path = public as $$
declare current_stage text;
begin
 if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 select workflow_stage into current_stage from public.service_requests where id = target_service_request_id for update;
 if not found then raise exception 'request_not_found'; end if;
 if not ((current_stage = 'technician_accepted' and new_stage = 'in_progress') or
 (current_stage = 'needs_followup' and new_stage = 'awaiting_admin_quote') or
 (current_stage = 'quote_approved' and new_stage = 'in_progress')) then raise exception 'invalid_workflow_transition'; end if;
 update public.service_requests set workflow_stage = new_stage,workflow_updated_at = now() where id = target_service_request_id;
end; $$;
revoke all on function public.admin_advance_service_request(uuid,text) from public,anon;
grant execute on function public.admin_advance_service_request(uuid,text) to authenticated;
create or replace function public.prevent_assignment_on_closed_request()
returns trigger language plpgsql set search_path = public as $$
declare stage text;
begin
 if new.status in ('pending','accepted') then
  select workflow_stage into stage from public.service_requests where id = new.service_request_id;
  if stage in ('completed','customer_rejected','customer_cancelled','cancelled') then raise exception 'request_already_closed'; end if;
 end if;
 return new;
end; $$;
create trigger prevent_assignment_on_closed_request before insert or update of status on public.service_request_assignments
for each row execute function public.prevent_assignment_on_closed_request();
revoke all on function public.prevent_assignment_on_closed_request() from public,anon,authenticated;
-- All lifecycle mutations go through audited RPCs, not direct Data API writes.
revoke insert,update on public.service_request_assignments from authenticated;
revoke update on public.service_requests from authenticated;

create or replace function public.admin_assign_service_request(target_service_request_id uuid,target_technician_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare stage text;
begin
 if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_service_request_id::text,0));
 select workflow_stage into stage from public.service_requests where id = target_service_request_id for update;
 if not found then raise exception 'service_request_not_found'; end if;
 if stage not in ('awaiting_assignment','assigned','technician_accepted') then raise exception 'invalid_workflow_transition'; end if;
 if not exists(select 1 from public.technicians where id = target_technician_id and is_active) then raise exception 'technician_not_found'; end if;
 if exists(select 1 from public.service_request_assignments where service_request_id = target_service_request_id
  and technician_id = target_technician_id and status in ('pending','accepted')) then return; end if;
 update public.service_request_assignments set status = 'cancelled',responded_at = coalesce(responded_at,now())
 where service_request_id = target_service_request_id and status in ('pending','accepted');
 insert into public.service_request_assignments(service_request_id,technician_id,assigned_by)
 values(target_service_request_id,target_technician_id,auth.uid());
end; $$;
revoke all on function public.admin_assign_service_request(uuid,uuid) from public,anon;
grant execute on function public.admin_assign_service_request(uuid,uuid) to authenticated;
revoke all on table public.service_request_events from public,anon,authenticated;
grant select on table public.service_request_events to authenticated;
revoke all on function public.log_service_request_stage_change() from public,anon,authenticated;
