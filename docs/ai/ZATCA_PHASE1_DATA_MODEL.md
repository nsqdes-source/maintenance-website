# ZATCA Phase 1 — Invoice Data Model and State Machine

Status: **design baseline for isolated ZATCA test work**

Repository: `nsqdes-source/maintenance-website`
Branch: `codex/zatca-integration`
Target Test Supabase only: `xpvwkelctzgidpycflzw`
Production/source Supabase `wtmzvznsmitqmjgqwtnu` is out of scope for all writes.

## Purpose

Add an additive ZATCA persistence layer around the existing `invoices` model without changing the existing business workflow or bypassing the current VAT issuance gate.

The existing `finance_set_invoice_status` gate (`tax_invoicing_integration_required`) must remain intact until XML generation, validation, signing/onboarding and ZATCA API submission are implemented and tested.

## Regulatory basis

Implementation is aligned to the current ZATCA developer materials, including:

- Electronic Invoice XML Implementation Standard v1.2 (19 May 2023)
- Security Features Implementation Standards v1.2 (19 May 2023)
- E-Invoicing Detailed Guidelines / Phase 2 integration guidance

Key implications for the design:

- A compliant e-invoice requires a UUID in addition to the human-readable sequential invoice number.
- Invoice sequencing includes an invoice counter value (ICV) and previous invoice hash (PIH) chain.
- Simplified tax invoices require local generation/stamping/QR and must be reported to ZATCA within 24 hours.
- Standard tax invoices are cleared by ZATCA before they are treated as cleared electronic invoices for delivery to the buyer.
- The generated XML, hashes, submission result, warnings/errors and audit trail must be preservable and tamper-evident.

Official references:

- https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/E-Invoice-specifications.aspx
- https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/Security-Requirements.aspx
- https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Pages/default.aspx

## Existing model kept unchanged

The following remain the source of commercial truth:

- `public.invoices`
- `public.invoice_line_items`
- `public.invoice_payments`
- `public.service_request_payments`
- `public.business_finance_settings`

ZATCA-specific technical artifacts are stored separately. This avoids contaminating the existing invoice workflow with integration-only fields and keeps the ZATCA layer replaceable.

## New tables

### `public.zatca_egs_units`

Non-secret metadata for an Electronic Generation Solution unit / onboarding identity.

Stores:

- stable unit id
- label
- environment (`simulation` or `production`)
- serial number / solution identifier metadata
- VAT registration number snapshot
- onboarding state
- last committed ICV
- last committed invoice hash

**No private key, OTP, CSID secret, access token or certificate private material is stored in this table.** Secret material belongs in a server-only secret store and will be designed separately.

### `public.zatca_invoice_documents`

One ZATCA technical document per invoice.

Stores:

- `invoice_id`
- `egs_unit_id`
- invoice kind: `standard` / `simplified`
- document kind: `invoice` / `credit_note` / `debit_note`
- UUID
- ICV
- PIH
- XML hash
- unsigned XML
- signed/cleared XML
- QR payload
- integration status
- clearance/reporting statuses
- ZATCA request/response metadata
- validation warnings/errors
- lifecycle timestamps

The table is intentionally additive. Creating a row does **not** issue the accounting invoice.

### `public.zatca_invoice_events`

Append-only integration audit events, for example:

- `document_prepared`
- `validation_failed`
- `document_signed`
- `clearance_submitted`
- `clearance_accepted`
- `clearance_rejected`
- `reporting_submitted`
- `reporting_accepted`
- `reporting_rejected`
- `retry_scheduled`

Payloads must never contain secrets or private keys.

## State machine

### Shared preparation states

`draft`
→ `prepared`
→ `validated`
→ `signed`

Failure during preparation may move to `failed` and be retried after correction while the commercial invoice remains unissued.

### Standard tax invoice (B2B)

`signed`
→ `pending_clearance`
→ `cleared`

Possible error path:

`pending_clearance`
→ `rejected` / `failed`

The existing `public.invoices.status` must remain `draft` until successful clearance and the future finalize/issue transaction is implemented.

### Simplified tax invoice (B2C)

`signed`
→ `issued_locally`
→ `pending_reporting`
→ `reported`

Possible reporting path:

`pending_reporting`
→ `reporting_failed`
→ retry until `reported`

The reporting response is not modeled as a universal issuance gate. The future implementation must preserve evidence of retries and enforce the 24-hour reporting obligation.

## Sequencing rules

ICV and PIH must not be allocated during ordinary draft editing.

They will be committed only in a transactional finalization step so that:

1. two invoices cannot receive the same ICV for the same EGS unit;
2. the next document receives the exact hash of the previous finalized document;
3. abandoning an editable invoice draft does not silently consume a ZATCA sequence value;
4. concurrent issuance is serialized per EGS unit.

The schema stores `last_icv` and `last_invoice_hash` on `zatca_egs_units`; the allocation/finalization function is deliberately deferred to the cryptographic implementation phase.

## Advance / partial payments

The tested fixture contains a `1.00 SAR` advance payment against a `57.50 SAR` draft invoice.

ZATCA XML standard v1.2 includes advanced-payment specifications. No assumption is made in this migration that an arbitrary service-request payment can simply be deducted from the final invoice XML.

The exact tax-document treatment of advances will be implemented only after mapping the existing `service_request_payments` semantics to the ZATCA advanced-payment business rules and validating the resulting XML.

## Security boundaries

- RLS is enabled on all ZATCA tables.
- Authenticated finance administrators may read integration state for UI/reporting.
- Browser clients receive no direct INSERT/UPDATE/DELETE policy for ZATCA artifacts.
- Mutating ZATCA operations will run server-side only in a later phase.
- No secrets are introduced by this migration.
- No Vercel environment variables are introduced by this migration.

## Explicitly not implemented in Phase 1

- XML generation
- XML validation rules
- canonicalization / hashing
- ECDSA signing
- QR generation
- CSR generation
- compliance CSID / production CSID onboarding
- private-key storage
- ZATCA API calls
- retries/background jobs
- unlocking `finance_set_invoice_status` for VAT invoices
- Production migration/application

## Acceptance criteria for this phase

1. Migration is additive and reversible by dropping only the three new ZATCA tables.
2. Existing invoice/payment/workflow behavior is unchanged.
3. Existing `tax_invoicing_integration_required` gate remains unchanged.
4. No secrets exist in schema defaults, migrations or repository files.
5. Migration is applied only to the isolated Test project after review.
