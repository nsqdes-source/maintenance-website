-- Quotes and archive are separate from request workflow status.
alter table public.service_requests add column archived_at timestamptz;
alter table public.service_requests add column archived_by uuid references public.profiles(id) on delete set null;
create table public.service_request_quotes (
 id uuid primary key default gen_random_uuid(),
 service_request_id uuid not null references public.service_requests(id) on delete cascade,
 description text not null,
 parts_description text,
 parts_cost numeric(12,2) not null default 0 check(parts_cost >= 0),
 labor_cost numeric(12,2) not null default 0 check(labor_cost >= 0),
 status text not null default 'pending' check(status in ('pending','approved','rejected','superseded')),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 customer_notes text
);
create unique index service_request_one_pending_quote_idx on public.service_request_quotes(service_request_id) where status = 'pending';
create index service_request_quotes_request_idx on public.service_request_quotes(service_request_id,created_at desc);
alter table public.service_request_quotes enable row level security;
grant select on public.service_request_quotes to authenticated;
create policy "participants read quotes" on public.service_request_quotes for select to authenticated
using (exists(select 1 from public.service_requests r where r.id = service_request_id and
 (r.customer_id = (select auth.uid()) or public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[])
 or exists(select 1 from public.service_request_assignments a join public.technicians t on t.id = a.technician_id where a.service_request_id = r.id and t.profile_id = (select auth.uid())))));
create or replace function public.admin_submit_service_request_quote(target_service_request_id uuid,quote_description text,quote_parts_description text,quote_parts_cost numeric,quote_labor_cost numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare stage text; quote_id uuid;
begin
 if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 select workflow_stage into stage from public.service_requests where id = target_service_request_id for update;
 if stage <> 'awaiting_admin_quote' then raise exception 'invalid_workflow_transition'; end if;
 if nullif(trim(quote_description),'') is null or quote_parts_cost < 0 or quote_labor_cost < 0 then raise exception 'invalid_quote'; end if;
 insert into public.service_request_quotes(service_request_id,description,parts_description,parts_cost,labor_cost,created_by)
 values(target_service_request_id,trim(quote_description),nullif(trim(quote_parts_description),''),quote_parts_cost,quote_labor_cost,auth.uid()) returning id into quote_id;
 update public.service_requests set workflow_stage = 'awaiting_customer_approval',workflow_updated_at = now() where id = target_service_request_id;
 return quote_id;
end; $$;
revoke all on function public.admin_submit_service_request_quote(uuid,text,text,numeric,numeric) from public,anon;
grant execute on function public.admin_submit_service_request_quote(uuid,text,text,numeric,numeric) to authenticated;
create or replace function public.customer_decide_service_request_quote(target_quote_id uuid,approve boolean,decision_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare rid uuid; stage text;
begin
 select q.service_request_id,r.workflow_stage into rid,stage from public.service_request_quotes q
 join public.service_requests r on r.id = q.service_request_id
 where q.id = target_quote_id and q.status = 'pending' and r.customer_id = auth.uid() for update of q,r;
 if not found then raise exception 'quote_not_found'; end if;
 if stage <> 'awaiting_customer_approval' then raise exception 'invalid_workflow_transition'; end if;
 update public.service_request_quotes set status = case when approve then 'approved' else 'rejected' end,
 decided_at = now(),customer_notes = nullif(trim(decision_notes),'') where id = target_quote_id;
 update public.service_requests set workflow_stage = case when approve then 'quote_approved' else 'customer_rejected' end,
 workflow_updated_at = now() where id = rid;
end; $$;
revoke all on function public.customer_decide_service_request_quote(uuid,boolean,text) from public,anon;
grant execute on function public.customer_decide_service_request_quote(uuid,boolean,text) to authenticated;
create or replace function public.admin_set_service_request_archive(target_service_request_id uuid,should_archive boolean)
returns void language plpgsql security definer set search_path = public as $$
declare stage text;
begin
 if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 select workflow_stage into stage from public.service_requests where id = target_service_request_id for update;
 if not found then raise exception 'request_not_found'; end if;
 if should_archive and stage not in ('completed','customer_rejected','customer_cancelled','cancelled') then raise exception 'request_not_closed'; end if;
 update public.service_requests set archived_at = case when should_archive then now() else null end,
 archived_by = case when should_archive then auth.uid() else null end where id = target_service_request_id;
end; $$;
revoke all on function public.admin_set_service_request_archive(uuid,boolean) from public,anon;
grant execute on function public.admin_set_service_request_archive(uuid,boolean) to authenticated;
create or replace function public.customer_reject_repair(target_service_request_id uuid,rejection_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare pending_quote_id uuid;
begin
 if not exists(select 1 from public.service_requests where id = target_service_request_id
  and customer_id = auth.uid() and workflow_stage = 'awaiting_customer_approval' for update) then
  raise exception 'repair_rejection_not_available'; end if;
 select id into pending_quote_id from public.service_request_quotes
 where service_request_id = target_service_request_id and status = 'pending' for update;
 if pending_quote_id is null then raise exception 'quote_not_found'; end if;
 perform public.customer_decide_service_request_quote(pending_quote_id,false,rejection_notes);
end; $$;
revoke all on function public.customer_reject_repair(uuid,text) from public,anon;
grant execute on function public.customer_reject_repair(uuid,text) to authenticated;
create or replace function public.customer_cancel_service_request(target_service_request_id uuid,cancellation_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare stage text;
begin
 select workflow_stage into stage from public.service_requests
 where id = target_service_request_id and customer_id = auth.uid() for update;
 if not found then raise exception 'request_not_found'; end if;
 if stage not in ('awaiting_assignment','assigned') then raise exception 'request_cannot_be_cancelled'; end if;
 update public.service_requests set workflow_stage = 'customer_cancelled',status = 'cancelled',
 visit_notes = case when nullif(trim(cancellation_reason),'') is null then visit_notes
  else concat_ws(E'\n',visit_notes,'Cancellation: ' || trim(cancellation_reason)) end,
 workflow_updated_at = now() where id = target_service_request_id;
end; $$;
revoke all on function public.customer_cancel_service_request(uuid,text) from public,anon;
grant execute on function public.customer_cancel_service_request(uuid,text) to authenticated;
revoke all on table public.service_request_quotes from public,anon,authenticated;
grant select on table public.service_request_quotes to authenticated;
