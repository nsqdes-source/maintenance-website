-- Payments collected before the final invoice exists.
-- These payments belong to the service request first.
-- Later they can be transferred to invoice_payments when the final invoice is issued.

create table public.service_request_payments (
  id uuid primary key default gen_random_uuid(),

  service_request_id uuid not null
    references public.service_requests(id)
    on delete restrict,

  payment_type text not null
    check (
      payment_type in (
        'visit_fee',
        'deposit',
        'advance',
        'other'
      )
    ),

  amount numeric(12,2) not null
    check (amount > 0),

  method text not null
    check (
      method in (
        'cash',
        'bank_transfer',
        'card',
        'other'
      )
    ),

  note text not null default '',

  paid_at timestamptz not null default now(),

  recorded_by uuid not null
    references public.profiles(id),

  created_at timestamptz not null default now(),

  voided_at timestamptz,
  voided_by uuid
    references public.profiles(id),

  transferred_invoice_payment_id uuid
    references public.invoice_payments(id)
    on delete restrict,

  transferred_at timestamptz,

  check (
    (
      transferred_invoice_payment_id is null
      and transferred_at is null
    )
    or
    (
      transferred_invoice_payment_id is not null
      and transferred_at is not null
    )
  )
);


create index service_request_payments_request_idx
on public.service_request_payments(
  service_request_id,
  paid_at desc
);


create index service_request_payments_active_idx
on public.service_request_payments(
  service_request_id,
  payment_type,
  paid_at desc
)
where voided_at is null;


create unique index service_request_payments_invoice_payment_uidx
on public.service_request_payments(
  transferred_invoice_payment_id
)
where transferred_invoice_payment_id is not null;


alter table public.service_request_payments
enable row level security;


create policy service_request_payments_managers_read
on public.service_request_payments
for select
to authenticated
using (
  public.current_user_has_role(
    array[
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
  )
);


grant select
on public.service_request_payments
to authenticated;


-- Record money received before the final invoice exists.
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

  -- Once the request is completed, money should be collected
  -- against its final invoice instead.
  if request_stage in (
    'completed',
    'cancelled',
    'customer_cancelled'
  ) then
    raise exception 'request_not_open_for_preinvoice_payment';
  end if;

  -- Prevent recording a pre-invoice payment when an issued
  -- invoice already exists for the request.
  if exists (
    select 1
    from public.invoices
    where service_request_id = p_request_id
      and status = 'issued'
  ) then
    raise exception 'request_invoice_already_issued';
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


-- Void a pre-invoice payment while preserving its audit history.
create or replace function public.finance_void_service_request_payment(
  p_payment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  payment_record public.service_request_payments%rowtype;
begin
  if not public.current_user_has_role(
    array[
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  select *
  into payment_record
  from public.service_request_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'payment_not_found';
  end if;

  if payment_record.voided_at is not null then
    raise exception 'payment_already_void';
  end if;

  -- After transfer, cancellation must be coordinated with
  -- the corresponding invoice payment instead.
  if payment_record.transferred_invoice_payment_id is not null then
    raise exception 'payment_already_transferred';
  end if;

  update public.service_request_payments
  set
    voided_at = now(),
    voided_by = auth.uid()
  where id = p_payment_id;
end;
$$;


revoke all
on function public.finance_void_service_request_payment(uuid)
from public, anon;


grant execute
on function public.finance_void_service_request_payment(uuid)
to authenticated;