create or replace function public.finance_void_payment(
  p_payment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  bill_id uuid;
begin
  if not public.current_user_has_role(
    array[
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  select invoice_id
  into bill_id
  from public.invoice_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'payment_not_found';
  end if;

  perform 1
  from public.invoices
  where id = bill_id
  for update;

  update public.invoice_payments
  set
    voided_at = now(),
    voided_by = auth.uid()
  where id = p_payment_id
    and voided_at is null;

  if not found then
    raise exception 'payment_already_void';
  end if;

  ----------------------------------------------------------------
  -- If this invoice payment originated from a pre-invoice
  -- service request payment, void the source record as well.
  --
  -- Keep transferred_invoice_payment_id and transferred_at intact
  -- for audit history.
  ----------------------------------------------------------------
  update public.service_request_payments
  set
    voided_at = now(),
    voided_by = auth.uid()
  where transferred_invoice_payment_id = p_payment_id
    and voided_at is null;

  ----------------------------------------------------------------
  -- Voiding any active payment means the invoice is no longer
  -- considered fully paid.
  ----------------------------------------------------------------
  update public.invoices
  set
    paid_at = null,
    updated_at = now()
  where id = bill_id;
end;
$$;

revoke all
on function public.finance_void_payment(uuid)
from public, anon;

grant execute
on function public.finance_void_payment(uuid)
to authenticated;