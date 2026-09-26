-- Build the final invoice from:
-- 1) the latest approved quote, when one exists;
-- 2) otherwise, the customer's original request items.
--
-- Customer-facing prices are VAT-inclusive. Invoice header totals
-- extract VAT from the gross total instead of adding VAT again.

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

  -- Seed lines only when the draft has no lines yet.
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

    ----------------------------------------------------------------
    -- Path A: approved quote exists.
    ----------------------------------------------------------------
    if quote_record.id is not null then

      if jsonb_array_length(
        coalesce(quote_record.line_items, '[]'::jsonb)
      ) > 0 then

        insert into public.invoice_line_items (
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

        insert into public.invoice_line_items (
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
        ) as legacy_lines(
          description,
          amount,
          sort_order
        )
        where amount > 0;

      end if;

      -- Preserve old quote behavior if the approved quote has
      -- no priced lines.
      if not exists (
        select 1
        from public.invoice_line_items
        where invoice_id = p_invoice_id
      ) then
        insert into public.invoice_line_items (
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

    ----------------------------------------------------------------
    -- Path B: no approved quote.
    -- Invoice from the customer's original selected services.
    ----------------------------------------------------------------
    else

      insert into public.invoice_line_items (
        invoice_id,
        description,
        quantity,
        unit_price,
        sort_order
      )
      select
        p_invoice_id,
        sri.service_name,
        sri.quantity,
        sri.gross_unit_price,
        row_number() over (
          order by sri.created_at, sri.id
        ) - 1
      from public.service_request_items sri
      where sri.service_request_id = p_request_id
        and sri.item_source = 'customer_request'
      order by sri.created_at, sri.id;

      if not exists (
        select 1
        from public.invoice_line_items
        where invoice_id = p_invoice_id
      ) then
        raise exception 'invoice_source_items_required';
      end if;

    end if;
  end if;

  ----------------------------------------------------------------
  -- Calculate invoice totals from VAT-inclusive line prices.
  ----------------------------------------------------------------
  select round(
    coalesce(sum(quantity * unit_price), 0),
    2
  )
  into gross_total
  from public.invoice_line_items
  where invoice_id = p_invoice_id;

  effective_tax_rate := invoice_record.tax_rate;

  -- Legacy drafts may have tax_rate = 0.
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