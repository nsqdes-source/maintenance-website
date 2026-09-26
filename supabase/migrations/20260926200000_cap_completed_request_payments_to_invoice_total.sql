create or replace function public.finance_record_service_request_payment(
  p_request_id uuid,
  p_amount numeric,
  p_payment_type text,
  p_method text,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_stage text;
  payment_id uuid;

  draft_invoice_id uuid;
  draft_invoice_total numeric(12,2);

  invoice_paid_total numeric(12,2);
  untransferred_request_total numeric(12,2);
  projected_total numeric(12,2);
begin
  if not public.current_user_has_role(
    array[
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  if p_amount is null
     or p_amount <= 0 then
    raise exception 'invalid_payment_amount';
  end if;

  if p_payment_type not in (
    'visit_fee',
    'deposit',
    'advance',
    'other'
  ) then
    raise exception 'invalid_payment_type';
  end if;

  if p_method not in (
    'cash',
    'bank_transfer',
    'card',
    'other'
  ) then
    raise exception 'invalid_payment_method';
  end if;

  select workflow_stage
  into request_stage
  from public.service_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'service_request_not_found';
  end if;

  if request_stage in (
    'cancelled',
    'customer_cancelled'
  ) then
    raise exception 'request_not_open_for_preinvoice_payment';
  end if;

  -- Once an invoice is issued, later collections belong directly
  -- to invoice_payments.
  if exists (
    select 1
    from public.invoices
    where service_request_id = p_request_id
      and status = 'issued'
  ) then
    raise exception 'request_invoice_already_issued';
  end if;

  ----------------------------------------------------------------
  -- After completion, cap collections against the final draft
  -- invoice total.
  ----------------------------------------------------------------
  if request_stage = 'completed' then

    select
      id,
      total
    into
      draft_invoice_id,
      draft_invoice_total
    from public.invoices
    where service_request_id = p_request_id
      and status = 'draft'
    order by created_at desc
    limit 1
    for update;

    if draft_invoice_id is null then
      raise exception 'completed_request_invoice_draft_required';
    end if;

    -- Already-transferred request payments are represented here,
    -- so they must not be counted again from service_request_payments.
    select coalesce(sum(amount), 0)
    into invoice_paid_total
    from public.invoice_payments
    where invoice_id = draft_invoice_id
      and voided_at is null;

    -- Count only request payments that have not yet been transferred.
    select coalesce(sum(amount), 0)
    into untransferred_request_total
    from public.service_request_payments
    where service_request_id = p_request_id
      and voided_at is null
      and transferred_invoice_payment_id is null;

    projected_total :=
      round(
        invoice_paid_total
        + untransferred_request_total
        + p_amount,
        2
      );

    if projected_total > draft_invoice_total then
      raise exception 'payment_exceeds_invoice_remaining';
    end if;

  end if;

  insert into public.service_request_payments (
    service_request_id,
    payment_type,
    amount,
    method,
    note,
    recorded_by
  )
  values (
    p_request_id,
    p_payment_type,
    round(p_amount, 2),
    p_method,
    left(trim(coalesce(p_note, '')), 500),
    auth.uid()
  )
  returning id into payment_id;

  return payment_id;
end;
$$;

revoke all
on function public.finance_record_service_request_payment(
  uuid,
  numeric,
  text,
  text,
  text
)
from public, anon;

grant execute
on function public.finance_record_service_request_payment(
  uuid,
  numeric,
  text,
  text,
  text
)
to authenticated;