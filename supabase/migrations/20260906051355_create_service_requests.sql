create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text not null,
  service_type text not null,
  problem_description text not null,
  city text not null,
  address text not null,
  photo_path text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  constraint service_requests_status_check check (status in ('new','contacted','scheduled','completed','cancelled'))
);

alter table public.service_requests enable row level security;

grant insert on public.service_requests to anon;

grant select, insert, update on public.service_requests to authenticated;

create policy "public can submit service requests"
on public.service_requests
for insert
to anon, authenticated
with check (true);

create policy "authenticated users can read service requests"
on public.service_requests
for select
to authenticated
using (true);

create policy "authenticated users can update service requests"
on public.service_requests
for update
to authenticated
using (true)
with check (true);;
