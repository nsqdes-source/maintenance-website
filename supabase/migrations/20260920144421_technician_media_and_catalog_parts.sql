-- Technician documentation is deliberately separate from customer-provided images.
alter table public.service_request_attachments
  add column if not exists attachment_stage text not null default 'customer'
    check (attachment_stage in ('customer','technician_arrival','technician_completion')),
  add column if not exists uploaded_by uuid references public.profiles(id) on delete set null;

create index if not exists service_request_attachments_stage_idx
  on public.service_request_attachments(service_request_id, attachment_stage, created_at);

-- Preserve the existing customer capability flow and its five-image limit.
create or replace function public.attach_service_request_image(target_request_id uuid,target_upload_token uuid,target_storage_path text,target_content_type text)
returns void language plpgsql security definer set search_path = public,pg_temp as $$
declare request_owner uuid;
begin
 select customer_id into request_owner from public.service_requests where id = target_request_id and upload_token = target_upload_token for update;
 if not found or not (request_owner is null and auth.uid() is null or request_owner = auth.uid()) then raise exception 'request_not_found'; end if;
 if target_content_type not in ('image/jpeg','image/png','image/webp') then raise exception 'invalid_image_type'; end if;
 if split_part(target_storage_path,'/',1) <> target_request_id::text or split_part(target_storage_path,'/',2) <> target_upload_token::text then raise exception 'invalid_image_path'; end if;
 if (select count(*) from public.service_request_attachments where service_request_id = target_request_id and attachment_stage = 'customer') >= 5 then raise exception 'attachment_limit_reached'; end if;
 if not exists(select 1 from storage.objects where bucket_id = 'request-images' and name = target_storage_path) then raise exception 'image_not_uploaded'; end if;
 insert into public.service_request_attachments(service_request_id,storage_path,content_type,attachment_stage,uploaded_by)
 values(target_request_id,target_storage_path,target_content_type,'customer',auth.uid());
end; $$;
revoke all on function public.attach_service_request_image(uuid,uuid,text,text) from public;
grant execute on function public.attach_service_request_image(uuid,uuid,text,text) to anon,authenticated;

create or replace function private.can_upload_technician_request_image(object_name text)
returns boolean language sql stable security definer set search_path = public,pg_temp as $$
 select exists(
   select 1
   from public.service_requests r
   join public.service_request_assignments a on a.service_request_id = r.id and a.status = 'accepted'
   join public.technicians t on t.id = a.technician_id and t.profile_id = auth.uid() and t.is_active
   where r.id::text = split_part(object_name,'/',1)
     and t.id::text = split_part(object_name,'/',2)
     and split_part(object_name,'/',3) in ('technician_arrival','technician_completion')
     and r.workflow_stage = 'in_progress'
 );
$$;
revoke all on function private.can_upload_technician_request_image(text) from public;
grant execute on function private.can_upload_technician_request_image(text) to authenticated;

drop policy if exists "technicians upload request images" on storage.objects;
create policy "technicians upload request images" on storage.objects for insert to authenticated
with check (bucket_id = 'request-images' and private.can_upload_technician_request_image(name));

create or replace function public.technician_attach_service_request_image(target_request_id uuid,target_stage text,target_storage_path text,target_content_type text)
returns void language plpgsql security definer set search_path = public,pg_temp as $$
declare technician_id uuid;
begin
 if target_stage not in ('technician_arrival','technician_completion') then raise exception 'invalid_attachment_stage'; end if;
 if target_content_type not in ('image/jpeg','image/png','image/webp') then raise exception 'invalid_image_type'; end if;
 select t.id into technician_id from public.technicians t where t.profile_id = auth.uid() and t.is_active;
 if technician_id is null then raise exception 'technician_not_found'; end if;
 if not exists(
   select 1 from public.service_requests r join public.service_request_assignments a on a.service_request_id = r.id
   where r.id = target_request_id and r.workflow_stage = 'in_progress' and a.technician_id = technician_id and a.status = 'accepted'
 ) then raise exception 'accepted_assignment_not_found'; end if;
 if split_part(target_storage_path,'/',1) <> target_request_id::text
    or split_part(target_storage_path,'/',2) <> technician_id::text
    or split_part(target_storage_path,'/',3) <> target_stage then raise exception 'invalid_image_path'; end if;
 if (select count(*) from public.service_request_attachments where service_request_id = target_request_id and attachment_stage = target_stage) >= 3 then raise exception 'attachment_limit_reached'; end if;
 if not exists(select 1 from storage.objects where bucket_id = 'request-images' and name = target_storage_path) then raise exception 'image_not_uploaded'; end if;
 insert into public.service_request_attachments(service_request_id,storage_path,content_type,attachment_stage,uploaded_by)
 values(target_request_id,target_storage_path,target_content_type,target_stage,auth.uid());
end; $$;
revoke all on function public.technician_attach_service_request_image(uuid,text,text,text) from public,anon;
grant execute on function public.technician_attach_service_request_image(uuid,text,text,text) to authenticated;

-- Completion is only valid after the assigned technician has documented the work.
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
 if not exists(select 1 from public.service_request_attachments where service_request_id = target_service_request_id and attachment_stage = 'technician_arrival') then raise exception 'arrival_photo_required'; end if;
 if new_outcome = 'completed' and not exists(select 1 from public.service_request_attachments where service_request_id = target_service_request_id and attachment_stage = 'technician_completion') then raise exception 'completion_photo_required'; end if;
 target_stage := case when new_outcome = 'completed' then 'awaiting_completion_review' else new_outcome end;
 update public.service_requests set workflow_stage = target_stage, visit_outcome = new_outcome,
   visit_notes = nullif(trim(outcome_notes),''), workflow_updated_at = now()
 where id = target_service_request_id;
end; $$;
revoke all on function public.technician_record_visit_outcome(uuid,text,text) from public,anon;
grant execute on function public.technician_record_visit_outcome(uuid,text,text) to authenticated;

create table public.service_catalog_parts (
  id uuid primary key default gen_random_uuid(),
  service_catalog_item_id uuid not null references public.service_catalog_items(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 120),
  default_price numeric(12,2) not null default 0 check (default_price >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index service_catalog_parts_name_per_service_idx on public.service_catalog_parts(service_catalog_item_id, lower(name));
create index service_catalog_parts_service_active_idx on public.service_catalog_parts(service_catalog_item_id, is_active, sort_order);
alter table public.service_catalog_parts enable row level security;
grant select,insert,update,delete on public.service_catalog_parts to authenticated;
create policy "staff read catalog parts" on public.service_catalog_parts for select to authenticated
using (public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]));
create policy "admins manage catalog parts" on public.service_catalog_parts for all to authenticated
using (public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]))
with check (public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]));
