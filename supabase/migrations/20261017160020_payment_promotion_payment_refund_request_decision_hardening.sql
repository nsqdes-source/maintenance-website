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
      rp.voided_at
    INTO
      v_request,
      v_origin_amount,
      v_voided_at
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
      i.currency
    INTO
      v_request,
      v_origin_amount,
      v_voided_at,
      v_invoice,
      v_currency
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
    p_idempotency_key,
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.finance_decide_refund(
  p_refund_id uuid,
  p_decision text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='' AS $$
DECLARE
  v_refund public.payment_refunds%ROWTYPE;
BEGIN
  PERFORM private.payment_foundation_require_finance();

  IF p_decision IS NULL
     OR p_decision NOT IN ('approved','rejected','cancelled') THEN
    RAISE EXCEPTION 'invalid_refund_decision';
  END IF;

  SELECT *
  INTO v_refund
  FROM public.payment_refunds
  WHERE id=p_refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_not_found';
  END IF;

  PERFORM 1
  FROM public.service_requests
  WHERE id=v_refund.service_request_id
  FOR UPDATE;

  IF v_refund.status=p_decision THEN
    RETURN;
  END IF;

  IF p_decision IN ('approved','rejected')
     AND v_refund.status<>'requested' THEN
    RAISE EXCEPTION 'refund_decision_not_allowed_from_current_status';
  END IF;

  IF p_decision='cancelled'
     AND v_refund.status NOT IN ('requested','approved') THEN
    RAISE EXCEPTION 'refund_cancel_not_allowed_from_current_status';
  END IF;

  UPDATE public.payment_refunds
  SET
    status=p_decision,
    approved_by=CASE
      WHEN p_decision='approved' THEN auth.uid()
      ELSE approved_by
    END,
    approved_at=CASE
      WHEN p_decision='approved' THEN now()
      ELSE approved_at
    END
  WHERE id=p_refund_id;
END $$;

REVOKE ALL ON FUNCTION public.finance_request_refund(uuid,uuid,uuid,numeric,text,text,text)
FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.finance_request_refund(uuid,uuid,uuid,numeric,text,text,text)
TO authenticated;

REVOKE ALL ON FUNCTION public.finance_decide_refund(uuid,text)
FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.finance_decide_refund(uuid,text)
TO authenticated;
