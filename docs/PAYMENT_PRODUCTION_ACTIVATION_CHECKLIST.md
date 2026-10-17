# MUEEN PAYMENT SYSTEM — PRODUCTION ACTIVATION CHECKLIST

This checklist must be completed before enabling payment functionality in Production.

It does not itself authorize Production changes.

## A. Change-control gates

- [ ] Explicit owner authorization for Production payment rollout.
- [ ] Exact Git commit approved.
- [ ] Exact Supabase Production ref confirmed: `wtmzvznsmitqmjgqwtnu`.
- [ ] Exact Vercel project/team confirmed: `maintenance-website` / `nsq2`.
- [ ] No target resolves to `maintenance-platform` or any other project.
- [ ] Current Production database backup created and restore path verified.
- [ ] Production migration history compared with repository migrations.
- [ ] Migration dry-run reviewed; no repair/reset/rewrite of historical migrations.
- [ ] Rollback/containment plan documented.

## B. Phase 7 real-provider integration

- [ ] Payment provider selected and commercial/KYC onboarding complete.
- [ ] Sandbox merchant account available.
- [ ] Server-only provider credentials configured.
- [ ] No provider secret exposed through `NEXT_PUBLIC_*`.
- [ ] Real provider adapter implements signature verification.
- [ ] Raw webhook body preserved for signature verification.
- [ ] Webhook route has payload-size protection.
- [ ] Provider event ID and transaction ID idempotency verified.
- [ ] Provider amount/currency mismatch tested.
- [ ] Duplicate webhook tested.
- [ ] Out-of-order webhook tested.
- [ ] Provider timeout/retry behavior tested.
- [ ] Customer checkout/session creation implemented.
- [ ] Browser redirect/callback does not declare success by itself.
- [ ] Provider refund API implemented for provider-backed refunds.
- [ ] Refund webhook/status handling tested.
- [ ] Provider sandbox UAT signed off.

## C. Tax / ZATCA

- [ ] Decide exact VAT/ZATCA production integration scope.
- [ ] Complete isolated ZATCA-test work before Production.
- [ ] Validate legal seller identity and tax number.
- [ ] Validate invoice numbering/immutability requirements.
- [ ] Validate VAT rounding/totals.
- [ ] Validate QR / clearance / reporting behavior as applicable.
- [ ] Remove `tax_invoicing_integration_required` fail-closed guard only through an approved migration/change after tax integration passes.
- [ ] Regression test non-VAT and VAT invoice paths.

## D. Finance and accounting

- [ ] Confirm canonical reporting results against production-like fixtures.
- [ ] Confirm `/admin/finance/payments` remains confirmed collections ledger.
- [ ] Confirm payment-attempt operations remain separate from confirmed collections.
- [ ] Confirm successful refunds reduce net receipts exactly once.
- [ ] Confirm void and refund remain separate operations.
- [ ] Confirm transferred request-payment alias does not double count.
- [ ] Confirm technician custody does not count as institutional receipt before settlement.
- [ ] Confirm finance settlement/posting idempotency.
- [ ] Confirm expense and net-cash-flow reporting.

## E. Technician collections

- [ ] Re-run P9.3 payable guard regression on deployment candidate.
- [ ] Confirm technician must have active accepted assignment.
- [ ] Confirm completed/closed requests cannot receive new technician collections.
- [ ] Confirm `payment_domain_enabled=false` blocks technician writes.
- [ ] Confirm over-collection above `payable_now` is rejected.
- [ ] Confirm same idempotency key retry returns the same result.
- [ ] Confirm conflicting reuse of idempotency key is rejected.
- [ ] Confirm cash settlement and non-cash verification/posting flows.

## F. Security

- [ ] Re-run P9.4 ACL matrix against deployment candidate.
- [ ] anon denied from finance/payment/technician private operations.
- [ ] authenticated users cannot directly mutate payment-domain tables.
- [ ] finance role cannot call technician collection write.
- [ ] technician role cannot call finance reporting/decision functions.
- [ ] gateway RPCs remain service-role only.
- [ ] provider credentials exist only server-side.
- [ ] webhook signature failures are rejected.
- [ ] webhook payload logging excludes secrets/payment credentials.
- [ ] Supabase Security Advisor reviewed for new regressions.
- [ ] Leaked Password Protection decision handled separately at Auth/account level.

## G. Observability and operations

- [ ] Payment-attempt status visible to authorized finance users.
- [ ] Reconciliation queue operational.
- [ ] Refund operations page operational.
- [ ] Audit events retained for sensitive transitions.
- [ ] Provider event correlation searchable by safe identifiers.
- [ ] Alert/operational process exists for stuck `pending` attempts.
- [ ] Alert/operational process exists for `requires_reconciliation`.
- [ ] Support procedure exists for duplicate customer reports.
- [ ] Support procedure exists for refund disputes.

## H. Preview / staging acceptance

- [ ] Desktop finance QA PASS.
- [ ] 390px finance QA PASS.
- [ ] 320px finance QA PASS.
- [ ] Customer payment UI tested end-to-end in sandbox.
- [ ] Technician collection UI tested end-to-end.
- [ ] Finance payment operations tested.
- [ ] Refund review/decision tested.
- [ ] Refund provider processing tested.
- [ ] Reports reconcile with fixture expectations.
- [ ] No horizontal overflow / critical clipping.
- [ ] No accidental payment actions when feature flags are disabled.

## I. Activation sequence

Do not enable both flags at once without staged verification.

Recommended sequence:

1. Deploy code/migrations with both flags disabled.
2. Run read-only health/ACL checks.
3. Run controlled finance/admin smoke test.
4. Enable `payment_domain_enabled` only after confirming all write guards.
5. Re-test technician/internal payment flows if they are intended to be active.
6. Keep `gateway_enabled=false` until provider webhook/checkout sandbox UAT passes.
7. Enable `gateway_enabled` only after provider-specific sign-off.
8. Execute a minimal-value controlled payment in Production only with explicit authorization.
9. Confirm canonical receipt, provider event, reporting, and no duplication.
10. Confirm refund path with a separately authorized controlled transaction.
11. Monitor before widening availability.

## J. Stop conditions

Immediately stop rollout if any of the following occurs:

- wrong repository/project/environment identity
- Production migration mismatch not understood
- backup unavailable
- amount/currency mismatch
- duplicate confirmed receipt
- duplicate refund
- unexpected direct-table write capability
- webhook signature verification uncertainty
- provider event cannot be correlated safely
- reconciliation unexpectedly posts money
- finance report double counts transferred aliases
- VAT invoice can issue before tax integration is approved
- feature flags differ from the approved rollout state

## Final decision gate

Current decision:

`FOUNDATION_READY = YES`

`PHASE_7_PROVIDER_INTEGRATION_COMPLETE = NO`

`TAX_ZATCA_PRODUCTION_READY = NO`

`PRODUCTION_PAYMENT_ACTIVATION_READY = NO`

Activation remains NO-GO until all mandatory items above are complete and a separate explicit Production authorization is given.
