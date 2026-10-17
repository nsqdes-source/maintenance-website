# MUEEN PAYMENT SYSTEM — ARCHITECTURE & READINESS

Status: Phase 9 P9.6 final documentation baseline.
Branch: `codex/payment-system-foundation`.
This document is a readiness record, not authorization to deploy to Production or enable payment flags.

## 1. Domain model

The payment domain distinguishes the following concepts and does not collapse them into one generic "paid" state:

- authoritative charge / payable obligation
- payment attempt
- confirmed receipt
- technician cash custody
- reconciliation reservation
- successful refund
- voided internal receipt
- invoice transfer alias
- settlement

The authoritative per-request financial state is exposed through:
`private.payment_financial_state(service_request_id)`.

Key derived concepts:

- `gross_receipts`: active confirmed canonical receipts before successful refunds
- `succeeded_refunds`: refunds that actually completed successfully
- `net_receipts = gross_receipts - succeeded_refunds`
- `technician_cash_custody`: cash collected by technicians but not yet settled to the institution
- `reserved_amount`: active gateway/reconciliation/noncash reservations
- `remaining_contractual`: contractual amount still unpaid after confirmed net receipts and custody
- `excess_refund_liability`: money that must be returned after a downward obligation change
- `payable_cap` / `payable_now`: current write-side collection/payment limits

## 2. Canonical receipt rule

A service-request receipt may later be transferred to an invoice.

The transfer creates an invoice-payment alias for invoice accounting, but the original service-request receipt remains the canonical payment origin.

Canonical gross reporting counts:

`active invoice_payments`
+
`active service_request_payments where transferred_invoice_payment_id IS NULL`

This prevents the transferred request receipt and its derived invoice alias from being counted twice.

Refunds against a transferred payment continue to use the original request-payment origin. The derived invoice alias is not a second refund origin.

## 3. Payment-attempt lifecycle

Provider-neutral attempt lifecycle:

`created -> pending -> requires_reconciliation -> succeeded`

Alternative terminal outcomes:

`failed`
`cancelled`

Rules:

- the browser does not declare a payment succeeded;
- provider success must be verified and normalized server-side;
- amount, currency, provider transaction identity, request identity, and provider/environment must match;
- mismatches fail closed into reconciliation;
- only trusted posting creates a confirmed receipt;
- posting is idempotent and must not create a second receipt on retry.

## 4. Provider event boundary

Provider events are stored in:
`private.payment_provider_events`.

Trusted server-side gateway RPCs are service-role only.

Application boundary:
- `lib/payments/provider-adapter.ts`
- `lib/payments/webhook-processor.ts`
- `lib/payments/gateway-server.ts`

No real provider SDK, provider secret, live API call, or production webhook route is implemented yet.

That work remains Phase 7.

## 5. Technician collection lifecycle

Technician collection states are kept separate from confirmed institutional receipts.

Cash:

`technician records cash -> pending_settlement -> finance settlement -> confirmed receipt`

Non-cash:

`technician records -> pending_verification -> finance verifies -> posting -> confirmed receipt`

The technician write RPC now enforces:

- authenticated technician
- active technician record
- accepted assignment
- `payment_domain_enabled = true`
- supported payment policy
- no financial review requirement
- no reconciliation requirement
- valid amount/method/time
- `payable_cap` available
- `payable_now` available and positive
- amount <= `payable_cap`
- amount <= `payable_now`
- request-row lock for same-request concurrency serialization
- explicit idempotency behavior

A completed request finalizes its operational assignments. A technician must not be allowed to create a new collection on a closed/completed request merely to satisfy a financial test.

## 6. Refund lifecycle

Refund states:

`requested -> approved -> pending -> succeeded`

Other terminal paths:

`requested -> rejected`
`requested/approved -> cancelled`
`pending -> failed`

Accounting rules:

- `requested` is a proposal and does not reserve refundable balance;
- `approved` and `pending` reserve refundable balance;
- only `succeeded` reduces `net_receipts`;
- failed/rejected/cancelled refunds do not reduce confirmed money;
- successful refund leaves the original payment untouched and records a separate refund;
- over-refund beyond remaining refundable balance is rejected;
- provider-backed refunds are processed through the trusted server boundary.

## 7. Void semantics

Void is not refund.

A void marks an internal receipt inactive.

For provider-backed receipts:
- provider/payment-attempt history remains preserved;
- the internal confirmed receipt is voided;
- active gross/net receipt accounting is reduced accordingly.

P9.5 verified that a voided provider-backed receipt does not rewrite the external attempt from `succeeded`.

