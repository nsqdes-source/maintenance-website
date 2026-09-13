-- Local-only acceptance test. Run with: Get-Content -Raw supabase/tests/workflow_v2_acceptance.sql | docker exec -i supabase_db_maintenance-website psql -v ON_ERROR_STOP=1 -U postgres -d postgres
begin;
do $$
declare
 admin_user uuid := gen_random_uuid();
 technician_user uuid := gen_random_uuid();
 customer_user uuid := gen_random_uuid();
 technician_id uuid;
 request_id uuid;
 assignment_id uuid;
 quote_id uuid;
 stage text;
 assignment_state text;
 event_count integer;
begin
 insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at,email_confirmed_at)
 values
 (admin_user,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin-acceptance@example.local','',now(),now(),now()),
 (technician_user,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','tech-acceptance@example.local','',now(),now(),now()),
 (customer_user,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','customer-acceptance@example.local','',now(),now(),now());
 update public.profiles set role='admin_manager' where id=admin_user;
 update public.profiles set role='technician' where id=technician_user;
 insert into public.technicians(profile_id) values(technician_user) returning id into technician_id;

 perform set_config('request.jwt.claim.sub',customer_user::text,true);
 select r.request_id into request_id from public.submit_service_request_with_images(
 'Customer','0501234567','customer-acceptance@example.local','AC','Problem','Jeddah','Street',21.5,39.1) r;
 if not exists(select 1 from public.service_request_events where service_request_id=request_id and event_type='request_created') then raise exception 'missing creation event'; end if;

 perform set_config('request.jwt.claim.sub',admin_user::text,true);
 perform public.admin_assign_service_request(request_id,technician_id);
 select id into assignment_id from public.service_request_assignments where service_request_id=request_id and status='pending';

 perform set_config('request.jwt.claim.sub',technician_user::text,true);
 perform public.technician_respond_to_assignment(assignment_id,'accepted',null);
 perform set_config('request.jwt.claim.sub',admin_user::text,true);
 perform public.admin_advance_service_request(request_id,'in_progress');
 perform set_config('request.jwt.claim.sub',technician_user::text,true);
 perform public.technician_record_visit_outcome(request_id,'needs_followup','Part needed');

 perform set_config('request.jwt.claim.sub',admin_user::text,true);
 perform public.admin_advance_service_request(request_id,'awaiting_admin_quote');
 quote_id := public.admin_submit_service_request_quote(request_id,'Replace part','Part A',100,50);
 perform set_config('request.jwt.claim.sub',customer_user::text,true);
 perform public.customer_decide_service_request_quote(quote_id,true,'Approved');
 perform set_config('request.jwt.claim.sub',admin_user::text,true);
 perform public.admin_advance_service_request(request_id,'in_progress');
 perform set_config('request.jwt.claim.sub',technician_user::text,true);
 perform public.technician_record_visit_outcome(request_id,'completed','Done');

 select workflow_stage into stage from public.service_requests where id=request_id;
 select status into assignment_state from public.service_request_assignments where id=assignment_id;
 select count(*) into event_count from public.service_request_events where service_request_id=request_id;
 if stage <> 'completed' or assignment_state <> 'completed' or event_count < 8 then
  raise exception 'workflow mismatch: %, %, %',stage,assignment_state,event_count;
 end if;
 if exists(select 1 from public.service_request_assignments where service_request_id=request_id and status in ('pending','accepted')) then raise exception 'active assignment after completion'; end if;
 if has_function_privilege('anon','public.customer_cancel_service_request(uuid,text)','EXECUTE')
  or has_function_privilege('anon','public.customer_decide_service_request_quote(uuid,boolean,text)','EXECUTE')
  or has_table_privilege('authenticated','public.service_request_assignments','UPDATE') then raise exception 'privilege regression'; end if;
 if not exists(select 1 from public.notifications where service_request_id=request_id) then raise exception 'missing notifications'; end if;
 perform set_config('request.jwt.claim.sub',customer_user::text,true);
 select r.request_id into request_id from public.submit_service_request_with_images(
 'Customer','0501234567','customer-acceptance@example.local','AC','Followup case','Jeddah','Street',21.5,39.1) r;
 perform set_config('request.jwt.claim.sub',admin_user::text,true);
 perform public.admin_assign_service_request(request_id,technician_id);
 select id into assignment_id from public.service_request_assignments where service_request_id=request_id and status='pending';
 perform set_config('request.jwt.claim.sub',technician_user::text,true);
 perform public.technician_respond_to_assignment(assignment_id,'accepted',null);
 perform set_config('request.jwt.claim.sub',admin_user::text,true);
 perform public.admin_advance_service_request(request_id,'in_progress');
 perform set_config('request.jwt.claim.sub',technician_user::text,true);
 perform public.technician_record_visit_outcome(request_id,'needs_followup','Part needed');
 perform set_config('request.jwt.claim.sub',customer_user::text,true);
 perform public.customer_reject_repair(request_id,'Declined');
 select workflow_stage into stage from public.service_requests where id=request_id;
 if stage <> 'customer_rejected' then raise exception 'legacy rejection unavailable: %',stage; end if;
 select status into assignment_state from public.service_request_assignments where id=assignment_id;
 if assignment_state <> 'cancelled' then raise exception 'active assignment after rejection: %',assignment_state; end if;
 if has_function_privilege('anon','public.customer_reject_repair(uuid,text)','EXECUTE') then
  raise exception 'legacy rejection callable by anon';
 end if; raise notice 'PASS: Workflow V2 acceptance and access checks';
end $$;
rollback;
