-- Reasons make declined assignments and reassignment decisions reviewable.
create or replace function public.technician_respond_to_assignment(
  target_assignment_id uuid,
  new_status text,
  response_notes text default null
) returns void language plpgsql security definer set search_path=public as $$
declare technician_user_id uuid; current_status text;
begin
 if new_status not in ('accepted','rejected') then raise exception 'invalid_assignment_response'; end if;
 if new_status = 'rejected' and nullif(trim(coalesce(response_notes,'')),'') is null then raise exception 'rejection_reason_required'; end if;
 select t.profile_id,a.status into technician_user_id,current_status
 from public.service_request_assignments a join public.technicians t on t.id=a.technician_id where a.id=target_assignment_id for update;
 if technician_user_id is null then raise exception 'assignment_not_found'; end if;
 if technician_user_id <> auth.uid() then raise exception 'insufficient_privilege'; end if;
 if current_status <> 'pending' then raise exception 'assignment_not_pending'; end if;
 update public.service_request_assignments set status=new_status,responded_at=now(),notes=nullif(left(trim(coalesce(response_notes,'')),500),'') where id=target_assignment_id;
end $$;
revoke all on function public.technician_respond_to_assignment(uuid,text,text) from public,anon;
grant execute on function public.technician_respond_to_assignment(uuid,text,text) to authenticated;

create or replace function public.admin_reassign_service_request(target_service_request_id uuid,target_technician_id uuid,reassignment_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare previous_assignment public.service_request_assignments%rowtype; new_assignment_id uuid;
begin
 if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 if nullif(trim(coalesce(reassignment_reason,'')),'') is null then raise exception 'reassignment_reason_required'; end if;
 select * into previous_assignment from public.service_request_assignments where service_request_id=target_service_request_id order by assigned_at desc,id desc limit 1;
 if not found or previous_assignment.status <> 'rejected' then raise exception 'reassignment_requires_rejection'; end if;
 perform public.admin_assign_service_request(target_service_request_id,target_technician_id);
 select id into new_assignment_id from public.service_request_assignments where service_request_id=target_service_request_id and technician_id=target_technician_id order by assigned_at desc,id desc limit 1;
 update public.service_request_assignments set notes=left('سبب إعادة الإسناد: ' || trim(reassignment_reason),500) where id=new_assignment_id;
 insert into public.service_request_events(service_request_id,actor_id,event_type,details)
 values(target_service_request_id,auth.uid(),'assignment_reassigned',jsonb_build_object('from_technician_id',previous_assignment.technician_id,'to_technician_id',target_technician_id,'reason',left(trim(reassignment_reason),500)));
end $$;
revoke all on function public.admin_reassign_service_request(uuid,uuid,text) from public,anon;
grant execute on function public.admin_reassign_service_request(uuid,uuid,text) to authenticated;

-- The request event stream is the audit log used by all participants.
create or replace function public.log_assignment_audit_event()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
  insert into public.service_request_events(service_request_id,actor_id,event_type,details)
  values(new.service_request_id,auth.uid(),'assignment_created',jsonb_build_object('technician_id',new.technician_id));
 elsif old.status is distinct from new.status then
  insert into public.service_request_events(service_request_id,actor_id,event_type,details)
  values(new.service_request_id,auth.uid(),'assignment_status_changed',jsonb_build_object('technician_id',new.technician_id,'from_status',old.status,'to_status',new.status,'notes',new.notes));
 end if;
 return new;
end $$;
drop trigger if exists service_request_assignment_audit_trigger on public.service_request_assignments;
create trigger service_request_assignment_audit_trigger after insert or update of status on public.service_request_assignments
for each row execute function public.log_assignment_audit_event();
revoke all on function public.log_assignment_audit_event() from public,anon,authenticated;
