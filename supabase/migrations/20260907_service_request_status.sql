alter table public.service_requests
  add column if not exists status text not null default 'new';

alter table public.service_requests
  drop constraint if exists service_requests_status_check;

alter table public.service_requests
  add constraint service_requests_status_check
  check (status in ('new', 'contacted', 'scheduled', 'in_progress', 'completed', 'cancelled'));

create index if not exists service_requests_status_idx
  on public.service_requests(status);

create index if not exists service_requests_created_at_idx
  on public.service_requests(created_at desc);
