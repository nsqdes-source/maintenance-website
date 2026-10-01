-- LOCAL REVIEW ARTIFACT ONLY. Approved prospective target: xpvwkelctzgidpycflzw.
-- Never apply to wtmzvznsmitqmjgqwtnu. No commercial issuance or external operations.
begin;
set local lock_timeout = '3s';

alter table public.zatca_invoice_documents
  add column preparation_version bigint not null default 0,
  add column preparation_input jsonb,
  add column prepared_source_snapshot jsonb,
  add constraint zatca_preparation_version_chk check (preparation_version >= 0),
  add constraint zatca_preparation_input_object_chk check (preparation_input is null or jsonb_typeof(preparation_input) = 'object'),
  add constraint zatca_prepared_source_object_chk check (prepared_source_snapshot is null or jsonb_typeof(prepared_source_snapshot) = 'object');

-- Validate existing rows without inventing inputs or historical validity. Any incompatible
-- prepared/frozen row fails the whole migration; it requires a separate explicit decision.
alter table public.zatca_invoice_documents add constraint zatca_preparation_presence_chk check (
  preparation_status not in ('prepared', 'frozen', 'canonical_validated') or (
    canonical_snapshot is not null and preparation_input is not null
    and prepared_source_snapshot is not null and snapshot_version is not null
    and rules_version is not null and source_fingerprint is not null
  )
);

create schema zatca_private;
revoke all on schema zatca_private from public, anon, authenticated;
grant usage on schema zatca_private to service_role;

create function zatca_private.utc_text(p_at timestamptz) returns text
language sql immutable strict set search_path = '' as $$
  select pg_catalog.to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- Preserve microseconds in source markers. Document issue timestamps use utc_text/MS.
create function zatca_private.source_utc_text(p_at timestamptz) returns text
language sql immutable strict set search_path = '' as $$
 select pg_catalog.to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
$$;

-- Whitelist projection: decimal values are text, arrays use a total UUID order.
-- One SQL statement supplies a single MVCC snapshot, including transfer targets.
create function zatca_private.source_envelope(p_invoice_id uuid) returns jsonb
language sql stable set search_path = '' as $$
select jsonb_build_object(
 'formatVersion', 1,
 'invoice', jsonb_build_object(
  'id',i.id,'number',i.invoice_number::text,'serviceRequestId',i.service_request_id,
  'customerId',i.customer_id,'status',i.status,'businessName',i.business_name,
  'businessVat',i.business_tax_number,'vatRegistered',i.vat_registered,
  'currency',i.currency,'taxRate',i.tax_rate::text,'subtotal',i.subtotal::text,
  'taxAmount',i.tax_amount::text,'total',i.total::text,
  'updatedAt',zatca_private.source_utc_text(i.updated_at)),
 'financeSettings',(select jsonb_build_object('id',f.id,'legalName',f.legal_name,
  'taxNumber',f.tax_number,'vatRegistered',f.vat_registered,'currency',f.currency,
  'taxRate',f.tax_rate::text,'updatedAt',zatca_private.source_utc_text(f.updated_at))
  from public.business_finance_settings f where f.id = true),
 'lines',coalesce((select jsonb_agg(jsonb_build_object(
  'id',l.id,'invoiceId',l.invoice_id,'description',l.description,'quantity',l.quantity::text,
  'unitPrice',l.unit_price::text,'sortOrder',l.sort_order,'taxCategory','S',
  'allowances','[]'::jsonb,'charges','[]'::jsonb,'unitCode',null)
  order by l.sort_order,l.id) from public.invoice_line_items l where l.invoice_id=i.id),'[]'::jsonb),
 'sellers',coalesce((select jsonb_agg(jsonb_build_object(
  'id',s.id,'financeSettingsId',s.finance_settings_id,'active',s.is_active,
  'legalName',s.legal_name,'vatNumber',s.vat_number,
  'registration',jsonb_build_object('scheme',s.registration_scheme,'value',s.registration_number),
  'address',jsonb_build_object('street',s.street,'buildingNumber',s.building_number,
   'district',s.district,'city',s.city,'postalCode',s.postal_code,'countryCode',s.country_code,
   'additionalNumber',s.additional_number),'updatedAt',zatca_private.source_utc_text(s.updated_at))
  order by s.id) from public.business_tax_profiles s where s.finance_settings_id=true and s.is_active),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(p.record order by p.source_table collate "C",p.id) from (
  select 'invoice_payments'::text source_table,p.id,jsonb_build_object(
   'sourceTable','invoice_payments','id',p.id,'invoiceId',p.invoice_id,
   'amount',p.amount::text,'paidAt',zatca_private.source_utc_text(p.paid_at),
   'voidedAt',zatca_private.source_utc_text(p.voided_at),'paymentType',null,
   'transferredInvoicePaymentId',null,'transferredAt',null) record
  from public.invoice_payments p where p.invoice_id=i.id
   or p.id in (select r.transferred_invoice_payment_id from public.service_request_payments r where r.service_request_id=i.service_request_id)
  union all
  select 'service_request_payments',r.id,jsonb_build_object(
   'sourceTable','service_request_payments','id',r.id,'serviceRequestId',r.service_request_id,
   'amount',r.amount::text,'paidAt',zatca_private.source_utc_text(r.paid_at),
   'voidedAt',zatca_private.source_utc_text(r.voided_at),'paymentType',r.payment_type,
   'transferredInvoicePaymentId',r.transferred_invoice_payment_id,
   'transferredAt',zatca_private.source_utc_text(r.transferred_at))
  from public.service_request_payments r where r.service_request_id=i.service_request_id
 ) p),'[]'::jsonb)
) from public.invoices i where i.id=p_invoice_id;
$$;

