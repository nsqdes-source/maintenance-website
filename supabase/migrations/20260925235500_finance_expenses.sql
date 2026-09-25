-- Finance expenses:
-- operational expenses are recorded separately from invoice revenue.

create table if not exists public.finance_expenses (
  id uuid primary key default gen_random_uuid(),

  category text not null check (
    category in (
      'parts',
      'technician',
      'transport',
      'operations',
      'tools',
      'marketing',
      'other'
    )
  ),

  description text not null
    check (char_length(trim(description)) between 1 and 500),

  amount numeric(12,2) not null
    check (amount > 0),

  expense_date date not null default current_date,

  payment_method text not null
    default 'bank_transfer'
    check (
      payment_method in (
        'cash',
        'bank_transfer',
        'card',
        'other'
      )
    ),

  vendor_name text not null default '',
  reference text not null default '',
  notes text not null default '',

  service_request_id uuid
    references public.service_requests(id),

  created_by uuid not null
    references public.profiles(id),

  created_at timestamptz not null default now(),

  voided_at timestamptz,
  voided_by uuid
    references public.profiles(id)
);

create index if not exists finance_expenses_date_idx
on public.finance_expenses(expense_date desc);

create index if not exists finance_expenses_category_idx
on public.finance_expenses(category, expense_date desc);

create index if not exists finance_expenses_request_idx
on public.finance_expenses(service_request_id)
where service_request_id is not null;

alter table public.finance_expenses
enable row level security;

drop policy if exists finance_expenses_managers
on public.finance_expenses;

create policy finance_expenses_managers
on public.finance_expenses
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

grant select on public.finance_expenses
to authenticated;


create or replace function public.finance_record_expense(
  p_category text,
  p_description text,
  p_amount numeric,
  p_expense_date date,
  p_payment_method text,
  p_vendor_name text default '',
  p_reference text default '',
  p_notes text default '',
  p_service_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expense_id uuid;
begin
  if not public.current_user_has_role(
    array[
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  if p_category not in (
    'parts',
    'technician',
    'transport',
    'operations',
    'tools',
    'marketing',
    'other'
  ) then
    raise exception 'invalid_expense_category';
  end if;

  if nullif(trim(coalesce(p_description, '')), '') is null then
    raise exception 'expense_description_required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_expense_amount';
  end if;

  if p_payment_method not in (
    'cash',
    'bank_transfer',
    'card',
    'other'
  ) then
    raise exception 'invalid_payment_method';
  end if;

  insert into public.finance_expenses (
    category,
    description,
    amount,
    expense_date,
    payment_method,
    vendor_name,
    reference,
    notes,
    service_request_id,
    created_by
  )
  values (
    p_category,
    left(trim(p_description), 500),
    p_amount,
    coalesce(p_expense_date, current_date),
    p_payment_method,
    left(trim(coalesce(p_vendor_name, '')), 200),
    left(trim(coalesce(p_reference, '')), 200),
    left(trim(coalesce(p_notes, '')), 1000),
    p_service_request_id,
    auth.uid()
  )
  returning id into expense_id;

  return expense_id;
end;
$$;

revoke all on function public.finance_record_expense(
  text,
  text,
  numeric,
  date,
  text,
  text,
  text,
  text,
  uuid
)
from public, anon;

grant execute on function public.finance_record_expense(
  text,
  text,
  numeric,
  date,
  text,
  text,
  text,
  text,
  uuid
)
to authenticated;


create or replace function public.finance_void_expense(
  p_expense_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.current_user_has_role(
    array[
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  update public.finance_expenses
  set
    voided_at = now(),
    voided_by = auth.uid()
  where id = p_expense_id
    and voided_at is null;

  if not found then
    raise exception 'expense_not_found_or_voided';
  end if;
end;
$$;

revoke all on function public.finance_void_expense(uuid)
from public, anon;

grant execute on function public.finance_void_expense(uuid)
to authenticated;