-- Snapshot of customer-selected priced services at request time.
-- Prices are preserved so later catalog price changes do not alter old requests.

create table public.service_request_items (
  id uuid primary key default gen_random_uuid(),

  service_request_id uuid not null
    references public.service_requests(id)
    on delete cascade,

  catalog_service_id uuid
    references public.service_catalog_services(id)
    on delete restrict,

  -- Snapshot fields: never depend on the live catalog for historical pricing.
  service_name text not null
    check (char_length(trim(service_name)) between 1 and 120),

  quantity numeric(10,2) not null default 1
    check (quantity > 0),

  net_unit_price numeric(12,2) not null
    check (net_unit_price >= 0),

  tax_rate numeric(5,2) not null
    check (tax_rate between 0 and 100),

  gross_unit_price numeric(12,2) not null
    check (gross_unit_price >= 0),

  gross_total numeric(12,2)
    generated always as (
      round(gross_unit_price * quantity, 2)
    ) stored,

  -- Initial customer selections now.
  -- Additional origins can be added later for technician/admin change orders.
  item_source text not null default 'customer_request'
    check (
      item_source in (
        'customer_request',
        'technician_change',
        'admin_change'
      )
    ),

  created_at timestamptz not null default now()
);

create index service_request_items_request_idx
  on public.service_request_items(service_request_id);

create index service_request_items_catalog_service_idx
  on public.service_request_items(catalog_service_id);

alter table public.service_request_items
  enable row level security;

grant select on public.service_request_items
  to authenticated;

create policy "admins read service request items"
  on public.service_request_items
  for select
  to authenticated
  using (
    public.current_user_has_role(
      array[
        'maintenance_manager',
        'admin_manager',
        'super_admin'
      ]::public.app_role[]
    )
  );