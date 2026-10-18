CREATE OR REPLACE FUNCTION public.finance_request_refund(
  p_service_request_id uuid,
  p_origin_service_request_payment_id uuid,
  p_origin_invoice_payment_id uuid,
  p_amount numeric,
  p_reason text,
  p_idempotency_key text,
  p_note text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='' AS $$
DECLARE
  v_id uuid;
  v_existing public.payment_refunds%ROWTYPE;
  v_invoice uuid;
  v_currency text;
  v_request uuid;
  v_origin_amount numeric;
  v_voided_at timestamptz;
  v_reserved numeric:=0;
  v_payment_attempt_id uuid;
  v_provider text;
BEGIN
  PERFORM private.payment_foundation_require_finance();

  PERFORM 1
  FROM public.service_requests
  WHERE id=p_service_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_request_not_found';
  END IF;

  IF NOT private.payment_foundation_amount_valid(p_amount) THEN
    RAISE EXCEPTION 'invalid_refund_amount';
  END IF;

  IF num_nonnulls(
    p_origin_service_request_payment_id,
    p_origin_invoice_payment_id
  )<>1 THEN
    RAISE EXCEPTION 'refund_origin_xor_required';
  END IF;

  IF p_idempotency_key IS NULL
     OR p_idempotency_key<>btrim(p_idempotency_key)
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_refund_idempotency_key';
  END IF;

  IF p_reason IS NULL
     OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid_refund_reason';
  END IF;

  IF length(coalesce(p_note,''))>2000 THEN
    RAISE EXCEPTION 'refund_note_too_long';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.payment_refunds
  WHERE service_request_id=p_service_request_id
    AND idempotency_key=p_idempotency_key
  FOR SHARE;

  IF FOUND THEN
    IF v_existing.origin_service_request_payment_id
         IS NOT DISTINCT FROM p_origin_service_request_payment_id
       AND v_existing.origin_invoice_payment_id
         IS NOT DISTINCT FROM p_origin_invoice_payment_id
       AND v_existing.amount IS NOT DISTINCT FROM p_amount
       AND v_existing.reason IS NOT DISTINCT FROM p_reason
       AND v_existing.note IS NOT DISTINCT FROM coalesce(p_note,'') THEN
      RETURN v_existing.id;
    END IF;

    RAISE EXCEPTION 'refund_idempotency_conflict';
  END IF;

  IF p_origin_service_request_payment_id IS NOT NULL THEN
    SELECT
      rp.service_request_id,
      rp.amount,
      rp.voided_at,
      rp.payment_attempt_id
    INTO
      v_request,
      v_origin_amount,
      v_voided_at,
      v_payment_attempt_id
    FROM public.service_request_payments rp
    WHERE rp.id=p_origin_service_request_payment_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_request IS DISTINCT FROM p_service_request_id
       OR v_voided_at IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_or_voided_refund_origin';
    END IF;

    SELECT i.id,i.currency
    INTO v_invoice,v_currency
    FROM public.service_request_payments rp
    JOIN public.invoice_payments ip
      ON ip.id=rp.transferred_invoice_payment_id
    JOIN public.invoices i
      ON i.id=ip.invoice_id
    WHERE rp.id=p_origin_service_request_payment_id
    FOR SHARE OF ip,i;

    IF NOT FOUND THEN
      SELECT context_invoice_id,context_currency
      INTO v_invoice,v_currency
      FROM private.payment_foundation_context(p_service_request_id);
    END IF;

  ELSE
    SELECT
      i.service_request_id,
      ip.amount,
      ip.voided_at,
      i.id,
      i.currency,
      ip.payment_attempt_id
    INTO
      v_request,
      v_origin_amount,
      v_voided_at,
      v_invoice,
      v_currency,
      v_payment_attempt_id
    FROM public.invoice_payments ip
    JOIN public.invoices i
      ON i.id=ip.invoice_id
    WHERE ip.id=p_origin_invoice_payment_id
    FOR UPDATE OF ip;

    IF NOT FOUND
       OR v_request IS DISTINCT FROM p_service_request_id
       OR v_voided_at IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_or_voided_refund_origin';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.service_request_payments rp
      WHERE rp.transferred_invoice_payment_id=p_origin_invoice_payment_id
    ) THEN
      RAISE EXCEPTION 'refund_requires_canonical_request_payment';
    END IF;
  END IF;

  IF v_currency IS NULL THEN
    RAISE EXCEPTION 'refund_currency_unavailable';
  END IF;

  IF v_payment_attempt_id IS NOT NULL THEN
    SELECT a.provider
    INTO v_provider
    FROM public.payment_attempts a
    WHERE a.id=v_payment_attempt_id
      AND a.status='succeeded'
      AND a.provider_transaction_id IS NOT NULL;

    IF NOT FOUND THEN
      v_provider:=NULL;
    END IF;
  END IF;

  SELECT coalesce(sum(pr.amount),0)
  INTO v_reserved
  FROM public.payment_refunds pr
  WHERE pr.status IN ('approved','pending','succeeded')
    AND (
      (
        p_origin_service_request_payment_id IS NOT NULL
        AND pr.origin_service_request_payment_id=p_origin_service_request_payment_id
      )
      OR
      (
        p_origin_invoice_payment_id IS NOT NULL
        AND pr.origin_invoice_payment_id=p_origin_invoice_payment_id
      )
    );

  IF v_reserved>=v_origin_amount THEN
    RAISE EXCEPTION 'refund_balance_exhausted';
  END IF;

  IF p_amount>(v_origin_amount-v_reserved) THEN
    RAISE EXCEPTION 'refund_exceeds_available_balance';
  END IF;

  INSERT INTO public.payment_refunds(
    service_request_id,
    invoice_id,
    origin_service_request_payment_id,
    origin_invoice_payment_id,
    amount,
    currency,
    reason,
    note,
    provider,
    idempotency_key,
    requested_by
  )
  VALUES(
    p_service_request_id,
    v_invoice,
    p_origin_service_request_payment_id,
    p_origin_invoice_payment_id,
    p_amount,
    v_currency,
    p_reason,
    coalesce(p_note,''),
    v_provider,
    p_idempotency_key,
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

CREATE FUNCTION public.gateway_start_refund(
  p_refund_id uuid,
  p_provider_refund_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='' AS $$
DECLARE
  r public.payment_refunds%ROWTYPE;
  ctx jsonb;
BEGIN
  IF p_provider_refund_id IS NULL
     OR p_provider_refund_id<>btrim(p_provider_refund_id)
     OR length(p_provider_refund_id) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_provider_refund_id';
  END IF;

  SELECT *
  INTO r
  FROM public.payment_refunds
  WHERE id=p_refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_not_found';
  END IF;

  IF r.status='pending' THEN
    IF r.provider_refund_id IS NOT DISTINCT FROM p_provider_refund_id THEN
      RETURN 'pending';
    END IF;
    RAISE EXCEPTION 'provider_refund_identity_conflict';
  END IF;

  IF r.status<>'approved' THEN
    RAISE EXCEPTION 'refund_not_approved';
  END IF;

  ctx:=public.gateway_get_refund_context(p_refund_id);

  IF r.provider_refund_id IS NOT NULL
     AND r.provider_refund_id IS DISTINCT FROM p_provider_refund_id THEN
    RAISE EXCEPTION 'provider_refund_identity_conflict';
  END IF;

  PERFORM private.payment_transition_refund(
    p_refund_id,
    'pending',
    p_provider_refund_id,
    NULL
  );

  RETURN 'pending';
END $$;

CREATE FUNCTION public.gateway_apply_verified_refund_result(
  p_refund_id uuid,
  p_provider_refund_id text,
  p_result text,
  p_failure_code text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='' AS $$
DECLARE
  r public.payment_refunds%ROWTYPE;
  ctx jsonb;
BEGIN
  IF p_result NOT IN ('succeeded','failed') THEN
    RAISE EXCEPTION 'invalid_refund_provider_result';
  END IF;

  IF p_provider_refund_id IS NULL
     OR p_provider_refund_id<>btrim(p_provider_refund_id)
     OR length(p_provider_refund_id) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_provider_refund_id';
  END IF;

  IF p_failure_code IS NOT NULL
     AND length(p_failure_code)>100 THEN
    RAISE EXCEPTION 'refund_failure_code_too_long';
  END IF;

  SELECT *
  INTO r
  FROM public.payment_refunds
  WHERE id=p_refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_not_found';
  END IF;

  IF r.status IN ('succeeded','failed') THEN
    IF r.status=p_result
       AND r.provider_refund_id IS NOT DISTINCT FROM p_provider_refund_id THEN
      RETURN r.status;
    END IF;
    RAISE EXCEPTION 'refund_provider_result_conflict';
  END IF;

  IF r.status<>'pending' THEN
    RAISE EXCEPTION 'refund_not_pending';
  END IF;

  IF r.provider_refund_id IS DISTINCT FROM p_provider_refund_id THEN
    RAISE EXCEPTION 'provider_refund_identity_conflict';
  END IF;

  ctx:=public.gateway_get_refund_context(p_refund_id);

  PERFORM private.payment_transition_refund(
    p_refund_id,
    p_result,
    p_provider_refund_id,
    CASE WHEN p_result='failed' THEN p_failure_code ELSE NULL END
  );

  RETURN p_result;
END $$;

REVOKE ALL ON FUNCTION public.gateway_get_refund_context(uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gateway_get_refund_context(uuid)
TO service_role;

REVOKE ALL ON FUNCTION public.gateway_start_refund(uuid,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gateway_start_refund(uuid,text)
TO service_role;

REVOKE ALL ON FUNCTION public.gateway_apply_verified_refund_result(uuid,text,text,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gateway_apply_verified_refund_result(uuid,text,text,text)
TO service_role;
