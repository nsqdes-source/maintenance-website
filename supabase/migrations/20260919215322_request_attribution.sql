alter table public.service_requests
  add column if not exists landing_page text,
  add column if not exists referrer text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists gclid text,
  add column if not exists wbraid text,
  add column if not exists gbraid text,
  add column if not exists first_touch_at timestamptz;

create or replace function public.submit_service_request_v3(
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
  input_preferred_time_period text,
  input_landing_page text default null,
  input_referrer text default null,
  input_utm_source text default null,
  input_utm_medium text default null,
  input_utm_campaign text default null,
  input_utm_content text default null,
  input_utm_term text default null,
  input_gclid text default null,
  input_wbraid text default null,
  input_gbraid text default null,
  input_first_touch_at timestamptz default null
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
    customer_name, phone, customer_email, service_type, issue_type,
    problem_description, city, address, latitude, longitude,
    preferred_date, preferred_time_period, customer_id,
    landing_page, referrer, utm_source, utm_medium, utm_campaign,
    utm_content, utm_term, gclid, wbraid, gbraid, first_touch_at
  )
  values(
    trim(input_name), trim(input_phone), nullif(lower(trim(input_email)), ''),
    trim(input_service), trim(input_issue_type), trim(input_problem),
    trim(input_city), trim(input_address), input_latitude, input_longitude,
    input_preferred_date, input_preferred_time_period, auth.uid(),
    nullif(left(trim(coalesce(input_landing_page, '')), 2048), ''),
    nullif(left(trim(coalesce(input_referrer, '')), 2048), ''),
    nullif(left(trim(coalesce(input_utm_source, '')), 255), ''),
    nullif(left(trim(coalesce(input_utm_medium, '')), 255), ''),
    nullif(left(trim(coalesce(input_utm_campaign, '')), 255), ''),
    nullif(left(trim(coalesce(input_utm_content, '')), 255), ''),
    nullif(left(trim(coalesce(input_utm_term, '')), 255), ''),
    nullif(left(trim(coalesce(input_gclid, '')), 512), ''),
    nullif(left(trim(coalesce(input_wbraid, '')), 512), ''),
    nullif(left(trim(coalesce(input_gbraid, '')), 512), ''),
    input_first_touch_at
  )
  returning id, upload_token;
end;
$$;

revoke all on function public.submit_service_request_v3(
  text, text, text, text, text, text, text, text, double precision,
  double precision, date, text, text, text, text, text, text, text,
  text, text, text, text, timestamptz
) from public;

grant execute on function public.submit_service_request_v3(
  text, text, text, text, text, text, text, text, double precision,
  double precision, date, text, text, text, text, text, text, text,
  text, text, text, text, timestamptz
) to anon, authenticated;
