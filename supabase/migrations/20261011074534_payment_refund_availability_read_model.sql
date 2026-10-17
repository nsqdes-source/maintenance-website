CREATE FUNCTION public.finance_get_refund_availability(
  p_service_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path='' AS $$
DECLARE
  v_enabled boolean:=false;
  v_state jsonb;
  v_payments jsonb;
BEGIN
  PERFORM private.payment_foundation_require_finance();

  PERFORM 1
  FROM public.service_requests
  WHERE id=p_service_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_request_not_found';
  END IF;

  SELECT coalesce(payment_domain_enabled,false)
  INTO v_enabled
  FROM public.business_finance_settings
  WHERE id=true;

  BEGIN
    v_state:=private.payment_financial_state(p_service_request_id);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='financial_currency_mismatch' THEN
      v_state:=jsonb_build_object(
        'review_required',true,
        'reconciliation_required',true
      );
    ELSE
      RAISE;
    END IF;
  END;

  WITH canonical_payments AS (
    SELECT
      'service_request_payment'::text AS origin_type,
      rp.id AS origin_id,
      rp.service_request_id,
      rp.amount AS original_amount,
      COALESCE(
        i.currency,
        (private.payment_foundation_context(rp.service_request_id)).context_currency
      ) AS currency,
      rp.method,
      rp.paid_at,
      rp.payment_attempt_id,
      rp.transferred_invoice_payment_id,
      NULL::uuid AS invoice_payment_id
    FROM public.service_request_payments rp
    LEFT JOIN public.invoice_payments tip
      ON tip.id=rp.transferred_invoice_payment_id
    LEFT JOIN public.invoices i
      ON i.id=tip.invoice_id
    WHERE rp.service_request_id=p_service_request_id
      AND rp.voided_at IS NULL

    UNION ALL

    SELECT
      'invoice_payment'::text AS origin_type,
      ip.id AS origin_id,
      i.service_request_id,
      ip.amount AS original_amount,
      i.currency,
      ip.method,
      ip.paid_at,
      ip.payment_attempt_id,
      NULL::uuid AS transferred_invoice_payment_id,
      ip.id AS invoice_payment_id
    FROM public.invoice_payments ip
    JOIN public.invoices i
      ON i.id=ip.invoice_id
    WHERE i.service_request_id=p_service_request_id
      AND ip.voided_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.service_request_payments rp
        WHERE rp.transferred_invoice_payment_id=ip.id
      )
  ),
  refund_totals AS (
    SELECT
      cp.origin_type,
      cp.origin_id,
      COALESCE(sum(pr.amount) FILTER (WHERE pr.status='succeeded'),0) AS succeeded_refund_total,
      COALESCE(sum(pr.amount) FILTER (WHERE pr.status IN ('approved','pending')),0) AS active_refund_reservation_total,
      COALESCE(sum(pr.amount) FILTER (WHERE pr.status='requested'),0) AS requested_refund_total
    FROM canonical_payments cp
    LEFT JOIN public.payment_refunds pr
      ON (
        (cp.origin_type='service_request_payment' AND pr.origin_service_request_payment_id=cp.origin_id)
        OR
        (cp.origin_type='invoice_payment' AND pr.origin_invoice_payment_id=cp.origin_id)
      )
    GROUP BY cp.origin_type,cp.origin_id
  ),
  enriched AS (
    SELECT
      cp.*,
      rt.succeeded_refund_total,
      rt.active_refund_reservation_total,
      rt.requested_refund_total,
      greatest(
        0,
        cp.original_amount
        - rt.succeeded_refund_total
        - rt.active_refund_reservation_total
      ) AS refundable_remaining_amount,
      a.provider,
      a.environment AS provider_environment,
      a.provider_transaction_id,
      CASE
        WHEN a.id IS NOT NULL
          AND a.status='succeeded'
          AND a.provider_transaction_id IS NOT NULL
          THEN 'provider_candidate'
        ELSE 'manual_only'
      END AS refund_route
    FROM canonical_payments cp
    JOIN refund_totals rt
      ON rt.origin_type=cp.origin_type
     AND rt.origin_id=cp.origin_id
    LEFT JOIN public.payment_attempts a
      ON a.id=cp.payment_attempt_id
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'origin_type',origin_type,
        'origin_id',origin_id,
        'original_amount',original_amount,
        'currency',currency,
        'method',method,
        'paid_at',paid_at,
        'succeeded_refund_total',succeeded_refund_total,
        'active_refund_reservation_total',active_refund_reservation_total,
        'requested_refund_total',requested_refund_total,
        'refundable_remaining_amount',refundable_remaining_amount,
        'payment_attempt_id',payment_attempt_id,
        'provider',provider,
        'provider_environment',provider_environment,
        'provider_transaction_id',provider_transaction_id,
        'refund_route',refund_route,
        'transferred_invoice_payment_id',transferred_invoice_payment_id,
        'invoice_payment_id',invoice_payment_id
      )
      ORDER BY paid_at,origin_id
    ),
    '[]'::jsonb
  )
  INTO v_payments
  FROM enriched;

  RETURN jsonb_build_object(
    'service_request_id',p_service_request_id,
    'payment_domain_enabled',v_enabled,
    'review_required',coalesce((v_state->>'review_required')::boolean,true),
    'reconciliation_required',coalesce((v_state->>'reconciliation_required')::boolean,true),
    'derived_payment_state',v_state->>'derived_payment_state',
    'excess_refund_liability',v_state->'excess_refund_liability',
    'payments',v_payments
  );
END $$;

REVOKE ALL ON FUNCTION public.finance_get_refund_availability(uuid)
FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.finance_get_refund_availability(uuid)
TO authenticated;
