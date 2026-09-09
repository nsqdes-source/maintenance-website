alter table public.service_requests
  add column if not exists customer_email text;
