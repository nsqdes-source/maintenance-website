create table public.technicians (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  service_types text[] not null default '{}',
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_request_assignments (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  technician_id uuid not null references public.technicians(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending',
  assigned_at timestamptz not null default now(),
  responded_at timestamptz,
  notes text,
  constraint assignment_status_chk check (status in ('pending','accepted','rejected','cancelled')),
  constraint assignment_response_consistency_chk check (
    (status = 'pending' and responded_at is null)
    or (status <> 'pending' and responded_at is not null)
  )
);

create unique index service_request_one_active_assignment_idx
  on public.service_request_assignments(service_request_id)
  where status in ('pending','accepted');

create index technicians_active_idx on public.technicians(is_active);
create index technicians_service_types_gin_idx on public.technicians using gin(service_types);
create index assignments_request_idx on public.service_request_assignments(service_request_id, assigned_at desc);
create index assignments_technician_idx on public.service_request_assignments(technician_id, status, assigned_at desc);

create or replace function public.set_technicians_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger technicians_set_updated_at
before update on public.technicians
for each row execute function public.set_technicians_updated_at();

alter table public.technicians enable row level security;
alter table public.service_request_assignments enable row level security;

revoke all on table public.technicians, public.service_request_assignments from anon;
grant select on table public.technicians to authenticated;
grant select, insert, update on table public.service_request_assignments to authenticated;

create policy "management can manage technicians"
on public.technicians
for all
to authenticated
using (public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]))
with check (public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]));

create policy "technicians can view their own technician record"
on public.technicians
for select
to authenticated
using (profile_id = (select auth.uid()));

create policy "management can view assignments"
on public.service_request_assignments
for select
to authenticated
using (public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]));

create policy "assigned technician can view own assignments"
on public.service_request_assignments
for select
to authenticated
using (
  exists (
    select 1
    from public.technicians t
    where t.id = technician_id
      and t.profile_id = (select auth.uid())
  )
);

create policy "management can create assignments"
on public.service_request_assignments
for insert
to authenticated
with check (
  public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[])
  and (assigned_by is null or assigned_by = (select auth.uid()))
);

create policy "management can update assignments"
on public.service_request_assignments
for update
to authenticated
using (public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]))
with check (public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]));

create policy "assigned technician can respond to assignment"
on public.service_request_assignments
for update
to authenticated
using (
  exists (
    select 1
    from public.technicians t
    where t.id = technician_id
      and t.profile_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.technicians t
    where t.id = technician_id
      and t.profile_id = (select auth.uid())
  )
);;
