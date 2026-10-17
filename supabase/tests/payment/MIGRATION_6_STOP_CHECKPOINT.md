# MIGRATION 6 — STOP CHECKPOINT

M6 DDL applied once. The first synthetic test transaction failed during draft seed. M6 remains applied; only test fixtures rolled back. No automatic repair, reapply, or Migration 7.

## Failure

SQLSTATE 42702: column reference `gross_total` is ambiguous.

Function: `private.finance_seed_invoice_from_approved_quote(uuid,uuid)`, function-body line 238; migration file line 291. The new original-request provenance predicate uses an unqualified `gross_total` while the function already declares a variable of that name. Static SQL/PLpgSQL parsing passed but did not detect runtime name resolution.

The smoke reached the original-request draft creation after unpaid/partial/paid and charge-review revision assertions. The complete transaction did not finish; no full suite PASS is claimed. Remaining M6 cases and regressions were stopped.

## Checkpoint

NOT_COMPLETED means not validated as a complete suite after stopping; it is not a fabricated PASS or an assertion that every individual invariant failed.

```json
{
  "MIGRATION_6_APPLIED": "YES",
  "MIGRATION_6_FINAL": "FAIL",
  "MIGRATION_FILE": "supabase/migrations/20261008133511_payment_finance_transfer_and_closeout.sql",
  "MIGRATION_SHA256": "58a034424476a55052dd78868f7643a693a892add0bbfcd8b79166eb19dc3784",
  "APPLIED_SQL_SHA256": "58a034424476a55052dd78868f7643a693a892add0bbfcd8b79166eb19dc3784",
  "PAYMENT_TEST_REF": "wsjmaojgjzxkmxywvcfy",
  "TARGET_VERIFIED": "YES",
  "MIGRATION_HISTORY_VERSION": "20261008134519",
  "INVOICE_FINANCIAL_PROVENANCE": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "PROVENANCE_CONSISTENCY_GUARDS": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "PROVENANCE_INVALIDATION": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "LEGACY_INVOICES_NOT_BACKFILLED": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "AUTHORITATIVE_CHARGE": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "CHARGE_SOURCE_HIERARCHY": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "MATCHING_DRAFT_REQUIRES_PROVENANCE": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "GROSS_RECEIPTS_P": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "SUCCEEDED_REFUNDS_F": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "NET_RECEIPTS_N": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "TECHNICIAN_CUSTODY_H": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "RESERVATIONS_Q": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "CUSTOMER_NET_PAID": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "REMAINING_CONTRACTUAL": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "EXCESS_REFUND_LIABILITY": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "INSTITUTION_OUTSTANDING": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "PAYABLE_CAP": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "PAYABLE_NOW": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "REFUND_50_TO_30_RESOLUTION": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "SAME_ORIGIN_REFUND_PROOF": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "REFUND_RESOLVED_ISSUANCE": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "ORIGINAL_PAYMENT_PRESERVED": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "NO_SYNTHETIC_INVOICE_RECEIPT": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "TECHNICIAN_CASH_SETTLEMENT": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "TECHNICIAN_SETTLEMENT_PROVENANCE": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "H_TO_P_INVARIANT": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "DUPLICATE_SETTLEMENT_PREVENTED": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "NONCASH_TECHNICIAN_FLOW": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "VOIDED_ATTEMPT_RECEIPT_RECONCILIATION": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "CLOSEOUT_BLOCKS_UNRESOLVED_OPERATIONS": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "CHARGE_REVIEW_REVISION_SYNC": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "BASELINE_REGRESSION": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "MIGRATION_1_REGRESSION": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "MIGRATION_2_REGRESSION": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "MIGRATION_3_REGRESSION": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "MIGRATION_4_REGRESSION": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "MIGRATION_5_REGRESSION": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "VAT_GUARD_PRESERVED": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "CARD_REMAINS_LEDGER_ONLY": "NOT_COMPLETED_STOP_ON_FIRST_ERROR",
  "DRAFT_SEED_EXECUTION": "FAIL",
  "TRANSFER_GUARD_PRESERVED": "PASS_READ_ONLY_DEFINITION",
  "LEGACY_FINANCE_REPORTING_COMPATIBILITY": "DEFERRED_TO_APPLICATION_INTEGRATION",
  "LEGACY_COLLECTION_RPC_ACTIVATION_SAFETY": "DEFERRED",
  "ACTIVATION_SAFETY_REASON": "Legacy invoice-only collection balance still requires canonical financial-state integration before activation. Flags remain false; not activation-ready.",
  "PAYMENT_DOMAIN_ENABLED": false,
  "GATEWAY_ENABLED": false,
  "SETTINGS_ROW_COUNT": 0,
  "ROLLED_BACK_FIXTURES": "YES",
  "SYNTHETIC_USERS_REMAINING": 0,
  "SERVICE_REQUESTS_REMAINING": 0,
  "NEW_SECURITY_ADVISOR_ISSUES": "2 WARNINGS \u2014 NEW_FROM_MIGRATION_6 \u2014 NOT APPROVED",
  "NEW_PERFORMANCE_ADVISOR_ISSUES": "2 UNUSED_INDEX INFO; NO NEW MISSING FK INDEX",
  "PRODUCTION_WRITES": 0,
  "ZATCA_WRITES": 0,
  "REAL_CUSTOMER_DATA_USED": "NO",
  "GITHUB_PUSH": "NO",
  "VERCEL_DEPLOYMENT": "NO",
  "MIGRATION_7_APPLIED": "NO",
  "AUTO_REPAIR": "NO",
  "MIGRATION_REAPPLIED": "NO"
}
```

