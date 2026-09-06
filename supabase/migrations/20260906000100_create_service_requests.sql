create extension if not exists pgcrypto;

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text not null,
  service_type text not null,
  problem_description text not null,
  city text,
  address text,
  photo_path text,
  status text not null default 'new' check (status in ('new', 'contacted', 'scheduled', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.service_requests enable row level security;

create policy "Public can submit service requests"
on public.service_requests
for insert
to anon, authenticated
with check (true);

create index service_requests_created_at_idx
  on public.service_requests (created_at desc);

create index service_requests_status_idx
  on public.service_requests (status);
