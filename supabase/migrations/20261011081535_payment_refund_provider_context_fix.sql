CREATE OR REPLACE FUNCTION public.gateway_get_refund_context(
  p_refund_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path='' AS $$
DECLARE
  r public.payment_refunds%ROWTYPE;
  v_attempt public.payment_attempts%ROWTYPE;
  s public.business_finance_settings%ROWTYPE;
BEGIN
  SELECT *
  INTO r
  FROM public.payment_refunds
  WHERE id=p_refund_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_not_found';
  END IF;

  IF r.status NOT IN ('approved','pending') THEN
    RAISE EXCEPTION 'refund_not_provider_processable';
  END IF;

  SELECT *
  INTO s
  FROM public.business_finance_settings
  WHERE id=true;

  IF NOT FOUND OR NOT s.payment_domain_enabled OR NOT s.gateway_enabled THEN
    RAISE EXCEPTION 'gateway_not_enabled';
  END IF;

  IF r.origin_service_request_payment_id IS NOT NULL THEN
    SELECT pa.*
    INTO v_attempt
    FROM public.service_request_payments rp
    JOIN public.payment_attempts pa
      ON pa.id=rp.payment_attempt_id
    WHERE rp.id=r.origin_service_request_payment_id;
  ELSE
    SELECT pa.*
    INTO v_attempt
    FROM public.invoice_payments ip
    JOIN public.payment_attempts pa
      ON pa.id=ip.payment_attempt_id
    WHERE ip.id=r.origin_invoice_payment_id;
  END IF;

  IF NOT FOUND
     OR v_attempt.status<>'succeeded'
     OR v_attempt.provider_transaction_id IS NULL THEN
    RAISE EXCEPTION 'refund_provider_origin_unavailable';
  END IF;

  IF r.provider IS DISTINCT FROM v_attempt.provider THEN
    RAISE EXCEPTION 'refund_provider_mismatch';
  END IF;

  IF s.gateway_provider IS DISTINCT FROM v_attempt.provider
     OR s.gateway_environment IS DISTINCT FROM v_attempt.environment THEN
    RAISE EXCEPTION 'gateway_configuration_mismatch';
  END IF;

  RETURN jsonb_build_object(
    'refund_id',r.id,
    'service_request_id',r.service_request_id,
    'amount',r.amount,
    'currency',r.currency,
    'status',r.status,
    'provider',v_attempt.provider,
    'environment',v_attempt.environment,
    'provider_refund_id',r.provider_refund_id,
    'payment_attempt_id',v_attempt.id,
    'origin_provider_transaction_id',v_attempt.provider_transaction_id
  );
END $$;

REVOKE ALL ON FUNCTION public.gateway_get_refund_context(uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gateway_get_refund_context(uuid)
TO service_role;
