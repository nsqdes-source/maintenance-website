-- Secure technician change-request submission.
-- The browser sends catalog IDs and quantities only.
-- Catalog prices are copied server-side as immutable snapshots.

create or replace function public.technician_submit_change_request(
  target_service_request_id uuid,
  change_notes text default null,
  selected_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  tech_id uuid;
  current_stage text;
  new_change_request_id uuid;

  item jsonb;
  item_type_value text;
  catalog_id uuid;
  item_quantity numeric(10,2);
  other_name text;

  catalog_service public.service_catalog_services%rowtype;
  catalog_part public.service_catalog_parts%rowtype;
begin
  -- Selected items must be a non-empty JSON array.
  if selected_items is null
    or jsonb_typeof(selected_items) <> 'array'
    or jsonb_array_length(selected_items) = 0
    or jsonb_array_length(selected_items) > 30
  then
    raise exception 'invalid_change_items';
  end if;

if exists (
  select 1
  from (
    select
      value->>'item_type' as item_type,
      value->>'catalog_id' as catalog_id,
      count(*) as item_count
    from jsonb_array_elements(selected_items)
    where value->>'item_type' in ('service', 'part')
    group by
      value->>'item_type',
      value->>'catalog_id'
    having count(*) > 1
  ) duplicates
) then
  raise exception 'duplicate_change_item';
end if;

  -- Resolve the authenticated active technician.
  select id
  into tech_id
  from public.technicians
  where profile_id = auth.uid()
    and is_active = true
  limit 1;

  if tech_id is null then
    raise exception 'technician_not_found';
  end if;

  -- Lock the service request while validating the workflow.
  select workflow_stage
  into current_stage
  from public.service_requests
  where id = target_service_request_id
  for update;

  if not found then
    raise exception 'service_request_not_found';
  end if;

  if current_stage <> 'in_progress' then
    raise exception 'invalid_workflow_transition';
  end if;

  -- Technician must currently own an accepted assignment.
  if not exists (
    select 1
    from public.service_request_assignments
    where service_request_id = target_service_request_id
      and technician_id = tech_id
      and status = 'accepted'
  ) then
    raise exception 'accepted_assignment_not_found';
  end if;

  -- Prevent multiple simultaneously submitted change requests.
  if exists (
    select 1
    from public.service_request_change_requests
    where service_request_id = target_service_request_id
      and status = 'submitted'
  ) then
    raise exception 'change_request_already_submitted';
  end if;

  -- Validate every item before creating the change request.
  for item in
    select value
    from jsonb_array_elements(selected_items)
  loop
    item_type_value := item->>'item_type';

    begin
      item_quantity :=
        coalesce((item->>'quantity')::numeric, 1);
    exception
      when others then
        raise exception 'invalid_change_item_quantity';
    end;

    if item_quantity <= 0
      or item_quantity > 100
    then
      raise exception 'invalid_change_item_quantity';
    end if;

    if item_type_value = 'service' then
      begin
        catalog_id := (item->>'catalog_id')::uuid;
      exception
        when others then
          raise exception 'invalid_catalog_service';
      end;

      perform 1
      from public.service_catalog_services
      where id = catalog_id
        and is_active = true;

      if not found then
        raise exception 'invalid_catalog_service';
      end if;

    elsif item_type_value = 'part' then
      begin
        catalog_id := (item->>'catalog_id')::uuid;
      exception
        when others then
          raise exception 'invalid_catalog_part';
      end;

      perform 1
      from public.service_catalog_parts
      where id = catalog_id
        and is_active = true;

      if not found then
        raise exception 'invalid_catalog_part';
      end if;

    elsif item_type_value = 'other' then
      other_name :=
        nullif(trim(coalesce(item->>'name', '')), '');

      if other_name is null
        or char_length(other_name) > 160
      then
        raise exception 'invalid_other_item';
      end if;

    else
      raise exception 'invalid_change_item_type';
    end if;
  end loop;

  -- Create the parent change request.
  insert into public.service_request_change_requests (
    service_request_id,
    technician_id,
    status,
    notes
  )
  values (
    target_service_request_id,
    tech_id,
    'submitted',
    nullif(trim(coalesce(change_notes, '')), '')
  )
  returning id
  into new_change_request_id;

  -- Create immutable server-side price snapshots.
  for item in
    select value
    from jsonb_array_elements(selected_items)
  loop
    item_type_value := item->>'item_type';
    item_quantity :=
      coalesce((item->>'quantity')::numeric, 1);

    if item_type_value = 'service' then
      catalog_id := (item->>'catalog_id')::uuid;

      select *
      into strict catalog_service
      from public.service_catalog_services
      where id = catalog_id
        and is_active = true;

      insert into public.service_request_change_items (
        change_request_id,
        item_type,
        catalog_service_id,
        catalog_part_id,
        item_name,
        quantity,
        net_unit_price,
        tax_rate,
        gross_unit_price
      )
      values (
        new_change_request_id,
        'service',
        catalog_service.id,
        null,
        catalog_service.name,
        item_quantity,
        catalog_service.net_price,
        catalog_service.tax_rate,
        catalog_service.gross_price
      );

    elsif item_type_value = 'part' then
      catalog_id := (item->>'catalog_id')::uuid;

      select *
      into strict catalog_part
      from public.service_catalog_parts
      where id = catalog_id
        and is_active = true;

      insert into public.service_request_change_items (
        change_request_id,
        item_type,
        catalog_service_id,
        catalog_part_id,
        item_name,
        quantity,
        net_unit_price,
        tax_rate,
        gross_unit_price
      )
      values (
        new_change_request_id,
        'part',
        null,
        catalog_part.id,
        catalog_part.name,
        item_quantity,
        catalog_part.default_price,
        catalog_part.tax_rate,
        catalog_part.gross_price
      );

    else
      other_name :=
        trim(item->>'name');

      -- Unknown/custom items are intentionally unpriced.
      -- Administration will price them during quote review.
      insert into public.service_request_change_items (
        change_request_id,
        item_type,
        catalog_service_id,
        catalog_part_id,
        item_name,
        quantity,
        net_unit_price,
        tax_rate,
        gross_unit_price
      )
      values (
        new_change_request_id,
        'other',
        null,
        null,
        other_name,
        item_quantity,
        0,
        0,
        0
      );
    end if;
  end loop;

  -- Send the request to administration for quote review.
  update public.service_requests
  set
    workflow_stage = 'awaiting_admin_quote',
    visit_outcome = 'needs_followup',
    visit_notes = nullif(trim(coalesce(change_notes, '')), ''),
    workflow_updated_at = now()
  where id = target_service_request_id;

  return new_change_request_id;
end;
$$;

revoke all on function public.technician_submit_change_request(
  uuid,
  text,
  jsonb
) from public, anon;

grant execute on function public.technician_submit_change_request(
  uuid,
  text,
  jsonb
) to authenticated;