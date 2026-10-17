# M6 identity and qualification repair — STOP

Repository-only rename completed byte-for-byte. M6 and its additive repair each have exactly one database history row, with matching SQL hashes. M1–M5 files were not changed; their pre-existing repository/history timestamp differences are outside this repair. Full-repository migration alignment is not claimed.

The additive repair changed only the original-request NOT EXISTS predicate's table alias and column qualifications. Current function definition SHA256 matches the proposed definition: b8db16606a3b4654be0aeb149608b2191d7442ae3a3d31170d10bd0a1a7bd83f.

The complete existing core script passed after correcting synthetic warranty fixture values. No finance_update_invoice_draft definition was changed. The required extended completed-request/draft cash settlement path failed and all its fixtures rolled back.

## New blocking failure

P0001 collection_receipt_mismatch, private.payment_guard_receipt_provenance() line 24.

Call chain: finance_settle_technician_cash_collection -> payment_post_technician_collection -> finance_transfer_request_payments_to_invoice -> receipt provenance guard.

Transfer supplies NULL idempotency_key for technician collection aliases. The M6 guard requires a non-NULL key before reaching the transfer-alias validation branch. The original qualification-only repair does not address this. No additional SQL repair was performed.

## Status semantics

PASS_CORE_TEST reflects completed assertions in the core script, not an all-scenarios certification. NOT_COMPLETED means stopped/unvalidated; no full regressions or complete role-negative suite is claimed.

