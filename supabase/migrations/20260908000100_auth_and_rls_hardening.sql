-- Harden request ownership for authenticated users while preserving public submissions.
-- Anonymous visitors may submit requests only with customer_id = NULL.
-- Authenticated users may submit requests only for their own auth.uid().

drop policy if exists "public can submit service requests" on public.service_requests;
drop policy if exists "Public can submit service requests" on public.service_requests;

create policy "public can submit service requests"
on public.service_requests
for insert
to anon, authenticated
with check (
  (auth.uid() is null and customer_id is null)
  or customer_id = auth.uid()
);

-- Customers can read their own profile. Role changes remain server-controlled.
drop policy if exists "customers read own profile" on public.profiles;

create policy "customers read own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

-- Keep the profile trigger aligned with email/password registration metadata.
-- The role is explicitly fixed to customer for self-registration.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'phone', ''),
      nullif(new.phone, '')
    ),
    'customer'::public.app_role
  );
  return new;
end;
$function$;
