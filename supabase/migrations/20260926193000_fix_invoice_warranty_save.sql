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
    array[
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
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

  if char_length(trim(coalesce(p_work_summary, ''))) < 3
     or char_length(trim(p_work_summary)) > 4000 then
    raise exception 'invalid_work_summary';
  end if;

  for item in
    select value
    from jsonb_array_elements(p_lines)
  loop
    if char_length(
         trim(coalesce(item->>'description', ''))
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
       ) < 0
       or coalesce(
         (item->>'warranty_days')::integer,
         0
       ) < 0
       or coalesce(
         (item->>'warranty_days')::integer,
         0
       ) > 3650
       or char_length(
         coalesce(item->>'warranty_terms', '')
       ) > 1000 then
      raise exception 'invalid_invoice_line';
    end if;
  end loop;

  delete from public.invoice_line_items
  where invoice_id = p_invoice_id;

  insert into public.invoice_line_items (
    invoice_id,
    description,
    quantity,
    unit_price,
    warranty_days,
    warranty_terms,
    sort_order
  )
  select
    p_invoice_id,
    trim(value->>'description'),
    (value->>'quantity')::numeric,
    (value->>'unit_price')::numeric,
    coalesce(
      (value->>'warranty_days')::integer,
      0
    ),
    case
      when coalesce(
        (value->>'warranty_days')::integer,
        0
      ) > 0
      then nullif(
        trim(coalesce(value->>'warranty_terms', '')),
        ''
      )
      else null
    end,
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
on function public.finance_update_invoice_draft(uuid, text, jsonb)
from public, anon;

grant execute
on function public.finance_update_invoice_draft(uuid, text, jsonb)
to authenticated;