create function zatca_private.assert_actor(p_actor_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if p_actor_id is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.profiles p where p.id=p_actor_id
   and p.role in ('admin_manager','super_admin')) then raise exception 'FORBIDDEN'; end if;
end;
$$;

create function zatca_private.guard_frozen_document() returns trigger
language plpgsql set search_path = '' as $$
begin
 if old.snapshot_frozen_at is not null then
  if tg_op='DELETE' then raise exception 'FROZEN_DOCUMENT_IMMUTABLE'; end if;
  if row(new.canonical_snapshot,new.snapshot_version,new.rules_version,new.source_fingerprint,
    new.snapshot_frozen_at,new.issue_at,new.revision_no,new.invoice_uuid,new.invoice_id,
    new.supersedes_document_id,new.preparation_input,new.prepared_source_snapshot,
    new.id,new.invoice_kind,new.document_kind)
   is distinct from row(old.canonical_snapshot,old.snapshot_version,old.rules_version,old.source_fingerprint,
    old.snapshot_frozen_at,old.issue_at,old.revision_no,old.invoice_uuid,old.invoice_id,
    old.supersedes_document_id,old.preparation_input,old.prepared_source_snapshot,
    old.id,old.invoice_kind,old.document_kind) then raise exception 'FROZEN_DOCUMENT_IMMUTABLE'; end if;
  if new.preparation_status is distinct from old.preparation_status and not (
    (old.preparation_status='frozen' and new.preparation_status in ('canonical_validated','superseded'))
    or (old.preparation_status='canonical_validated' and new.preparation_status='superseded')
  ) then raise exception 'PREPARATION_STATE_INVALID'; end if;
  if new.canonical_validated_at is distinct from old.canonical_validated_at and not (
    old.preparation_status='frozen' and new.preparation_status='canonical_validated'
    and old.canonical_validated_at is null and new.canonical_validated_at is not null
  ) then raise exception 'FROZEN_DOCUMENT_IMMUTABLE'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$$;
create trigger zatca_frozen_document_guard before update or delete
 on public.zatca_invoice_documents for each row execute function zatca_private.guard_frozen_document();

