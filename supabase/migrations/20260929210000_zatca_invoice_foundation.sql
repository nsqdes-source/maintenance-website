-- ZATCA invoice integration foundation — TEST-FIRST / additive only.
-- Target for initial application: maintenance-website-zatca-test (xpvwkelctzgidpycflzw)
-- Do not apply to production/source (wtmzvznsmitqmjgqwtnu) without a separate explicit approval.
-- This migration does NOT generate XML, sign invoices, call ZATCA APIs, or unlock VAT issuance.

begin;

set local search_path = public, extensions, pg_temp;

create table public.zatca_egs_units (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  environment text not null default 'simulation',
  serial_number text not null,
  solution_name text not null default 'Mueen Maintenance Website',
  vat_number text not null,
  onboarding_state text not null default 'not_started',
  last_icv bigint not null default 0,
  last_invoice_hash text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint zatca_egs_units_label_nonempty_chk
    check (nullif(trim(label), '') is not null),
  constraint zatca_egs_units_serial_nonempty_chk
    check (nullif(trim(serial_number), '') is not null),
  constraint zatca_egs_units_vat_nonempty_chk
    check (nullif(trim(vat_number), '') is not null),
  constraint zatca_egs_units_environment_chk
    check (environment in ('simulation', 'production')),
  constraint zatca_egs_units_onboarding_state_chk
    check (onboarding_state in (
      'not_started',
      'compliance_ready',
      'compliance_active',
      'production_ready',
      'production_active',
      'suspended'
    )),
  constraint zatca_egs_units_last_icv_chk
    check (last_icv >= 0),
  constraint zatca_egs_units_environment_serial_uniq
    unique (environment, serial_number)
);

comment on table public.zatca_egs_units is
  'Non-secret metadata and sequencing head for a ZATCA E-Invoice Generation Solution unit. Never store private keys, OTPs, CSID secrets, access tokens, or secret certificate material here.';

create table public.zatca_invoice_documents (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  egs_unit_id uuid references public.zatca_egs_units(id) on delete restrict,

  invoice_kind text not null,
  document_kind text not null default 'invoice',

  invoice_uuid uuid not null default gen_random_uuid(),
  icv bigint,
  previous_invoice_hash text,
  xml_hash text,

  unsigned_xml text,
  signed_xml text,
  qr_code_base64 text,

  integration_status text not null default 'draft',
  clearance_status text not null default 'not_applicable',
  reporting_status text not null default 'not_applicable',

  zatca_request_id text,
  zatca_clearance_status text,
  zatca_reporting_status text,
  validation_warnings jsonb not null default '[]'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  response_payload jsonb,

  prepared_at timestamptz,
  validated_at timestamptz,
  signed_at timestamptz,
  locally_issued_at timestamptz,
  submitted_at timestamptz,
  accepted_at timestamptz,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint zatca_invoice_documents_invoice_uniq
    unique (invoice_id),
  constraint zatca_invoice_documents_uuid_uniq
    unique (invoice_uuid),
  constraint zatca_invoice_documents_invoice_kind_chk
    check (invoice_kind in ('standard', 'simplified')),
  constraint zatca_invoice_documents_document_kind_chk
    check (document_kind in ('invoice', 'credit_note', 'debit_note')),
  constraint zatca_invoice_documents_icv_chk
    check (icv is null or icv > 0),
  constraint zatca_invoice_documents_integration_status_chk
    check (integration_status in (
      'draft',
      'prepared',
      'validated',
      'signed',
      'pending_clearance',
      'cleared',
      'issued_locally',
      'pending_reporting',
      'reported',
      'reporting_failed',
      'rejected',
      'failed'
    )),
  constraint zatca_invoice_documents_clearance_status_chk
    check (clearance_status in (
      'not_applicable',
      'not_submitted',
      'pending',
      'cleared',
      'rejected',
      'failed'
    )),
  constraint zatca_invoice_documents_reporting_status_chk
    check (reporting_status in (
      'not_applicable',
      'not_submitted',
      'pending',
      'reported',
      'rejected',
      'failed'
    )),
  constraint zatca_invoice_documents_warnings_array_chk
    check (jsonb_typeof(validation_warnings) = 'array'),
  constraint zatca_invoice_documents_errors_array_chk
    check (jsonb_typeof(validation_errors) = 'array')
);

