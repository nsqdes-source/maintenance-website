-- Keep reassignment exclusive to a rejected assignment, and never replace a pending/accepted technician.
create or replace function public.admin_assign_service_request(
  target_service_request_id uuid, target_technician_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  stage text;
  last_status text;
  last_technician_id uuid;
begin
  if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then
    raise exception 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_service_request_id::text, 0));
  select workflow_stage into stage from public.service_requests where id = target_service_request_id for update;
  if not found then raise exception 'service_request_not_found'; end if;
  if stage <> 'awaiting_assignment' then raise exception 'invalid_workflow_transition'; end if;
  if not exists (select 1 from public.technicians where id = target_technician_id and is_active) then
    raise exception 'technician_not_found';
  end if;
  if exists (select 1 from public.service_request_assignments
    where service_request_id = target_service_request_id and status in ('pending','accepted')) then
    raise exception 'assignment_already_active';
  end if;
  select status, technician_id into last_status, last_technician_id
  from public.service_request_assignments
  where service_request_id = target_service_request_id
  order by assigned_at desc, id desc limit 1;
  if last_status is not null and last_status <> 'rejected' then
    raise exception 'reassignment_requires_rejection';
  end if;
  if last_status = 'rejected' and last_technician_id = target_technician_id then
    raise exception 'choose_different_technician';
  end if;
  insert into public.service_request_assignments(service_request_id, technician_id, assigned_by)
  values(target_service_request_id, target_technician_id, auth.uid());
end; $$;
revoke all on function public.admin_assign_service_request(uuid,uuid) from public,anon;
grant execute on function public.admin_assign_service_request(uuid,uuid) to authenticated;

-- Public marketing media, writable only by site administrators.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('site-assets','site-assets',true,5242880,array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
create policy "site admins upload public media" on storage.objects
for insert to authenticated
with check (bucket_id = 'site-assets' and public.current_user_has_role(
  array['maintenance_manager','admin_manager','super_admin']::public.app_role[]));

alter table public.site_settings drop constraint if exists site_settings_key_check;
alter table public.site_settings add constraint site_settings_key_check
check (key in ('logo_text','logo_text_en','logo_image_url','primary_color','accent_color','background_color','header_cta_text','header_cta_text_en'));
alter table public.site_settings drop constraint if exists site_settings_color_check;
alter table public.site_settings add constraint site_settings_color_check
check (key not in ('primary_color','accent_color','background_color') or value ~ '^#[0-9A-Fa-f]{6}$');
insert into public.site_settings(key,value) values ('background_color','#f8fafc') on conflict (key) do nothing;

-- Parallel English copy is edited alongside the existing Arabic copy.
alter table public.site_sections add column if not exists eyebrow_en text;
alter table public.site_sections add column if not exists title_en text;
alter table public.site_sections add column if not exists description_en text;
alter table public.site_section_items add column if not exists title_en text;
alter table public.site_section_items add column if not exists description_en text;

-- Translate only unchanged seed copy; edited Arabic copy remains for the administrator to translate.
update public.site_sections set eyebrow_en=v.eyebrow_en,title_en=v.title_en,description_en=v.description_en
from (values
 ('hero','صيانة منزلية ومنشآت','Home and facility maintenance','حلول صيانة موثوقة، عندما تحتاجها.','Reliable maintenance when you need it','Electrical, air-conditioning, plumbing and carpentry services, with an easy way to request and track maintenance.'),
 ('services','خدماتنا','Our services','كل ما تحتاجه للصيانة في مكان واحد','All your maintenance needs in one place','Essential services for homes and facilities.'),
 ('why-us','لماذا نحن؟','Why us','تجربة صيانة أبسط وأكثر وضوحًا','A simpler maintenance experience','From request to completion, we keep things clear and straightforward.'),
 ('works','أعمالنا','Our work','نماذج من الأعمال المنفذة','Examples of our work','Project photos can be added here as they become available.'),
 ('contact','تواصل معنا','Contact us','نحن هنا لخدمتك','We are here to help','Send a maintenance request and our team will follow up with you.')
) as v(slug,old_eyebrow,eyebrow_en,old_title,title_en,description_en)
where site_sections.slug=v.slug and site_sections.eyebrow=v.old_eyebrow and site_sections.title=v.old_title;
update public.site_section_items set title_en=v.title_en,description_en=v.description_en
from (values
 ('الكهرباء','Electrical','Electrical wiring, fault repair and installation.'),
 ('التكييف','Air conditioning','Maintenance, cleaning and repair of air conditioners.'),
 ('السباكة','Plumbing','Leak repairs and plumbing installation.'),
 ('النجارة','Carpentry','Door, furniture and general carpentry repairs.'),
 ('خدمات أخرى','Other services','Describe your needs and we will help you find the right service.'),
 ('استجابة سريعة','Fast response','We organize your request and contact you as soon as possible.'),
 ('فنيون متخصصون','Specialist technicians','We route each request to the right service and technician.'),
 ('جودة في التنفيذ','Quality work','We focus on organized work and lasting repairs.'),
 ('طلب سهل','Easy request','Describe the issue and location in one form.'),
 ('أعمال كهربائية','Electrical work','Electrical repairs and installations.'),
 ('صيانة تكييف','Air conditioning maintenance','Inspection, cleaning and maintenance.'),
 ('أعمال سباكة','Plumbing work','Leak and plumbing repairs.')
) as v(old_title,title_en,description_en)
where site_section_items.title=v.old_title and site_section_items.title_en is null;