## 8. Finance reporting model

Canonical finance reporting RPC:
`public.finance_get_canonical_report(p_from date,p_to date)`

Period metrics:
- gross confirmed receipts
- succeeded refunds
- net receipts
- expenses
- net cash flow
- issued invoice total
- issued invoice count

Current-position metrics:
- gross receipts
- succeeded refunds
- net receipts
- technician cash custody
- reserved/reconciliation amount
- contractual outstanding
- excess refund liability
- review-required request count
- reconciliation-required request count

Timestamp-based period filtering uses `Asia/Riyadh`.

`/admin/finance/payments` remains the confirmed collections ledger and must not be repurposed as a payment-attempt operations screen.

## 9. Tax / VAT boundary

VAT-registered invoice issuance currently fails closed with:

`tax_invoicing_integration_required`

This is intentional.

The existing application must not issue VAT invoices through the legacy path before the dedicated tax/ZATCA integration is completed and authorized.

P9.4 regression confirmed:
- subtotal 100 SAR
- VAT 15 SAR
- total 115 SAR
- issue attempt blocked
- invoice remained draft

## 10. Access-control model

Payment/refund/technician-operation RPCs:
- anon: denied
- authenticated: allowed only at intended RPC entry points
- role authorization enforced inside SECURITY DEFINER functions
- service_role: denied on user-facing finance/technician operations

Gateway/provider RPCs:
- anon: denied
- authenticated: denied
- service_role: allowed

Sensitive payment-domain tables use deny-by-default direct-access posture. Authenticated users do not receive direct INSERT/UPDATE/DELETE privileges on payment attempts, refunds, or technician collections.

## 11. Verified regressions

Completed checkpoints established:

- payment policy and financial-state foundation
- payment attempt/refund/technician collection tables
- provenance and transfer invariants
- finance closeout
- privilege hardening
- admin payment settings
- customer payment-choice dark launch
- technician/finance read contexts
- provider-neutral gateway foundation
- provider-neutral refund processing
- refund operations UI
- canonical finance reporting
- technician payable write guard
- security/tax/privilege regression
- full E2E / no-duplication regression

P9.5 final aggregate evidence:

Gateway scenario:
- gross receipts = 100
- successful refunds = 20
- net receipts = 80
- remaining contractual = 20
- canonical request receipt count = 1
- invoice alias count = 1

Technician scenario:
- confirmed gross/net = 20
- custody after settlement = 0
- technician collection status = settled
- confirmed request receipt count = 1

Canonical aggregate report:
- gross = 120
- refunds = 20
- net = 100
- outstanding = 20

Supplemental:
- provider mismatch -> `requires_reconciliation`
- reconciliation created no confirmed receipt
- void preserved provider attempt status `succeeded`
- void removed active receipt money

All test fixtures ended in `ROLLBACK`.

## 12. Current environment safety state

Production Supabase:
`wtmzvznsmitqmjgqwtnu`
No payment-phase writes authorized by this document.

Payment Test:
`wsjmaojgjzxkmxywvcfy`

ZATCA Test:
`xpvwkelctzgidpycflzw`
Out of scope for payment activation.

Repository:
`nsqdes-source/maintenance-website`

Payment branch:
`codex/payment-system-foundation`

Current payment branch baseline at P9.6 preparation:
`5941ea664ad100c7f5db526da835f5ab722b9901`

Feature flags remain persistently disabled/uninitialized in Payment Test after rollback testing.

## 13. Readiness decision

### GO

The provider-neutral payment foundation is technically ready for:
- code review
- continued Preview validation
- Phase 7 real-provider integration work
- controlled sandbox integration
- production rollout planning

The finance/refund/technician accounting model is internally coherent under the tested scenarios.

### NO-GO

Production payment activation is NOT approved yet.

Do not enable:
- `payment_domain_enabled`
- `gateway_enabled`

in Production until the activation checklist is completed.

Reasons for NO-GO:
1. Phase 7 real payment provider integration is intentionally deferred.
2. No live provider credentials or signed webhook route are installed.
3. No provider sandbox certification/UAT has been completed.
4. VAT invoice issuance is intentionally fail-closed pending tax/ZATCA integration.
5. Production database migration identity/history and backup gates must be revalidated immediately before any production write.
6. Production end-to-end payment/refund/technician flows have not been authorized.
7. Merge/main and Production deployment require separate explicit approval.

Final P9.6 readiness classification:

`FOUNDATION_READY = YES`
`PRODUCTION_PAYMENT_ACTIVATION_READY = NO`
