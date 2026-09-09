create type public.app_role as enum (
  'customer',
  'technician',
  'maintenance_manager',
  'admin_manager',
  'super_admin'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role public.app_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.current_user_has_role(required_roles public.app_role[])
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = any(required_roles)
  );
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.phone, '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.service_requests
  add column if not exists customer_id uuid references auth.users(id) on delete set null;

create index if not exists service_requests_customer_id_idx
  on public.service_requests(customer_id);

create index if not exists service_requests_status_created_at_idx
  on public.service_requests(status, created_at desc);

drop policy if exists "authenticated users can read service requests" on public.service_requests;
drop policy if exists "authenticated users can update service requests" on public.service_requests;

create policy "customers read own requests and staff read requests"
on public.service_requests
for select
to authenticated
using (
  customer_id = auth.uid()
  or public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[])
);

create policy "maintenance staff update service requests"
on public.service_requests
for update
to authenticated
using (
  public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[])
)
with check (
  public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[])
);

revoke all on public.profiles from anon, authenticated;

grant select on public.profiles to authenticated;
;
