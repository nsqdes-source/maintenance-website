-- Technician change requests.
-- Keeps the customer's original request immutable while allowing
-- technicians to propose additional services or parts for admin review.

create table public.service_request_change_requests (
  id uuid primary key default gen_random_uuid(),

  service_request_id uuid not null
    references public.service_requests(id)
    on delete cascade,

  technician_id uuid not null
    references public.technicians(id)
    on delete restrict,

  status text not null default 'submitted'
    check (
      status in (
        'submitted',
        'approved',
        'rejected',
        'superseded'
      )
    ),

  notes text,

  reviewed_by uuid
    references public.profiles(id)
    on delete set null,

  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index service_request_change_requests_request_idx
  on public.service_request_change_requests(service_request_id);

create index service_request_change_requests_technician_idx
  on public.service_request_change_requests(technician_id);

create index service_request_change_requests_status_idx
  on public.service_request_change_requests(status);


create table public.service_request_change_items (
  id uuid primary key default gen_random_uuid(),

  change_request_id uuid not null
    references public.service_request_change_requests(id)
    on delete cascade,

  item_type text not null
    check (
      item_type in (
        'service',
        'part',
        'other'
      )
    ),

  catalog_service_id uuid
    references public.service_catalog_services(id)
    on delete restrict,

  catalog_part_id uuid
    references public.service_catalog_parts(id)
    on delete restrict,

  item_name text not null
    check (
      char_length(trim(item_name))
      between 1 and 160
    ),

  quantity numeric(10,2) not null default 1
    check (
      quantity > 0
      and quantity <= 100
    ),

  net_unit_price numeric(12,2) not null
    check (net_unit_price >= 0),

  tax_rate numeric(5,2) not null
    check (
      tax_rate >= 0
      and tax_rate <= 100
    ),

  gross_unit_price numeric(12,2) not null
    check (gross_unit_price >= 0),

  gross_total numeric(12,2)
    generated always as (
      round(gross_unit_price * quantity, 2)
    ) stored,

  created_at timestamptz not null default now(),

  check (
    (
      item_type = 'service'
      and catalog_service_id is not null
      and catalog_part_id is null
    )
    or
    (
      item_type = 'part'
      and catalog_part_id is not null
      and catalog_service_id is null
    )
    or
    (
      item_type = 'other'
      and catalog_service_id is null
      and catalog_part_id is null
    )
  )
);

create index service_request_change_items_change_idx
  on public.service_request_change_items(change_request_id);

create index service_request_change_items_service_idx
  on public.service_request_change_items(catalog_service_id);

create index service_request_change_items_part_idx
  on public.service_request_change_items(catalog_part_id);


alter table public.service_request_change_requests
  enable row level security;

alter table public.service_request_change_items
  enable row level security;


grant select
  on public.service_request_change_requests
  to authenticated;

grant select
  on public.service_request_change_items
  to authenticated;


create policy "admins read change requests"
  on public.service_request_change_requests
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


create policy "assigned technicians read own change requests"
  on public.service_request_change_requests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.technicians technician
      where technician.id =
        service_request_change_requests.technician_id
        and technician.profile_id = auth.uid()
    )
  );


create policy "admins read change request items"
  on public.service_request_change_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.service_request_change_requests change_request
      where change_request.id =
        service_request_change_items.change_request_id
        and public.current_user_has_role(
          array[
            'maintenance_manager',
            'admin_manager',
            'super_admin'
          ]::public.app_role[]
        )
    )
  );


create policy "technicians read own change request items"
  on public.service_request_change_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.service_request_change_requests change_request
      join public.technicians technician
        on technician.id = change_request.technician_id
      where change_request.id =
        service_request_change_items.change_request_id
        and technician.profile_id = auth.uid()
    )
  );