```json
{
  "INVOICE_FINANCIAL_PROVENANCE": "NOT_COMPLETED",
  "PROVENANCE_CONSISTENCY_GUARDS": "NOT_COMPLETED",
  "PROVENANCE_INVALIDATION": "PASS_CORE_TEST",
  "LEGACY_INVOICES_NOT_BACKFILLED": "NOT_COMPLETED",
  "AUTHORITATIVE_CHARGE": "NOT_COMPLETED",
  "CHARGE_SOURCE_HIERARCHY": "NOT_COMPLETED",
  "MATCHING_DRAFT_REQUIRES_PROVENANCE": "NOT_COMPLETED",
  "GROSS_RECEIPTS_P": "NOT_COMPLETED",
  "SUCCEEDED_REFUNDS_F": "NOT_COMPLETED",
  "NET_RECEIPTS_N": "NOT_COMPLETED",
  "TECHNICIAN_CUSTODY_H": "NOT_COMPLETED",
  "RESERVATIONS_Q": "NOT_COMPLETED",
  "CUSTOMER_NET_PAID": "NOT_COMPLETED",
  "REMAINING_CONTRACTUAL": "NOT_COMPLETED",
  "EXCESS_REFUND_LIABILITY": "NOT_COMPLETED",
  "INSTITUTION_OUTSTANDING": "NOT_COMPLETED",
  "PAYABLE_CAP": "NOT_COMPLETED",
  "PAYABLE_NOW": "NOT_COMPLETED",
  "REFUND_50_TO_30_RESOLUTION": "PASS_CORE_TEST",
  "SAME_ORIGIN_REFUND_PROOF": "NOT_COMPLETED",
  "REFUND_RESOLVED_ISSUANCE": "PASS_CORE_TEST",
  "ORIGINAL_PAYMENT_PRESERVED": "PASS_CORE_TEST",
  "NO_SYNTHETIC_INVOICE_RECEIPT": "PASS_CORE_TEST",
  "TRANSFER_GUARD_PRESERVED": "NOT_COMPLETED",
  "TECHNICIAN_CASH_SETTLEMENT": "FAIL_COMPLETED_DRAFT_TRANSFER",
  "TECHNICIAN_SETTLEMENT_PROVENANCE": "NOT_COMPLETED",
  "H_TO_P_INVARIANT": "PASS_PREINVOICE_CORE_TEST",
  "DUPLICATE_SETTLEMENT_PREVENTED": "PASS_PREINVOICE_CORE_TEST",
  "NONCASH_TECHNICIAN_FLOW": "PASS_PREINVOICE_CORE_TEST",
  "VOIDED_ATTEMPT_RECEIPT_RECONCILIATION": "NOT_COMPLETED",
  "CLOSEOUT_BLOCKS_UNRESOLVED_OPERATIONS": "NOT_COMPLETED",
  "CHARGE_REVIEW_REVISION_SYNC": "PASS_CORE_TEST",
  "BASELINE_REGRESSION": "NOT_COMPLETED",
  "MIGRATION_1_REGRESSION": "NOT_COMPLETED",
  "MIGRATION_2_REGRESSION": "NOT_COMPLETED",
  "MIGRATION_3_REGRESSION": "NOT_COMPLETED",
  "MIGRATION_4_REGRESSION": "NOT_COMPLETED",
  "MIGRATION_5_REGRESSION": "NOT_COMPLETED",
  "VAT_GUARD_PRESERVED": "NOT_COMPLETED",
  "CARD_REMAINS_LEDGER_ONLY": "NOT_COMPLETED",
  "MIGRATION_6_APPLIED": "YES",
  "MIGRATION_6_IDENTITY_REPAIRED": "YES",
  "MIGRATION_6_REPAIR_APPLIED": "YES",
  "MIGRATION_6_FINAL": "FAIL",
  "M6_ORIGINAL_REPOSITORY_PATH": "supabase/migrations/20261008134519_payment_finance_transfer_and_closeout.sql",
  "M6_DATABASE_VERSION": "20261008134519",
  "M6_ORIGINAL_SHA256": "58a034424476a55052dd78868f7643a693a892add0bbfcd8b79166eb19dc3784",
  "M6_REPAIR_FILE": "supabase/migrations/20261008153405_payment_finance_transfer_and_closeout_fix.sql",
  "M6_REPAIR_SHA256": "fdb0ef0fad8a399749c99f1befc1ac0dbfbc0c1f3a8c71c0d89d37d9443c0dd4",
  "M6_REPAIR_DATABASE_VERSION": "20261008153405",
  "M6_HISTORY_ALIGNMENT": "PASS_M6_AND_REPAIR_ONLY",
  "M6_FILE_CONTENT_CHANGED": "NO",
  "ORIGINAL_M6_REAPPLIED": "NO",
  "MIGRATION_HISTORY_MANUALLY_MODIFIED": "NO",
  "FUNCTION_SEMANTIC_DIFF": "QUALIFICATION_ONLY",
  "FIX_SCOPE_ONLY": "YES",
  "LEGACY_FINANCE_REPORTING_COMPATIBILITY": "DEFERRED_TO_APPLICATION_INTEGRATION",
  "LEGACY_COLLECTION_RPC_ACTIVATION_SAFETY": "DEFERRED",
  "SECURITY_WARNINGS_CLASSIFICATION": "2 EXPECTED WARNINGS \u2014 PENDING FINAL BEHAVIORAL CONFIRMATION",
  "PAYMENT_DOMAIN_ENABLED": false,
  "GATEWAY_ENABLED": false,
  "PRODUCTION_WRITES": 0,
  "ZATCA_WRITES": 0,
  "GITHUB_PUSH": "NO",
  "VERCEL_DEPLOYMENT": "NO",
  "MIGRATION_7_APPLIED": "NO",
  "SETTINGS_ROWS": 0,
  "SYNTHETIC_USERS_REMAINING": 0,
  "SERVICE_REQUESTS_REMAINING": 0
}
```

Security and performance advisors were run. Two new security warnings relative to M5 remain the known settlement/posting RPC warnings; no additional security warning from the repair. No new missing FK index. Both public RPCs have authenticated EXECUTE only, anon/PUBLIC denied, SECURITY DEFINER, empty search_path. Full behavioral security confirmation remains pending.