## Exact test error

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"error\":{\"name\":\"HttpException\",\"message\":\"Failed to run sql query: ERROR:  42702: column reference \\\"gross_total\\\" is ambiguous\\nDETAIL:  It could refer to either a PL/pgSQL variable or a table column.\\nQUERY:  quote_record.id IS NULL AND EXISTS(SELECT 1 FROM public.service_request_items WHERE service_request_id=p_request_id AND item_source='customer_request') AND NOT EXISTS(SELECT 1 FROM public.service_request_items WHERE service_request_id=p_request_id AND item_source='customer_request' AND (is_visit_service_snapshot IS NULL OR gross_total::text IN ('NaN','Infinity','-Infinity')))\\nCONTEXT:  PL/pgSQL function private.finance_seed_invoice_from_approved_quote(uuid,uuid) line 238 at IF\\nSQL statement \\\"SELECT private.finance_seed_invoice_from_approved_quote(\\r\\n    result_id,\\r\\n    p_request_id\\r\\n  )\\\"\\nPL/pgSQL function finance_ensure_invoice_draft(uuid) line 111 at PERFORM\\nPL/pgSQL function inline_code_block line 34 at assignment\\n\"}}"
    }
  ],
  "structuredContent": {
    "error_code": "INVALID_ARGUMENT"
  },
  "isError": true
}
```

## Advisor delta

```json
{
  "0": [
    {
      "name": "authenticated_security_definer_function_executable",
      "level": "WARN",
      "metadata": {
        "name": "finance_post_verified_technician_collection",
        "schema": "public",
        "language": "plpgsql",
        "arguments": "p_collection_id uuid, p_idempotency_key text",
        "security_definer": true
      },
      "detail": "Function `public.finance_post_verified_technician_collection(p_collection_id uuid, p_idempotency_key text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/finance_post_verified_technician_collection`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.",
      "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable"
    },
    {
      "name": "authenticated_security_definer_function_executable",
      "level": "WARN",
      "metadata": {
        "name": "finance_settle_technician_cash_collection",
        "schema": "public",
        "language": "plpgsql",
        "arguments": "p_collection_id uuid, p_idempotency_key text",
        "security_definer": true
      },
      "detail": "Function `public.finance_settle_technician_cash_collection(p_collection_id uuid, p_idempotency_key text)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/finance_settle_technician_cash_collection`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.",
      "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable"
    }
  ],
  "1": [
    {
      "name": "unused_index",
      "level": "INFO",
      "metadata": {
        "name": "invoices",
        "type": "table",
        "schema": "public"
      },
      "detail": "Index \\`invoices_financial_basis_quote_idx\\` on table \\`public.invoices\\` has not been used",
      "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index"
    },
    {
      "name": "unused_index",
      "level": "INFO",
      "metadata": {
        "name": "invoices",
        "type": "table",
        "schema": "public"
      },
      "detail": "Index \\`invoices_financial_basis_review_idx\\` on table \\`public.invoices\\` has not been used",
      "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index"
    }
  ]
}
```

Both new public RPCs are SECURITY DEFINER with an empty search_path. Read-only ACL verification: authenticated EXECUTE YES, anon NO, PUBLIC NO. Their bodies use payment_foundation_require_finance. Role-negative and settlement behavioral tests have not completed. The warnings remain pending review, not self-approved.
