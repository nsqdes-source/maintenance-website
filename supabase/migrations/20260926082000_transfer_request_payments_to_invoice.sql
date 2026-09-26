-- Transfer active pre-invoice service request payments
-- into invoice_payments when the final invoice is issued.
-- The original service_request_payments rows are preserved
-- and linked to the created invoice payment rows.

create or replace function private.finance_transfer_request_payments_to_invoice(
  p_invoice_id uuid,
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_payment public.service_request_payments%rowtype;
  new_invoice_payment_id uuid;
  current_received numeric(12,2);
  invoice_total numeric(12,2);
begin
  select total
  into invoice_total
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found';
  end if;

  select coalesce(sum(amount), 0)
  into current_received
  from public.invoice_payments
  where invoice_id = p_invoice_id
    and voided_at is null;

  for request_payment in
    select *
    from public.service_request_payments
    where service_request_id = p_request_id
      and voided_at is null
      and transferred_invoice_payment_id is null
    order by paid_at, created_at, id
    for update
  loop
    if current_received + request_payment.amount > invoice_total then
      raise exception 'preinvoice_payments_exceed_invoice_total';
    end if;

    insert into public.invoice_payments (
      invoice_id,
      amount,
      method,
      note,
      paid_at,
      recorded_by
    )
    values (
      p_invoice_id,
      request_payment.amount,
      request_payment.method,
      left(
        trim(
          concat(
            case request_payment.payment_type
              when 'visit_fee' then 'رسوم زيارة'
              when 'deposit' then 'عربون'
              when 'advance' then 'دفعة مقدمة'
              else 'دفعة قبل الفاتورة'
            end,
            case
              when nullif(trim(request_payment.note), '') is not null
                then ' - ' || trim(request_payment.note)
              else ''
            end
          )
        ),
        500
      ),
      request_payment.paid_at,
      request_payment.recorded_by
    )
    returning id into new_invoice_payment_id;

    update public.service_request_payments
    set
      transferred_invoice_payment_id = new_invoice_payment_id,
      transferred_at = now()
    where id = request_payment.id;

    current_received :=
      current_received + request_payment.amount;
  end loop;

  if current_received = invoice_total then
    update public.invoices
    set
      paid_at = coalesce(paid_at, now()),
      updated_at = now()
    where id = p_invoice_id;
  else
    update public.invoices
    set
      paid_at = null,
      updated_at = now()
    where id = p_invoice_id;
  end if;
end;
$$;

revoke all
on function private.finance_transfer_request_payments_to_invoice(uuid, uuid)
from public, anon, authenticated;


create or replace function public.finance_set_invoice_status(
  p_invoice_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  bill public.invoices%rowtype;
begin
  if not public.current_user_has_role(
    array[
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  if p_status not in ('issued', 'void') then
    raise exception 'invalid_status';
  end if;

  select *
  into bill
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found';
  end if;

  if p_status = 'issued' then
    if bill.vat_registered then
      raise exception 'tax_invoicing_integration_required';
    end if;

    if bill.status <> 'draft' then
      raise exception 'invoice_not_draft';
    end if;

    if not exists (
      select 1
      from public.invoice_line_items
      where invoice_id = p_invoice_id
    ) then
      raise exception 'invoice_lines_required';
    end if;

    update public.invoices
    set
      status = 'issued',
      issued_at = now(),
      updated_at = now()
    where id = p_invoice_id;

    perform private.finance_transfer_request_payments_to_invoice(
      p_invoice_id,
      bill.service_request_id
    );

  else
    if bill.status not in ('draft', 'issued') then
      raise exception 'invoice_not_active';
    end if;

    if exists (
      select 1
      from public.invoice_payments
      where invoice_id = p_invoice_id
        and voided_at is null
    ) then
      raise exception 'invoice_has_payments';
    end if;

    update public.invoices
    set
      status = 'void',
      issued_at = coalesce(issued_at, now()),
      paid_at = null,
      updated_at = now()
    where id = p_invoice_id;
  end if;
end;
$$;

revoke all
on function public.finance_set_invoice_status(uuid, text)
from public, anon;

grant execute
on function public.finance_set_invoice_status(uuid, text)
to authenticated;