comment on table public.zatca_invoice_documents is
  'Technical ZATCA document state and immutable artifacts associated with one commercial invoice. Creating a row does not issue the invoice.';
comment on column public.zatca_invoice_documents.icv is
  'Invoice Counter Value. Must be allocated transactionally per EGS during finalization; ordinary draft editing must not consume ICV values.';
comment on column public.zatca_invoice_documents.previous_invoice_hash is
  'Hash of the preceding finalized ZATCA document in the EGS sequence. Allocation is deferred to the finalization/signing phase.';
comment on column public.zatca_invoice_documents.response_payload is
  'Sanitized ZATCA response metadata only. Must not contain authorization secrets, private keys, OTPs, or CSID secrets.';

create table public.zatca_invoice_events (
  id uuid primary key default gen_random_uuid(),
  zatca_document_id uuid not null references public.zatca_invoice_documents(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint zatca_invoice_events_event_nonempty_chk
    check (nullif(trim(event_type), '') is not null),
  constraint zatca_invoice_events_details_object_chk
    check (jsonb_typeof(details) = 'object')
);

comment on table public.zatca_invoice_events is
  'Append-only audit events for ZATCA preparation, validation, signing, submission, response, and retry lifecycle. Event payloads must never contain secrets.';

create unique index zatca_invoice_documents_egs_icv_uniq
  on public.zatca_invoice_documents(egs_unit_id, icv)
  where egs_unit_id is not null and icv is not null;

create index zatca_invoice_documents_status_idx
  on public.zatca_invoice_documents(integration_status, created_at desc);

create index zatca_invoice_documents_submission_idx
  on public.zatca_invoice_documents(invoice_kind, integration_status, next_retry_at)
  where integration_status in ('pending_clearance', 'pending_reporting', 'reporting_failed', 'failed');

create index zatca_invoice_events_document_created_idx
  on public.zatca_invoice_events(zatca_document_id, created_at desc);

create index zatca_invoice_events_invoice_created_idx
  on public.zatca_invoice_events(invoice_id, created_at desc);

alter table public.zatca_egs_units enable row level security;
alter table public.zatca_invoice_documents enable row level security;
alter table public.zatca_invoice_events enable row level security;

-- Read-only visibility for finance administrators in authenticated UI.
-- No browser INSERT/UPDATE/DELETE policies are intentionally created.
create policy zatca_egs_units_admin_read
  on public.zatca_egs_units
  for select
  to authenticated
  using (
    public.current_user_has_role(
      array['admin_manager', 'super_admin']::public.app_role[]
    )
  );

create policy zatca_invoice_documents_admin_read
  on public.zatca_invoice_documents
  for select
  to authenticated
  using (
    public.current_user_has_role(
      array['admin_manager', 'super_admin']::public.app_role[]
    )
  );

create policy zatca_invoice_events_admin_read
  on public.zatca_invoice_events
  for select
  to authenticated
  using (
    public.current_user_has_role(
      array['admin_manager', 'super_admin']::public.app_role[]
    )
  );

-- Explicit privilege posture: tables are readable only through the RLS policies above.
-- ZATCA mutations will be introduced later through server-side, narrowly scoped operations.
revoke all on table public.zatca_egs_units from anon;
revoke all on table public.zatca_invoice_documents from anon;
revoke all on table public.zatca_invoice_events from anon;

revoke insert, update, delete, truncate, references, trigger
  on table public.zatca_egs_units from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.zatca_invoice_documents from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.zatca_invoice_events from authenticated;

grant select on table public.zatca_egs_units to authenticated;
grant select on table public.zatca_invoice_documents to authenticated;
grant select on table public.zatca_invoice_events to authenticated;

-- Deliberately unchanged in this migration:
--   public.finance_set_invoice_status
-- VAT invoices therefore continue to raise:
--   tax_invoicing_integration_required
-- until the later ZATCA issuance/finalization phase is implemented and approved.

commit;
