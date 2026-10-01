-- Phase 2B-1: preparation persistence only. REVIEW REQUIRED BEFORE APPLICATION.
-- Approved initial target: maintenance-website-zatca-test (xpvwkelctzgidpycflzw).
-- No application to source/production (wtmzvznsmitqmjgqwtnu) is authorized.
-- No XML, sequencing allocation, signing, issuance, or external API operations.

begin;

set local search_path = public, extensions, pg_temp;
set local lock_timeout = '5s';

-- Fail closed before any schema changes if Phase 1's unique key is unexpected
-- or an inbound FK uses the invoice-only key. DROP below is RESTRICT, never CASCADE.
do $preflight$
declare
  invoice_attnum smallint;
  old_key_index oid;
begin
  select attnum into invoice_attnum
  from pg_catalog.pg_attribute
  where attrelid = 'public.zatca_invoice_documents'::regclass
    and attname = 'invoice_id' and not attisdropped;

  select conindid into old_key_index
  from pg_catalog.pg_constraint
  where conrelid = 'public.zatca_invoice_documents'::regclass
    and conname = 'zatca_invoice_documents_invoice_uniq'
    and contype = 'u' and conkey = array[invoice_attnum]::smallint[];

  if old_key_index is null then
    raise exception 'zatca_phase2_unexpected_invoice_unique_constraint';
  end if;

  if exists (
    select 1 from pg_catalog.pg_constraint
    where contype = 'f'
      and confrelid = 'public.zatca_invoice_documents'::regclass
      and conindid = old_key_index
  ) then
    raise exception 'zatca_phase2_invoice_unique_has_dependent_foreign_key';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.zatca_invoice_documents'::regclass
      and conname = 'zatca_invoice_documents_id_invoice_uniq'
      and contype = 'u'
  ) then
    raise exception 'zatca_phase2_composite_document_key_missing';
  end if;
end;
$preflight$;

create table public.business_tax_profiles (
  id uuid primary key default gen_random_uuid(),
  finance_settings_id boolean not null
    references public.business_finance_settings(id) on delete restrict,
  legal_name text,
  vat_number text,
  registration_scheme text,
  registration_number text,
  street text,
  building_number text,
  district text,
  city text,
  postal_code text,
  country_code text,
  additional_number text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_tax_profiles_vat_format_chk
    check (vat_number is null or vat_number ~ '^3[0-9]{13}3$'),
  constraint business_tax_profiles_building_format_chk
    check (building_number is null or building_number ~ '^[0-9]{4}$'),
  constraint business_tax_profiles_postal_format_chk
    check (postal_code is null or postal_code ~ '^[0-9]{5}$'),
  constraint business_tax_profiles_additional_format_chk
    check (additional_number is null or additional_number ~ '^[0-9]{4}$'),
  constraint business_tax_profiles_registration_scheme_chk
    check (registration_scheme is null
      or registration_scheme in ('CRN', 'MOM', 'MLS', '700', 'SAG', 'OTH')),
  constraint business_tax_profiles_registration_number_chk
    check (registration_number is null
      or nullif(btrim(registration_number), '') is not null),
  constraint business_tax_profiles_registration_pair_chk
    check ((registration_scheme is null) = (registration_number is null)),
  constraint business_tax_profiles_active_complete_chk
    check (not is_active or (
      nullif(btrim(legal_name), '') is not null
      and vat_number is not null
      and registration_scheme is not null
      and registration_number is not null
      and nullif(btrim(street), '') is not null
      and building_number is not null
      and nullif(btrim(district), '') is not null
      and nullif(btrim(city), '') is not null
      and postal_code is not null
      and country_code is not null and country_code = 'SA'
    ))
);

create unique index business_tax_profiles_one_active_uniq
  on public.business_tax_profiles(finance_settings_id) where is_active;
create index business_tax_profiles_finance_settings_idx
  on public.business_tax_profiles(finance_settings_id);

comment on table public.business_tax_profiles is
  'Structured seller identity for invoice preparation. Incomplete inactive profiles are allowed; activation requires a complete v1 Saudi identity. No automatic free-text backfill.';
comment on column public.business_tax_profiles.updated_at is
  'Creation default only; future server mutations must explicitly update this timestamp. No timestamp trigger is introduced in Phase 2B-1.';

alter table public.business_tax_profiles enable row level security;
revoke all on table public.business_tax_profiles from public, anon, authenticated;
grant select on table public.business_tax_profiles to authenticated;

create policy business_tax_profiles_admin_read
  on public.business_tax_profiles for select to authenticated
  using (public.current_user_has_role(
    array['admin_manager', 'super_admin']::public.app_role[]
  ));

