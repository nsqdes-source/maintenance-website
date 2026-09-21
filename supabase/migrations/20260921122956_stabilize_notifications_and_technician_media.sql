-- Batch 1: remove duplicate stage notifications and make technician media linking reliable.
-- Keep exactly one notification when the same request stage was emitted more than once.
-- The id tie-breaker also handles duplicates that share the same creation timestamp.
with ranked_notifications as (
  select
    id,
    row_number() over (
      partition by recipient_id, service_request_id, body
      order by created_at desc, id desc
    ) as duplicate_rank
  from public.notifications
  where body is not null
)
delete from public.notifications n
using ranked_notifications ranked
where n.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists notifications_unique_request_stage_idx
  on public.notifications(recipient_id, service_request_id, body)
  where body is not null;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare updated_count integer;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  update public.notifications
     set read_at = coalesce(read_at, now())
   where recipient_id = auth.uid()
     and read_at is null;
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function public.technician_attach_service_request_image(
  target_request_id uuid,
  target_stage text,
  target_storage_path text,
  target_content_type text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_technician_id uuid;
begin
  if target_stage not in ('technician_arrival','technician_completion') then raise exception 'invalid_attachment_stage'; end if;
  if target_content_type not in ('image/jpeg','image/png','image/webp') then raise exception 'invalid_image_type'; end if;

  select t.id into v_technician_id
    from public.technicians t
   where t.profile_id = auth.uid() and t.is_active;
  if v_technician_id is null then raise exception 'technician_not_found'; end if;

  if not exists(
    select 1
      from public.service_requests r
      join public.service_request_assignments a on a.service_request_id = r.id
     where r.id = target_request_id
       and r.workflow_stage = 'in_progress'
       and a.technician_id = v_technician_id
       and a.status = 'accepted'
  ) then raise exception 'accepted_assignment_not_found'; end if;

  if split_part(target_storage_path,'/',1) <> target_request_id::text
     or split_part(target_storage_path,'/',2) <> v_technician_id::text
     or split_part(target_storage_path,'/',3) <> target_stage then
    raise exception 'invalid_image_path';
  end if;

  if (select count(*) from public.service_request_attachments
       where service_request_id = target_request_id and attachment_stage = target_stage) >= 3 then
    raise exception 'attachment_limit_reached';
  end if;
  if not exists(select 1 from storage.objects where bucket_id = 'request-images' and name = target_storage_path) then
    raise exception 'image_not_uploaded';
  end if;

  insert into public.service_request_attachments(service_request_id, storage_path, content_type, attachment_stage, uploaded_by)
  values(target_request_id, target_storage_path, target_content_type, target_stage, auth.uid());
end;
$$;
revoke all on function public.technician_attach_service_request_image(uuid,text,text,text) from public, anon;
grant execute on function public.technician_attach_service_request_image(uuid,text,text,text) to authenticated;

-- Batch 2: independent placement controls for the public request CTAs.
alter table public.site_settings drop constraint if exists site_settings_key_check;
alter table public.site_settings add constraint site_settings_key_check check (key in (
  'logo_text','logo_text_en','logo_image_url','primary_color','accent_color','background_color',
  'header_cta_text','header_cta_text_en','request_cta_text','request_cta_text_en',
  'header_request_cta_visible','footer_request_cta_visible','mobile_request_cta_visible'
));
insert into public.site_settings(key,value) values
  ('footer_request_cta_visible','true'),
  ('mobile_request_cta_visible','true')
on conflict (key) do nothing;
