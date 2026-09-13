alter table public.profiles add column avatar_path text;
create or replace function public.normalized_sa_mobile(raw_phone text) returns text
language sql immutable set search_path = public as $$
 select case
  when regexp_replace(coalesce(raw_phone,''),'[^0-9]','','g') ~ '^05[0-9]{8}$'
   then '966' || substr(regexp_replace(raw_phone,'[^0-9]','','g'),2)
  when regexp_replace(coalesce(raw_phone,''),'[^0-9]','','g') ~ '^9665[0-9]{8}$'
   then regexp_replace(raw_phone,'[^0-9]','','g')
  when regexp_replace(coalesce(raw_phone,''),'[^0-9]','','g') ~ '^5[0-9]{8}$'
   then '966' || regexp_replace(raw_phone,'[^0-9]','','g')
  else null end
$$;
create unique index profiles_unique_normalized_mobile_idx on public.profiles(public.normalized_sa_mobile(phone))
where public.normalized_sa_mobile(phone) is not null;
create or replace function public.claim_verified_guest_service_requests()
returns integer language plpgsql security definer set search_path = public as $$
declare verified_email text; claimed integer;
begin
 select lower(trim(email)) into verified_email from auth.users
 where id = auth.uid() and email_confirmed_at is not null and email is not null;
 if verified_email is null then raise exception 'verified_email_required'; end if;
 update public.service_requests set customer_id = auth.uid()
 where customer_id is null and customer_email is not null and lower(trim(customer_email)) = verified_email;
 get diagnostics claimed = row_count;
 return claimed;
end; $$;
revoke all on function public.claim_verified_guest_service_requests() from public,anon;
grant execute on function public.claim_verified_guest_service_requests() to authenticated;
create or replace function public.check_profile_mobile()
returns trigger language plpgsql set search_path = public as $$
begin
 if new.phone is not null and public.normalized_sa_mobile(new.phone) is null then raise exception 'invalid_mobile'; end if;
 return new;
end; $$;
create trigger profiles_check_mobile before insert or update of phone on public.profiles
for each row execute function public.check_profile_mobile();
revoke all on function public.check_profile_mobile() from public,anon,authenticated;
-- Only editable profile fields are exposed to clients; role stays server-controlled.
grant update(full_name,phone,avatar_path) on public.profiles to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('avatars','avatars',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy "owners upload avatars" on storage.objects for insert to authenticated
with check(bucket_id = 'avatars' and split_part(name,'/',1) = (select auth.uid())::text);
create policy "owners read avatars" on storage.objects for select to authenticated
using(bucket_id = 'avatars' and split_part(name,'/',1) = (select auth.uid())::text);
create policy "owners replace avatars" on storage.objects for update to authenticated
using(bucket_id = 'avatars' and split_part(name,'/',1) = (select auth.uid())::text)
with check(bucket_id = 'avatars' and split_part(name,'/',1) = (select auth.uid())::text);
create or replace function public.admin_get_user_details(target_user_id uuid)
returns table(user_id uuid,full_name text,phone text,email text,role public.app_role,created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
 if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 return query select p.id,p.full_name,p.phone,u.email,p.role,p.created_at
 from public.profiles p join auth.users u on u.id = p.id where p.id = target_user_id;
end; $$;
revoke all on function public.admin_get_user_details(uuid) from public,anon;
grant execute on function public.admin_get_user_details(uuid) to authenticated;