alter table public.zatca_invoice_documents
  add column canonical_snapshot jsonb,
  add column snapshot_version integer,
  add column rules_version text,
  add column snapshot_frozen_at timestamptz,
  add column source_fingerprint text,
  add column issue_at timestamptz,
  add column revision_no integer,
  add column supersedes_document_id uuid,
  add column is_current boolean,
  add column preparation_status text,
  add column canonical_validated_at timestamptz;

-- Preserve all existing technical artifacts and integration statuses.
-- Existing rows begin as revision 1; no canonical validity is inferred.
update public.zatca_invoice_documents
set revision_no = 1, is_current = true, preparation_status = 'draft';

alter table public.zatca_invoice_documents
  alter column revision_no set default 1,
  alter column revision_no set not null,
  alter column is_current set default true,
  alter column is_current set not null,
  alter column preparation_status set default 'draft',
  alter column preparation_status set not null,
  add constraint zatca_invoice_documents_revision_uniq
    unique (invoice_id, revision_no),
  add constraint zatca_invoice_documents_revision_positive_chk
    check (revision_no >= 1),
  add constraint zatca_invoice_documents_supersedes_not_self_chk
    check (supersedes_document_id is null or supersedes_document_id <> id),
  add constraint zatca_invoice_documents_supersedes_invoice_fk
    foreign key (supersedes_document_id, invoice_id)
    references public.zatca_invoice_documents(id, invoice_id) on delete restrict,
  add constraint zatca_invoice_documents_preparation_status_chk
    check (preparation_status in (
      'draft', 'prepared', 'frozen', 'canonical_validated', 'invalidated', 'superseded'
    )),
  add constraint zatca_invoice_documents_snapshot_object_chk
    check (canonical_snapshot is null or jsonb_typeof(canonical_snapshot) = 'object'),
  add constraint zatca_invoice_documents_snapshot_version_chk
    check (snapshot_version is null or snapshot_version >= 1),
  add constraint zatca_invoice_documents_rules_nonempty_chk
    check (rules_version is null or nullif(btrim(rules_version), '') is not null),
  add constraint zatca_invoice_documents_fingerprint_nonempty_chk
    check (source_fingerprint is null
      or nullif(btrim(source_fingerprint), '') is not null),
  add constraint zatca_invoice_documents_frozen_fields_chk
    check (
      (preparation_status not in ('frozen', 'canonical_validated')
        and snapshot_frozen_at is null)
      or (
        canonical_snapshot is not null
        and snapshot_version is not null
        and rules_version is not null
        and snapshot_frozen_at is not null
        and source_fingerprint is not null
        and issue_at is not null
      )
    ),
  add constraint zatca_invoice_documents_canonical_validated_chk
    check (preparation_status <> 'canonical_validated'
      or canonical_validated_at is not null),
  add constraint zatca_invoice_documents_validation_requires_freeze_chk
    check (canonical_validated_at is null or snapshot_frozen_at is not null),
  add constraint zatca_invoice_documents_superseded_not_current_chk
    check (preparation_status <> 'superseded' or not is_current);

create unique index zatca_invoice_documents_current_invoice_uniq
  on public.zatca_invoice_documents(invoice_id) where is_current;
-- v1 uses a linear revision history: at most one successor per document.
create unique index zatca_invoice_documents_one_successor_uniq
  on public.zatca_invoice_documents(supersedes_document_id)
  where supersedes_document_id is not null;

-- New revision constraints and indexes exist before the old key is removed.
-- Retain (id, invoice_id), UUID, EGS/ICV, and the event composite FK unchanged.
alter table public.zatca_invoice_documents
  drop constraint zatca_invoice_documents_invoice_uniq restrict;

comment on column public.zatca_invoice_documents.issue_at is
  'Selected/frozen timestamp for a future ZATCA document; NOT public.invoices.issued_at and NOT evidence of commercial issuance.';
comment on column public.zatca_invoice_documents.canonical_snapshot is
  'Versioned preparation payload only; never include secrets. Database immutability enforcement is deferred to a separate review gate.';
comment on column public.zatca_invoice_documents.source_fingerprint is
  'Future application fingerprint of commercial sources; NOT the ZATCA invoice XML hash. This migration computes no fingerprints.';
comment on column public.zatca_invoice_documents.preparation_status is
  'Canonical preparation lifecycle, separate from integration_status and XML validation. Legacy artifacts are not automatically marked canonical_validated.';
comment on column public.zatca_invoice_documents.is_current is
  'Current working revision, not necessarily the accepted or commercially issued document.';
comment on table public.zatca_invoice_documents is
  'Technical ZATCA document revisions for a commercial invoice. Creating/preparing/freezing a document does not issue the invoice.';

-- No immutability/revision-order triggers, server mutation functions, or grants
-- to browser writers are introduced. Existing ZATCA RLS/policies are unchanged.
-- finance_set_invoice_status and tax_invoicing_integration_required stay intact.

commit;
