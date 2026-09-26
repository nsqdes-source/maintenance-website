-- Correct VAT-inclusive invoice totals.
-- Customer-facing line prices remain VAT-inclusive.
-- subtotal = net amount before VAT
-- tax_amount = VAT portion extracted from gross
-- total = gross VAT-inclusive amount

create or replace function private.finance_seed_invoice_from_approved_quote(
  p_invoice_id uuid,
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  quote_record public.service_request_quotes%rowtype;
  invoice_record public.invoices%rowtype;
  gross_total numeric(12,2);
  net_total numeric(12,2);
  vat_amount numeric(12,2);
  effective_tax_rate numeric(5,2);
begin
  select *
  into invoice_record
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found';
  end if;

  -- Seed approved quote lines only when the draft has no lines yet.
  if not exists (
    select 1
    from public.invoice_line_items
    where invoice_id = p_invoice_id
  ) then
    select *
    into quote_record
    from public.service_request_quotes
    where service_request_id = p_request_id
      and status = 'approved'
    order by decided_at desc nulls last, created_at desc
    limit 1;

    if found then
      if jsonb_array_length(quote_record.line_items) > 0 then
        insert into public.invoice_line_items(
          invoice_id,
          description,
          quantity,
          unit_price,
          sort_order
        )
        select
          p_invoice_id,
          trim(value->>'description'),
          (value->>'quantity')::numeric,
          (value->>'unit_price')::numeric,
          ordinality - 1
        from jsonb_array_elements(quote_record.line_items)
        with ordinality;
      else
        insert into public.invoice_line_items(
          invoice_id,
          description,
          quantity,
          unit_price,
          sort_order
        )
        select
          p_invoice_id,
          description,
          1,
          amount,
          sort_order
        from (
          values
            (
              coalesce(
                nullif(quote_record.parts_description, ''),
                'قطع وتعديلات'
              ),
              quote_record.parts_cost,
              0
            ),
            (
              'أجرة العمل',
              quote_record.labor_cost,
              1
            )
        ) as legacy_lines(description, amount, sort_order)
        where amount > 0;
      end if;

      if not exists (
        select 1
        from public.invoice_line_items
        where invoice_id = p_invoice_id
      ) then
        insert into public.invoice_line_items(
          invoice_id,
          description,
          quantity,
          unit_price,
          sort_order
        )
        values (
          p_invoice_id,
          quote_record.description,
          1,
          0,
          0
        );
      end if;

      update public.invoices
      set
        work_summary = quote_record.description,
        description = quote_record.description
      where id = p_invoice_id
        and status = 'draft';
    end if;
  end if;

  select round(
    coalesce(sum(quantity * unit_price), 0),
    2
  )
  into gross_total
  from public.invoice_line_items
  where invoice_id = p_invoice_id;

  effective_tax_rate := invoice_record.tax_rate;

  -- Legacy drafts may have been created with tax_rate = 0.
  if invoice_record.vat_registered
     and coalesce(effective_tax_rate, 0) <= 0 then
    select tax_rate
    into effective_tax_rate
    from public.business_finance_settings
    where id = true;
  end if;

  effective_tax_rate :=
    coalesce(effective_tax_rate, 0);

  if invoice_record.vat_registered
     and effective_tax_rate > 0 then

    net_total := round(
      gross_total / (1 + effective_tax_rate / 100),
      2
    );

    vat_amount := round(
      gross_total - net_total,
      2
    );
  else
    effective_tax_rate := 0;
    net_total := gross_total;
    vat_amount := 0;
  end if;

  update public.invoices
  set
    subtotal = net_total,
    tax_rate = effective_tax_rate,
    tax_amount = vat_amount,
    total = gross_total,
    updated_at = now()
  where id = p_invoice_id
    and status = 'draft';
end;
$$;


create or replace function public.finance_ensure_invoice_draft(
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_record public.service_requests%rowtype;
  settings_record public.business_finance_settings%rowtype;
  result_id uuid;
  result_status text;
  initial_tax_rate numeric(5,2);
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

  select *
  into request_record
  from public.service_requests
  where id = p_request_id
  for update;

  if not found
     or request_record.workflow_stage <> 'completed' then
    raise exception 'request_not_completed';
  end if;

  select id, status
  into result_id, result_status
  from public.invoices
  where service_request_id = p_request_id
    and status in ('draft', 'issued')
  order by created_at desc
  limit 1;

  if result_id is not null then
    if result_status = 'draft' then
      perform private.finance_seed_invoice_from_approved_quote(
        result_id,
        p_request_id
      );
    end if;

    return result_id;
  end if;

  select *
  into settings_record
  from public.business_finance_settings
  where id = true;

  initial_tax_rate :=
    case
      when coalesce(settings_record.vat_registered, false)
        then coalesce(settings_record.tax_rate, 0)
      else 0
    end;

  insert into public.invoices (
    service_request_id,
    customer_id,
    customer_name,
    customer_email,
    customer_phone,
    service_type,
    work_summary,
    business_name,
    business_address,
    business_email,
    business_tax_number,
    vat_registered,
    description,
    subtotal,
    tax_rate,
    tax_amount,
    total,
    created_by
  )
  values (
    request_record.id,
    request_record.customer_id,
    request_record.customer_name,
    coalesce(request_record.customer_email, ''),
    coalesce(request_record.phone, ''),
    coalesce(request_record.service_type, ''),
    coalesce(
      request_record.visit_notes,
      request_record.problem_description,
      ''
    ),
    settings_record.legal_name,
    settings_record.address,
    settings_record.contact_email,
    settings_record.tax_number,
    coalesce(settings_record.vat_registered, false),
    coalesce(
      nullif(trim(request_record.visit_notes), ''),
      nullif(trim(request_record.problem_description), ''),
      'خدمة صيانة'
    ),
    0,
    initial_tax_rate,
    0,
    0,
    auth.uid()
  )
  returning id into result_id;

  perform private.finance_seed_invoice_from_approved_quote(
    result_id,
    p_request_id
  );

  return result_id;
end;
$$;

revoke all
on function public.finance_ensure_invoice_draft(uuid)
from public, anon;

grant execute
on function public.finance_ensure_invoice_draft(uuid)
to authenticated;


create or replace function public.finance_update_invoice_draft(
  p_invoice_id uuid,
  p_work_summary text,
  p_lines jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  bill public.invoices%rowtype;
  item jsonb;
  gross_total numeric(12,2);
  net_total numeric(12,2);
  vat_amount numeric(12,2);
  effective_tax_rate numeric(5,2);
begin
  if not public.current_user_has_role(
    array['admin_manager','super_admin']::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  if jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0
     or jsonb_array_length(p_lines) > 100 then
    raise exception 'invoice_lines_required';
  end if;

  select *
  into bill
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found';
  end if;

  if bill.status <> 'draft' then
    raise exception 'invoice_not_draft';
  end if;

  if char_length(trim(coalesce(p_work_summary,''))) < 3
     or char_length(trim(p_work_summary)) > 4000 then
    raise exception 'invalid_work_summary';
  end if;

  for item in
    select value
    from jsonb_array_elements(p_lines)
  loop
    if char_length(
         trim(coalesce(item->>'description',''))
       ) < 1
       or char_length(
         trim(item->>'description')
       ) > 300
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
       ) < 0 then
      raise exception 'invalid_invoice_line';
    end if;
  end loop;

  delete from public.invoice_line_items
  where invoice_id = p_invoice_id;

  insert into public.invoice_line_items(
    invoice_id,
    description,
    quantity,
    unit_price,
    sort_order
  )
  select
    p_invoice_id,
    trim(value->>'description'),
    (value->>'quantity')::numeric,
    (value->>'unit_price')::numeric,
    ordinality - 1
  from jsonb_array_elements(p_lines)
  with ordinality;

  select round(
    coalesce(sum(quantity * unit_price), 0),
    2
  )
  into gross_total
  from public.invoice_line_items
  where invoice_id = p_invoice_id;

  effective_tax_rate := bill.tax_rate;

  if bill.vat_registered
     and coalesce(effective_tax_rate, 0) <= 0 then
    select tax_rate
    into effective_tax_rate
    from public.business_finance_settings
    where id = true;
  end if;

  effective_tax_rate :=
    coalesce(effective_tax_rate, 0);

  if bill.vat_registered
     and effective_tax_rate > 0 then

    net_total := round(
      gross_total / (1 + effective_tax_rate / 100),
      2
    );

    vat_amount := round(
      gross_total - net_total,
      2
    );
  else
    effective_tax_rate := 0;
    net_total := gross_total;
    vat_amount := 0;
  end if;

  update public.invoices
  set
    work_summary = trim(p_work_summary),
    description = trim(p_work_summary),
    subtotal = net_total,
    tax_rate = effective_tax_rate,
    tax_amount = vat_amount,
    total = gross_total,
    updated_at = now()
  where id = p_invoice_id;
end;
$$;

revoke all
on function public.finance_update_invoice_draft(uuid,text,jsonb)
from public, anon;

grant execute
on function public.finance_update_invoice_draft(uuid,text,jsonb)
to authenticated;