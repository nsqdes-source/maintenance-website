-- Submit a service request with customer-selected priced catalog services.
-- Catalog prices are copied into service_request_items as immutable snapshots.

create or replace function public.submit_service_request_v4(
  input_name text,
  input_phone text,
  input_email text,

  input_catalog_item_id uuid,
  input_catalog_services jsonb,

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
returns table(
  request_id uuid,
  request_upload_token uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_category public.service_catalog_items%rowtype;
  selected_service public.service_catalog_services%rowtype;

  request_record public.service_requests%rowtype;

  service_entry jsonb;
  service_id uuid;
  service_quantity numeric(10,2);

  requested_count integer;
  distinct_count integer;
begin
  -- Validate ordinary request fields.
  if nullif(trim(input_name), '') is null
    or public.normalized_sa_mobile(input_phone) is null
    or nullif(trim(input_issue_type), '') is null
    or nullif(trim(input_problem), '') is null
    or trim(input_city) <> 'مكة المكرمة'
    or nullif(trim(input_address), '') is null
    or input_latitude not between -90 and 90
    or input_longitude not between -180 and 180
    or input_preferred_date is null
    or input_preferred_date < current_date
    or input_preferred_time_period not in (
      'morning',
      'afternoon',
      'evening'
    )
  then
    raise exception 'invalid_request';
  end if;

  -- Customer must select at least one priced catalog service.
  if input_catalog_services is null
    or jsonb_typeof(input_catalog_services) <> 'array'
    or jsonb_array_length(input_catalog_services) = 0
    or jsonb_array_length(input_catalog_services) > 20
  then
    raise exception 'invalid_catalog_services';
  end if;

  -- Main category must exist and be visible.
  select *
  into selected_category
  from public.service_catalog_items
  where id = input_catalog_item_id
    and parent_id is null
    and is_visible = true;

  if not found then
    raise exception 'invalid_catalog_category';
  end if;

  -- Reject duplicate service IDs.
  select
    count(*),
    count(distinct value->>'id')
  into
    requested_count,
    distinct_count
  from jsonb_array_elements(input_catalog_services);

  if requested_count <> distinct_count then
    raise exception 'duplicate_catalog_service';
  end if;

  -- Validate every selected catalog service before creating the request.
  for service_entry in
    select value
    from jsonb_array_elements(input_catalog_services)
  loop
    begin
      service_id := (service_entry->>'id')::uuid;
      service_quantity :=
        coalesce((service_entry->>'quantity')::numeric, 1);
    exception
      when others then
        raise exception 'invalid_catalog_service';
    end;

    if service_quantity <= 0
      or service_quantity > 100
    then
      raise exception 'invalid_catalog_quantity';
    end if;

    select *
    into selected_service
    from public.service_catalog_services
    where id = service_id
      and service_catalog_item_id = input_catalog_item_id
      and is_active = true;

    if not found then
      raise exception 'invalid_catalog_service';
    end if;
  end loop;

  -- Create the service request.
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
    customer_id,
    landing_page,
    referrer,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    gclid,
    wbraid,
    gbraid,
    first_touch_at
  )
  values(
    trim(input_name),
    trim(input_phone),
    nullif(lower(trim(input_email)), ''),

    -- Preserve the existing text field for compatibility.
    selected_category.name,

    trim(input_issue_type),
    trim(input_problem),
    trim(input_city),
    trim(input_address),
    input_latitude,
    input_longitude,
    input_preferred_date,
    input_preferred_time_period,
    auth.uid(),

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
  returning *
  into request_record;

  -- Snapshot every selected service and its current VAT-inclusive pricing.
  for service_entry in
    select value
    from jsonb_array_elements(input_catalog_services)
  loop
    service_id := (service_entry->>'id')::uuid;
    service_quantity :=
      coalesce((service_entry->>'quantity')::numeric, 1);

    select *
    into strict selected_service
    from public.service_catalog_services
    where id = service_id
      and service_catalog_item_id = input_catalog_item_id
      and is_active = true;

    insert into public.service_request_items(
      service_request_id,
      catalog_service_id,
      service_name,
      quantity,
      net_unit_price,
      tax_rate,
      gross_unit_price,
      item_source
    )
    values(
      request_record.id,
      selected_service.id,
      selected_service.name,
      service_quantity,
      selected_service.net_price,
      selected_service.tax_rate,
      selected_service.gross_price,
      'customer_request'
    );
  end loop;

  return query
  select
    request_record.id,
    request_record.upload_token;
end;
$$;

revoke all on function public.submit_service_request_v4(
  text,
  text,
  text,
  uuid,
  jsonb,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) from public;

grant execute on function public.submit_service_request_v4(
  text,
  text,
  text,
  uuid,
  jsonb,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) to anon, authenticated;