-- Public surface is service-role-only. Actor is supplied exclusively by the server
-- after getUser(); DB rechecks profiles. A service credential remains a trusted boundary.
create function zatca_private.read_preparation_context(
 p_invoice_id uuid, p_verified_actor_id uuid, p_include_sources boolean default true
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 perform zatca_private.assert_actor(p_verified_actor_id);
 select jsonb_build_object('document',(select to_jsonb(d) || jsonb_build_object('preparation_version',d.preparation_version::text)
   from public.zatca_invoice_documents d where d.invoice_id=p_invoice_id and d.is_current),
   'sources',case when p_include_sources then zatca_private.source_envelope(p_invoice_id) else null end)
 into result;
 -- Snapshot-only validation branch does not query any commercial source table.
 if p_include_sources and result->'sources'='null'::jsonb then raise exception 'INVOICE_NOT_FOUND'; end if;
 return result;
end;
$$;

create function zatca_private.apply_preparation_transition(
 p_operation text, p_invoice_id uuid, p_document_id uuid,
 p_expected_preparation_version bigint, p_verified_actor_id uuid,
 p_expected_source_snapshot jsonb default null, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare
 d public.zatca_invoice_documents%rowtype;
 next_d public.zatca_invoice_documents%rowtype;
 sources jsonb;
 snap jsonb;
 at_time timestamptz;
 at_text text;
 initial boolean;
 allowed text[];
begin
 if p_operation is null or p_operation not in ('prepare','freeze','canonical_validate','create_revision') then raise exception 'RPC_OPERATION_INVALID'; end if;
 if p_invoice_id is null or p_document_id is null or p_expected_preparation_version is null or p_expected_preparation_version<0
   or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'CANONICAL_INVALID'; end if;
 perform zatca_private.assert_actor(p_verified_actor_id);
 -- Global order for prepare/freeze only: settings -> seller -> invoice -> lines ->
 -- invoice payments -> request payments -> per-invoice mutex -> current document.
 -- SHARE blocks INSERT/UPDATE/DELETE, including new child rows and active switches.
 if p_operation in ('prepare','freeze') then
  lock table public.business_finance_settings in share mode;
  lock table public.business_tax_profiles in share mode;
  lock table public.invoices in share mode;
  lock table public.invoice_line_items in share mode;
  lock table public.invoice_payments in share mode;
  lock table public.service_request_payments in share mode;
 end if;
 -- Also serializes the first prepare when no current row exists. Hash collisions only
 -- serialize unrelated invoices; correctness never depends on collision freedom.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_invoice_id::text, 49204));
 -- Prevent concurrent actor-role revocation while persisting the operation.
 perform 1 from public.profiles where id=p_verified_actor_id and role in ('admin_manager','super_admin') for share;
 if not found then raise exception 'FORBIDDEN'; end if;
 select * into d from public.zatca_invoice_documents where invoice_id=p_invoice_id and is_current for update;
 initial := not found;
 if initial then
  if p_operation<>'prepare' or exists(select 1 from public.zatca_invoice_documents where invoice_id=p_invoice_id) then raise exception 'DOCUMENT_NOT_CURRENT'; end if;
  if p_expected_preparation_version<>0 then raise exception 'DOCUMENT_VERSION_CONFLICT'; end if;
 else
  if d.preparation_version<>p_expected_preparation_version then raise exception 'DOCUMENT_VERSION_CONFLICT'; end if;
  if d.id<>p_document_id then raise exception 'DOCUMENT_NOT_CURRENT'; end if;
 end if;
 allowed := case p_operation
  when 'prepare' then array['input','snapshot','snapshotVersion','rulesVersion','sourceFingerprint']
  when 'freeze' then array['sourceFingerprint']
  when 'canonical_validate' then array['valid','snapshot','snapshotVersion','rulesVersion','sourceFingerprint']
  else array[]::text[] end;
 if exists(select 1 from jsonb_object_keys(p_payload) k where not (k=any(allowed))) then raise exception 'CANONICAL_INVALID'; end if;
 at_time:=date_trunc('milliseconds',clock_timestamp());
 at_text:=zatca_private.utc_text(at_time);
 if p_operation='prepare' then
  if not initial and (d.snapshot_frozen_at is not null or d.preparation_status not in ('draft','prepared')) then raise exception 'REVISION_REQUIRED'; end if;
  sources:=zatca_private.source_envelope(p_invoice_id);
  if sources is null then raise exception 'INVOICE_NOT_FOUND'; end if;
  if p_expected_source_snapshot is null or sources is distinct from p_expected_source_snapshot then raise exception 'SOURCE_CHANGED'; end if;
  if sources#>>'{invoice,status}'<>'draft' then raise exception 'SOURCE_INVOICE_NOT_DRAFT'; end if;
  snap:=p_payload->'snapshot';
  if jsonb_typeof(snap) is distinct from 'object' or jsonb_typeof(p_payload->'input') is distinct from 'object'
    or p_payload->>'snapshotVersion' is distinct from '1'
    or p_payload->>'rulesVersion' is distinct from 'zatca-ksa-v1-phase2'
    or coalesce(p_payload->>'sourceFingerprint','') !~ '^[0-9a-f]{64}$'
    or snap#>>'{metadata,documentId}' is distinct from p_document_id::text
    or snap#>>'{metadata,sourceInvoiceId}' is distinct from p_invoice_id::text
    or snap#>>'{invoice,id}' is distinct from p_invoice_id::text
    or snap#>>'{metadata,rulesVersion}' is distinct from p_payload->>'rulesVersion'
    or snap#>>'{metadata,modelVersion}' is distinct from '1'
    or snap#>>'{metadata,calculationPolicy}' is distinct from 'gross-inclusive-15-v1'
    or snap#>>'{invoice,kind}' is distinct from 'invoice'
    or coalesce(snap#>>'{invoice,scheme}','') not in ('standard','simplified')
    or (snap#>'{invoice,issueAt}') is distinct from 'null'::jsonb
    or (snap#>'{invoice,issueDate}') is distinct from 'null'::jsonb
    or (snap#>'{invoice,issueTime}') is distinct from 'null'::jsonb then raise exception 'CANONICAL_INVALID'; end if;
  if initial then
   if snap#>>'{metadata,revisionNo}' is distinct from '1' then raise exception 'CANONICAL_INVALID'; end if;
   insert into public.zatca_invoice_documents(id,invoice_id,invoice_kind,invoice_uuid)
    values(p_document_id,p_invoice_id,snap#>>'{invoice,scheme}',(snap#>>'{invoice,uuid}')::uuid) returning * into d;
  else
   if snap#>>'{metadata,revisionNo}' is distinct from d.revision_no::text
     or snap#>>'{invoice,uuid}' is distinct from d.invoice_uuid::text then raise exception 'CANONICAL_INVALID'; end if;
  end if;
  update public.zatca_invoice_documents set
   preparation_input=p_payload->'input',prepared_source_snapshot=sources,canonical_snapshot=snap,
   snapshot_version=1,rules_version=p_payload->>'rulesVersion',source_fingerprint=p_payload->>'sourceFingerprint',
   invoice_kind=snap#>>'{invoice,scheme}',preparation_status='prepared',prepared_at=at_time,
   issue_at=null,snapshot_frozen_at=null,canonical_validated_at=null,
   preparation_version=d.preparation_version+1,updated_at=at_time where id=d.id returning * into next_d;
 elsif p_operation='freeze' then
  if d.preparation_status<>'prepared' or d.snapshot_frozen_at is not null then raise exception 'PREPARATION_STATE_INVALID'; end if;
  sources:=zatca_private.source_envelope(p_invoice_id);
  if sources is distinct from d.prepared_source_snapshot or p_expected_source_snapshot is distinct from d.prepared_source_snapshot then raise exception 'SOURCE_CHANGED'; end if;
  if p_payload->>'sourceFingerprint' is distinct from d.source_fingerprint then raise exception 'SOURCE_CHANGED'; end if;
  snap:=jsonb_set(d.canonical_snapshot,'{invoice,issueAt}',to_jsonb(at_text));
  snap:=jsonb_set(snap,'{invoice,issueDate}',to_jsonb(substr(at_text,1,10)));
  snap:=jsonb_set(snap,'{invoice,issueTime}',to_jsonb(substr(at_text,12,8)||'Z'));
  update public.zatca_invoice_documents set canonical_snapshot=snap,issue_at=at_time,
   snapshot_frozen_at=at_time,preparation_status='frozen',preparation_version=d.preparation_version+1,
   updated_at=at_time where id=d.id returning * into next_d;
 elsif p_operation='canonical_validate' then
  if d.preparation_status<>'frozen' then raise exception 'PREPARATION_STATE_INVALID'; end if;
  if p_payload->'valid' is distinct from 'true'::jsonb
   or p_payload->'snapshot' is distinct from d.canonical_snapshot
   or p_payload->>'snapshotVersion' is distinct from d.snapshot_version::text
   or p_payload->>'rulesVersion' is distinct from d.rules_version
   or p_payload->>'sourceFingerprint' is distinct from d.source_fingerprint then raise exception 'CANONICAL_INVALID'; end if;
  update public.zatca_invoice_documents set canonical_validated_at=at_time,
   preparation_status='canonical_validated',preparation_version=d.preparation_version+1,
   updated_at=at_time where id=d.id returning * into next_d;
 else
  if d.snapshot_frozen_at is null or d.preparation_status not in ('frozen','canonical_validated') then raise exception 'REVISION_REQUIRED'; end if;
  update public.zatca_invoice_documents set is_current=false,preparation_status='superseded',
   preparation_version=d.preparation_version+1,updated_at=at_time where id=d.id;
  -- Explicit allowlist. All artifacts, snapshots, timestamps and results remain defaults/null.
  insert into public.zatca_invoice_documents(invoice_id,invoice_kind,document_kind,revision_no,
   supersedes_document_id,is_current,preparation_status,preparation_version)
   values(d.invoice_id,d.invoice_kind,'invoice',d.revision_no+1,d.id,true,'draft',0) returning * into next_d;
 end if;
 return jsonb_build_object('document',to_jsonb(next_d) || jsonb_build_object('preparation_version',next_d.preparation_version::text));
exception when lock_not_available or deadlock_detected then
 -- Exception subtransaction rolls back every write before producing the stable failure.
 raise exception 'CONCURRENCY_RETRY_REQUIRED';
end;
$$;

-- Thin public invoker wrappers; privileged bodies remain in an unexposed schema.
create function public.zatca_read_preparation_context(
 p_invoice_id uuid, p_verified_actor_id uuid, p_include_sources boolean default true
) returns jsonb language sql security invoker set search_path = '' as $$
 select zatca_private.read_preparation_context(p_invoice_id,p_verified_actor_id,p_include_sources);
$$;
create function public.zatca_apply_preparation_transition(
 p_operation text, p_invoice_id uuid, p_document_id uuid,
 p_expected_preparation_version bigint, p_verified_actor_id uuid,
 p_expected_source_snapshot jsonb default null, p_payload jsonb default '{}'::jsonb
) returns jsonb language sql security invoker set search_path = '' as $$
 select zatca_private.apply_preparation_transition(p_operation,p_invoice_id,p_document_id,
  p_expected_preparation_version,p_verified_actor_id,p_expected_source_snapshot,p_payload);
$$;

-- Explicitly revoke default PUBLIC execution; internal helpers are not browser APIs.
revoke all on all functions in schema zatca_private from public, anon, authenticated;
grant execute on function zatca_private.read_preparation_context(uuid,uuid,boolean) to service_role;
grant execute on function zatca_private.apply_preparation_transition(text,uuid,uuid,bigint,uuid,jsonb,jsonb) to service_role;
revoke all on function public.zatca_read_preparation_context(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.zatca_apply_preparation_transition(text,uuid,uuid,bigint,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.zatca_read_preparation_context(uuid,uuid,boolean) to service_role;
grant execute on function public.zatca_apply_preparation_transition(text,uuid,uuid,bigint,uuid,jsonb,jsonb) to service_role;
-- No public/helper EXECUTE grant and no browser mutation policy. Functions have empty
-- search_path and fully qualified relations. EGS/events schema and finance gate unchanged.
comment on function public.zatca_apply_preparation_transition(text,uuid,uuid,bigint,uuid,jsonb,jsonb) is
 'TEST v1 preparation only. Trusted server service-role caller; verified actor role rechecked. JSONB source equality, never JSON serializer/hash equivalence.';
commit;
