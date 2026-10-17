CREATE FUNCTION public.finance_get_canonical_report(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path='' AS $$
DECLARE
  v_currency text;
  v_currencies text[];
  v_period_gross numeric:=0;
  v_period_refunds numeric:=0;
  v_period_expenses numeric:=0;
  v_period_issued_total numeric:=0;
  v_period_issued_count bigint:=0;
  v_current_gross numeric:=0;
  v_current_refunds numeric:=0;
  v_current_custody numeric:=0;
  v_current_reserved numeric:=0;
  v_current_remaining numeric:=0;
  v_current_excess numeric:=0;
  v_current_review_count bigint:=0;
  v_current_reconcile_count bigint:=0;
  v_position_request_count bigint:=0;
  v_request_id uuid;
  v_state jsonb;
  v_state_currency text;
BEGIN
  PERFORM private.payment_foundation_require_finance();

  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to THEN
    RAISE EXCEPTION 'invalid_report_range';
  END IF;

  SELECT array_agg(DISTINCT c ORDER BY c)
  INTO v_currencies
  FROM (
    SELECT currency AS c FROM public.invoices WHERE status IN ('draft','issued')
    UNION ALL
    SELECT currency FROM public.payment_refunds WHERE status IN ('approved','pending','succeeded')
    UNION ALL
    SELECT currency FROM public.technician_collections WHERE status IN ('pending_settlement','pending_verification','verified','settled')
    UNION ALL
    SELECT coalesce(provider_confirmed_currency,currency) FROM public.payment_attempts WHERE status IN ('created','pending','requires_reconciliation','succeeded')
    UNION ALL
    SELECT currency FROM public.business_finance_settings WHERE id=true
  ) currencies
  WHERE c IS NOT NULL;

  IF cardinality(v_currencies)>1 THEN
    RAISE EXCEPTION 'financial_currency_mismatch';
  END IF;

  v_currency:=v_currencies[1];

  WITH canonical_receipts AS (
    SELECT ip.amount,ip.paid_at FROM public.invoice_payments ip WHERE ip.voided_at IS NULL
    UNION ALL
    SELECT rp.amount,rp.paid_at FROM public.service_request_payments rp
    WHERE rp.voided_at IS NULL AND rp.transferred_invoice_payment_id IS NULL
  )
  SELECT coalesce(sum(amount),0) INTO v_period_gross
  FROM canonical_receipts
  WHERE (p_from IS NULL OR (paid_at AT TIME ZONE 'Asia/Riyadh')::date>=p_from)
    AND (p_to IS NULL OR (paid_at AT TIME ZONE 'Asia/Riyadh')::date<=p_to);

  SELECT coalesce(sum(amount),0) INTO v_period_refunds
  FROM public.payment_refunds
  WHERE status='succeeded' AND completed_at IS NOT NULL
    AND (p_from IS NULL OR (completed_at AT TIME ZONE 'Asia/Riyadh')::date>=p_from)
    AND (p_to IS NULL OR (completed_at AT TIME ZONE 'Asia/Riyadh')::date<=p_to);

  SELECT coalesce(sum(amount),0) INTO v_period_expenses
  FROM public.finance_expenses
  WHERE voided_at IS NULL
    AND (p_from IS NULL OR expense_date>=p_from)
    AND (p_to IS NULL OR expense_date<=p_to);

  SELECT coalesce(sum(total),0),count(*) INTO v_period_issued_total,v_period_issued_count
  FROM public.invoices
  WHERE status='issued' AND issued_at IS NOT NULL
    AND (p_from IS NULL OR (issued_at AT TIME ZONE 'Asia/Riyadh')::date>=p_from)
    AND (p_to IS NULL OR (issued_at AT TIME ZONE 'Asia/Riyadh')::date<=p_to);

  WITH canonical_receipts AS (
    SELECT ip.amount FROM public.invoice_payments ip WHERE ip.voided_at IS NULL
    UNION ALL
    SELECT rp.amount FROM public.service_request_payments rp
    WHERE rp.voided_at IS NULL AND rp.transferred_invoice_payment_id IS NULL
  )
  SELECT coalesce(sum(amount),0) INTO v_current_gross FROM canonical_receipts;

  SELECT coalesce(sum(amount),0) INTO v_current_refunds
  FROM public.payment_refunds WHERE status='succeeded';

  SELECT coalesce(sum(amount),0) INTO v_current_custody
  FROM public.technician_collections
  WHERE collection_method='cash' AND status='pending_settlement';

  SELECT coalesce(sum(v.amount),0) INTO v_current_reserved
  FROM (
    SELECT CASE WHEN status='requires_reconciliation' THEN provider_confirmed_amount ELSE requested_amount END AS amount
    FROM public.payment_attempts
    WHERE (
      status IN ('created','pending') AND reservation_active
      AND (reservation_expires_at IS NULL OR reservation_expires_at>now())
    ) OR (status='requires_reconciliation' AND verified_at IS NOT NULL)
    UNION ALL
    SELECT amount FROM public.technician_collections
    WHERE collection_method<>'cash' AND status='pending_verification'
  ) v;

  FOR v_request_id IN
    SELECT DISTINCT service_request_id
    FROM (
      SELECT service_request_id FROM public.invoices WHERE status IN ('draft','issued')
      UNION ALL
      SELECT service_request_id FROM public.service_request_payments WHERE voided_at IS NULL
      UNION ALL
      SELECT i.service_request_id FROM public.invoice_payments ip JOIN public.invoices i ON i.id=ip.invoice_id WHERE ip.voided_at IS NULL
      UNION ALL
      SELECT service_request_id FROM public.payment_refunds WHERE status IN ('approved','pending','succeeded')
      UNION ALL
      SELECT service_request_id FROM public.technician_collections WHERE status IN ('pending_settlement','pending_verification','verified','settled')
      UNION ALL
      SELECT service_request_id FROM public.payment_attempts WHERE status IN ('created','pending','requires_reconciliation','succeeded')
    ) financial_requests
  LOOP
    v_state:=private.payment_financial_state(v_request_id);
    v_position_request_count:=v_position_request_count+1;
    v_state_currency:=nullif(v_state->>'currency','');

    IF v_state_currency IS NOT NULL THEN
      IF v_currency IS NULL THEN
        v_currency:=v_state_currency;
      ELSIF v_currency<>v_state_currency THEN
        RAISE EXCEPTION 'financial_currency_mismatch';
      END IF;
    END IF;

    IF (v_state->>'remaining_contractual') IS NOT NULL THEN
      v_current_remaining:=v_current_remaining+coalesce((v_state->>'remaining_contractual')::numeric,0);
    END IF;

    IF (v_state->>'excess_refund_liability') IS NOT NULL THEN
      v_current_excess:=v_current_excess+coalesce((v_state->>'excess_refund_liability')::numeric,0);
    END IF;

    IF coalesce((v_state->>'review_required')::boolean,false) THEN
      v_current_review_count:=v_current_review_count+1;
    END IF;

    IF coalesce((v_state->>'reconciliation_required')::boolean,false) THEN
      v_current_reconcile_count:=v_current_reconcile_count+1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'currency',v_currency,
    'period',jsonb_build_object(
      'from',p_from,'to',p_to,
      'gross_receipts',v_period_gross,
      'succeeded_refunds',v_period_refunds,
      'net_receipts',v_period_gross-v_period_refunds,
      'expenses',v_period_expenses,
      'net_cash_flow',v_period_gross-v_period_refunds-v_period_expenses,
      'issued_invoice_total',v_period_issued_total,
      'issued_invoice_count',v_period_issued_count
    ),
    'current_position',jsonb_build_object(
      'gross_receipts',v_current_gross,
      'succeeded_refunds',v_current_refunds,
      'net_receipts',v_current_gross-v_current_refunds,
      'technician_cash_custody',v_current_custody,
      'reserved_amount',v_current_reserved,
      'contractual_outstanding',v_current_remaining,
      'excess_refund_liability',v_current_excess,
      'review_required_count',v_current_review_count,
      'reconciliation_required_count',v_current_reconcile_count,
      'financial_request_count',v_position_request_count
    ),
    'semantics',jsonb_build_object(
      'timezone','Asia/Riyadh',
      'canonical_receipts','active invoice payments plus active untransferred service-request payments',
      'successful_refunds_only_reduce_net_receipts',true,
      'transferred_request_payment_aliases_double_counted',false,
      'technician_cash_custody_in_net_receipts',false
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.finance_get_canonical_report(date,date)
FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.finance_get_canonical_report(date,date)
TO authenticated;
