-- Allow structured quote lines to include catalog services in addition
-- to parts, labor, and other items.

create or replace function public.admin_submit_service_request_quote(
  target_service_request_id uuid,
  quote_description text,
  quote_line_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  stage text;
  quote_id uuid;
  item jsonb;

  non_labor_total numeric(12,2) := 0;
  labor_total numeric(12,2) := 0;
  non_labor_summary text;
begin
  if not public.current_user_has_role(
    array[
      'maintenance_manager',
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  if nullif(trim(quote_description), '') is null
    or quote_line_items is null
    or jsonb_typeof(quote_line_items) <> 'array'
    or jsonb_array_length(quote_line_items) = 0
    or jsonb_array_length(quote_line_items) > 100
  then
    raise exception 'invalid_quote';
  end if;

  -- Validate every quote line.
  for item in
    select value
    from jsonb_array_elements(quote_line_items)
  loop
    if coalesce(item->>'item_type', '') not in (
      'service',
      'part',
      'labor',
      'other'
    )
      or char_length(
        trim(
          coalesce(
            item->>'description',
            ''
          )
        )
      ) not between 1 and 300
      or coalesce(
        (item->>'quantity')::numeric,
        0
      ) <= 0
      or coalesce(
        (item->>'quantity')::numeric,
        0
      ) > 100000
      or coalesce(
        (item->>'unit_price')::numeric,
        -1
      ) < 0
    then
      raise exception 'invalid_quote_line';
    end if;
  end loop;

  select workflow_stage
  into stage
  from public.service_requests
  where id = target_service_request_id
  for update;

  if not found then
    raise exception 'service_request_not_found';
  end if;

  if stage <> 'awaiting_admin_quote' then
    raise exception 'invalid_workflow_transition';
  end if;

  -- Everything except labor is retained in the legacy parts_cost field
  -- for backwards compatibility. Structured line_items remain canonical.
  select
    coalesce(
      sum(
        ((value->>'quantity')::numeric) *
        ((value->>'unit_price')::numeric)
      ) filter (
        where value->>'item_type' in (
          'service',
          'part',
          'other'
        )
      ),
      0
    ),

    coalesce(
      sum(
        ((value->>'quantity')::numeric) *
        ((value->>'unit_price')::numeric)
      ) filter (
        where value->>'item_type' = 'labor'
      ),
      0
    ),

    string_agg(
      case
        when value->>'item_type' in (
          'service',
          'part',
          'other'
        )
        then
          trim(value->>'description')
          || ' × '
          || (value->>'quantity')
      end,
      '، '
    ) filter (
      where value->>'item_type' in (
        'service',
        'part',
        'other'
      )
    )

  into
    non_labor_total,
    labor_total,
    non_labor_summary

  from jsonb_array_elements(
    quote_line_items
  );

  insert into public.service_request_quotes (
    service_request_id,
    description,
    parts_description,
    parts_cost,
    labor_cost,
    line_items,
    created_by
  )
  values (
    target_service_request_id,
    trim(quote_description),
    non_labor_summary,
    round(non_labor_total, 2),
    round(labor_total, 2),
    quote_line_items,
    auth.uid()
  )
  returning id
  into quote_id;

  update public.service_requests
  set
    workflow_stage =
      'awaiting_customer_approval',
    workflow_updated_at = now()
  where id =
    target_service_request_id;

  return quote_id;
end;
$$;

revoke all on function
  public.admin_submit_service_request_quote(
    uuid,
    text,
    jsonb
  )
from public, anon;

grant execute on function
  public.admin_submit_service_request_quote(
    uuid,
    text,
    jsonb
  )
to authenticated;