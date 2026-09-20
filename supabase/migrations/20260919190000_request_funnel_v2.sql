alter table public.service_requests
  add column if not exists issue_type text,
  add column if not exists preferred_date date,
  add column if not exists preferred_time_period text;

alter table public.service_requests
  drop constraint if exists service_requests_preferred_time_period_check;

alter table public.service_requests
  add constraint service_requests_preferred_time_period_check
  check (
    preferred_time_period is null
    or preferred_time_period in ('morning', 'afternoon', 'evening')
  );

create or replace function public.submit_service_request_v2(
  input_name text,
  input_phone text,
  input_email text,
  input_service text,
  input_issue_type text,
  input_problem text,
  input_city text,
  input_address text,
  input_latitude double precision,
  input_longitude double precision,
  input_preferred_date date,
  input_preferred_time_period text
)
returns table(request_id uuid, request_upload_token uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(trim(input_name), '') is null
    or public.normalized_sa_mobile(input_phone) is null
    or nullif(trim(input_service), '') is null
    or nullif(trim(input_issue_type), '') is null
    or nullif(trim(input_problem), '') is null
    or trim(input_city) <> 'مكة المكرمة'
    or nullif(trim(input_address), '') is null
    or input_latitude not between -90 and 90
    or input_longitude not between -180 and 180
    or input_preferred_date is null
    or input_preferred_date < current_date
    or input_preferred_time_period not in ('morning', 'afternoon', 'evening') then
    raise exception 'invalid_request';
  end if;

  return query
  insert into public.service_requests(
    customer_name,
    phone,
    customer_email,
    service_type,
    issue_type,
    problem_description,
    city,
    address,
    latitude,
    longitude,
    preferred_date,
    preferred_time_period,
    customer_id
  )
  values(
    trim(input_name),
    trim(input_phone),
    nullif(lower(trim(input_email)), ''),
    trim(input_service),
    trim(input_issue_type),
    trim(input_problem),
    trim(input_city),
    trim(input_address),
    input_latitude,
    input_longitude,
    input_preferred_date,
    input_preferred_time_period,
    auth.uid()
  )
  returning id, upload_token;
end;
$$;

revoke all on function public.submit_service_request_v2(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  date,
  text
) from public;

grant execute on function public.submit_service_request_v2(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  date,
  text
) to anon, authenticated;
