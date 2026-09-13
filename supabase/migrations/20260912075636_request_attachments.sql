alter table public.service_requests add column upload_token uuid not null default gen_random_uuid();
create table public.service_request_attachments (
 id uuid primary key default gen_random_uuid(),
 service_request_id uuid not null references public.service_requests(id) on delete cascade,
 storage_path text not null unique,
 content_type text not null check(content_type in ('image/jpeg','image/png','image/webp')),
 created_at timestamptz not null default now()
);
create index service_request_attachments_request_idx on public.service_request_attachments(service_request_id);
alter table public.service_request_attachments enable row level security;
grant select on public.service_request_attachments to authenticated;
create policy "participants read attachments" on public.service_request_attachments for select to authenticated
using(exists(select 1 from public.service_requests r where r.id = service_request_id and
 (r.customer_id = (select auth.uid()) or public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[])
 or exists(select 1 from public.service_request_assignments a join public.technicians t on t.id = a.technician_id where a.service_request_id = r.id and t.profile_id = (select auth.uid())))));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('request-images','request-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy "capability uploads request images" on storage.objects for insert to anon,authenticated
with check(bucket_id = 'request-images' and exists(
 select 1 from public.service_requests r
 where r.id::text = split_part(name,'/',1)
 and r.upload_token::text = split_part(name,'/',2)
 and r.created_at > now() - interval '1 hour'
 and (r.customer_id is null and auth.uid() is null or r.customer_id = auth.uid())
));
create policy "participants view request images" on storage.objects for select to authenticated
using(bucket_id = 'request-images' and exists(
 select 1 from public.service_request_attachments a
 join public.service_requests r on r.id = a.service_request_id
 where a.storage_path = name and
 (r.customer_id = (select auth.uid()) or public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[])
 or exists(select 1 from public.service_request_assignments s join public.technicians t on t.id = s.technician_id where s.service_request_id = r.id and t.profile_id = (select auth.uid())))
));
create or replace function public.submit_service_request_with_images(
 input_name text,input_phone text,input_email text,input_service text,input_problem text,
 input_city text,input_address text,input_latitude double precision,input_longitude double precision)
returns table(request_id uuid,request_upload_token uuid) language plpgsql security definer set search_path = public as $$
begin
 if nullif(trim(input_name),'') is null or public.normalized_sa_mobile(input_phone) is null
 or nullif(trim(input_email),'') is null or nullif(trim(input_service),'') is null
 or nullif(trim(input_problem),'') is null or nullif(trim(input_city),'') is null or nullif(trim(input_address),'') is null
 or input_latitude not between -90 and 90 or input_longitude not between -180 and 180 then raise exception 'invalid_request'; end if;
 return query
 insert into public.service_requests(customer_name,phone,customer_email,service_type,problem_description,city,address,latitude,longitude,customer_id)
 values(trim(input_name),trim(input_phone),lower(trim(input_email)),trim(input_service),trim(input_problem),trim(input_city),trim(input_address),input_latitude,input_longitude,auth.uid())
 returning id,upload_token;
end; $$;
revoke all on function public.submit_service_request_with_images(text,text,text,text,text,text,text,double precision,double precision) from public;
grant execute on function public.submit_service_request_with_images(text,text,text,text,text,text,text,double precision,double precision) to anon,authenticated;
create or replace function public.attach_service_request_image(target_request_id uuid,target_upload_token uuid,target_storage_path text,target_content_type text)
returns void language plpgsql security definer set search_path = public as $$
declare request_owner uuid;
begin
 select customer_id into request_owner from public.service_requests where id = target_request_id and upload_token = target_upload_token for update;
 if not found or not (request_owner is null and auth.uid() is null or request_owner = auth.uid()) then raise exception 'request_not_found'; end if;
 if target_content_type not in ('image/jpeg','image/png','image/webp') then raise exception 'invalid_image_type'; end if;
 if split_part(target_storage_path,'/',1) <> target_request_id::text or split_part(target_storage_path,'/',2) <> target_upload_token::text then raise exception 'invalid_image_path'; end if;
 if (select count(*) from public.service_request_attachments where service_request_id = target_request_id) >= 5 then raise exception 'attachment_limit_reached'; end if;
 if not exists(select 1 from storage.objects where bucket_id = 'request-images' and name = target_storage_path) then raise exception 'image_not_uploaded'; end if;
 insert into public.service_request_attachments(service_request_id,storage_path,content_type) values(target_request_id,target_storage_path,target_content_type);
end; $$;
revoke all on function public.attach_service_request_image(uuid,uuid,text,text) from public;
grant execute on function public.attach_service_request_image(uuid,uuid,text,text) to anon,authenticated;
-- Storage policies run under the caller's RLS. Guest requests are intentionally unreadable,
-- so capability verification must happen inside a narrowly scoped private function.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon,authenticated;
create or replace function private.can_upload_request_image(object_name text)
returns boolean language sql stable security definer set search_path = public,pg_temp as $$
 select exists(
  select 1 from public.service_requests r
  where r.id::text = split_part(object_name,'/',1)
   and r.upload_token::text = split_part(object_name,'/',2)
   and r.created_at > now() - interval '1 hour'
   and ((r.customer_id is null and auth.uid() is null) or r.customer_id = auth.uid())
 )
$$;
revoke all on function private.can_upload_request_image(text) from public;
grant execute on function private.can_upload_request_image(text) to anon,authenticated;
drop policy if exists "capability uploads request images" on storage.objects;
create policy "capability uploads request images" on storage.objects for insert to anon,authenticated
with check(bucket_id = 'request-images' and private.can_upload_request_image(name));
revoke all on table public.service_request_attachments from public,anon,authenticated;
grant select on table public.service_request_attachments to authenticated;
