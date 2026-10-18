-- Refund-aware recollection and invoice paid_at hardening.
-- Effective confirmed invoice coverage = active invoice receipts - succeeded refunds for the request.

CREATE OR REPLACE FUNCTION private.payment_transition_refund(
  p_refund_id uuid,
  p_status text,
  p_provider_refund_id text DEFAULT NULL,
  p_failure_code text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='' AS $$
DECLARE
  v_request uuid;
  v_invoice uuid;
  v_total numeric;
  v_gross numeric;
  v_refunded numeric;
  v_net numeric;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('pending','succeeded','failed') THEN
    RAISE EXCEPTION 'invalid_internal_refund_transition';
  END IF;

  SELECT service_request_id
  INTO v_request
  FROM public.payment_refunds
  WHERE id=p_refund_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_not_found';
  END IF;

  PERFORM 1 FROM public.service_requests WHERE id=v_request FOR UPDATE;

  UPDATE public.payment_refunds
  SET status=p_status,
      provider_refund_id=p_provider_refund_id,
      failure_code=p_failure_code,
      completed_at=CASE WHEN p_status='succeeded' THEN now() ELSE NULL END
  WHERE id=p_refund_id;

  IF p_status='succeeded' THEN
    SELECT id,total
    INTO v_invoice,v_total
    FROM public.invoices
    WHERE service_request_id=v_request
      AND status='issued'
    ORDER BY created_at DESC,id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      SELECT coalesce(sum(amount),0)
      INTO v_gross
      FROM public.invoice_payments
      WHERE invoice_id=v_invoice
        AND voided_at IS NULL;

      SELECT coalesce(sum(amount),0)
      INTO v_refunded
      FROM public.payment_refunds
      WHERE service_request_id=v_request
        AND status='succeeded';

      v_net:=greatest(0,round(v_gross-v_refunded,2));

      IF v_net<v_total THEN
        UPDATE public.invoices
        SET paid_at=NULL
        WHERE id=v_invoice;
      END IF;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.payment_post_verified_attempt(
  p_attempt_id uuid,
  p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='' AS $$
DECLARE
  a public.payment_attempts%ROWTYPE;
  r public.service_requests%ROWTYPE;
  bill public.invoices%ROWTYPE;
  v_request uuid;
  v_currency text;
  v_receipt uuid;
  v_key text;
  received numeric;
  refunded numeric;
  effective_received numeric;
  untransferred numeric;
  existing_key text;
BEGIN
  IF p_idempotency_key IS NULL OR p_idempotency_key<>btrim(p_idempotency_key)
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_receipt_idempotency_key';
  END IF;

  SELECT service_request_id INTO v_request
  FROM public.payment_attempts WHERE id=p_attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_attempt_not_found'; END IF;

  SELECT * INTO r FROM public.service_requests WHERE id=v_request FOR UPDATE;
  SELECT * INTO a FROM public.payment_attempts WHERE id=p_attempt_id FOR UPDATE;

  v_key:='attempt:'||a.id::text||':'||p_idempotency_key;

  IF a.status='succeeded' THEN
    IF a.posted_request_payment_id IS NOT NULL THEN
      SELECT id,idempotency_key INTO v_receipt,existing_key
      FROM public.service_request_payments
      WHERE id=a.posted_request_payment_id AND payment_attempt_id=a.id;
    ELSE
      SELECT id,idempotency_key INTO v_receipt,existing_key
      FROM public.invoice_payments
      WHERE id=a.posted_invoice_payment_id AND payment_attempt_id=a.id;
    END IF;

    IF v_receipt IS NULL OR existing_key IS DISTINCT FROM v_key THEN
      RAISE EXCEPTION 'attempt_already_posted_with_different_key';
    END IF;
    RETURN v_receipt;
  END IF;

  IF a.status<>'requires_reconciliation'
     OR a.verified_at IS NULL
     OR a.provider_transaction_id IS NULL THEN
    RAISE EXCEPTION 'attempt_not_ready_for_posting';
  END IF;

  IF a.created_by IS NULL THEN
    RAISE EXCEPTION 'receipt_recorder_unavailable';
  END IF;

  SELECT * INTO bill
  FROM public.invoices
  WHERE service_request_id=v_request AND status='issued'
  ORDER BY created_at DESC,id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_currency:=bill.currency;

    SELECT coalesce(sum(amount),0)
    INTO received
    FROM public.invoice_payments
    WHERE invoice_id=bill.id AND voided_at IS NULL;

    SELECT coalesce(sum(amount),0)
    INTO refunded
    FROM public.payment_refunds
    WHERE service_request_id=v_request AND status='succeeded';

    effective_received:=greatest(0,round(received-refunded,2));

    IF round(effective_received+a.provider_confirmed_amount,2)>bill.total THEN
      RAISE EXCEPTION 'payment_exceeds_balance';
    END IF;

    IF v_currency IS DISTINCT FROM a.provider_confirmed_currency THEN
      RAISE EXCEPTION 'receipt_currency_mismatch';
    END IF;

    INSERT INTO public.invoice_payments(
      invoice_id,amount,method,note,recorded_by,idempotency_key,payment_attempt_id,obligation_snapshot
    )
    VALUES(
      bill.id,a.provider_confirmed_amount,'card','Payment attempt: '||a.id::text,
      a.created_by,v_key,a.id,a.obligation_snapshot
    )
    RETURNING id INTO v_receipt;

    PERFORM private.payment_transition_attempt(a.id,'succeeded',NULL,NULL,NULL,NULL,v_receipt);

    IF round(effective_received+a.provider_confirmed_amount,2)>=bill.total THEN
      UPDATE public.invoices SET paid_at=coalesce(paid_at,now()) WHERE id=bill.id;
    ELSE
      UPDATE public.invoices SET paid_at=NULL WHERE id=bill.id;
    END IF;

    PERFORM private.payment_write_audit_event(
      'payment_attempt_posted_to_invoice_payment','payment_attempt',a.id,v_request,bill.id,
      jsonb_build_object('receipt_id',v_receipt,'amount',a.provider_confirmed_amount,'currency',v_currency)
    );
  ELSE
    IF r.workflow_stage IN ('cancelled','customer_cancelled') THEN
      RAISE EXCEPTION 'request_not_open_for_preinvoice_payment';
    END IF;

    SELECT context_currency INTO v_currency
    FROM private.payment_foundation_context(v_request);

    IF v_currency IS DISTINCT FROM a.provider_confirmed_currency THEN
      RAISE EXCEPTION 'receipt_currency_mismatch';
    END IF;

    IF r.workflow_stage='completed' THEN
      SELECT * INTO bill
      FROM public.invoices
      WHERE service_request_id=v_request AND status='draft'
      ORDER BY created_at DESC,id
      LIMIT 1
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'completed_request_invoice_draft_required';
      END IF;

      SELECT coalesce(sum(amount),0)
      INTO received
      FROM public.invoice_payments
      WHERE invoice_id=bill.id AND voided_at IS NULL;

      SELECT coalesce(sum(amount),0)
      INTO untransferred
      FROM public.service_request_payments
      WHERE service_request_id=v_request
        AND voided_at IS NULL
        AND transferred_invoice_payment_id IS NULL;

      SELECT coalesce(sum(amount),0)
      INTO refunded
      FROM public.payment_refunds
      WHERE service_request_id=v_request AND status='succeeded';

      effective_received:=greatest(0,round(received+untransferred-refunded,2));

      IF round(effective_received+a.provider_confirmed_amount,2)>bill.total THEN
        RAISE EXCEPTION 'payment_exceeds_invoice_remaining';
      END IF;
    END IF;

    INSERT INTO public.service_request_payments(
      service_request_id,payment_type,amount,method,note,recorded_by,idempotency_key,payment_attempt_id,obligation_snapshot
    )
    VALUES(
      v_request,'advance',a.provider_confirmed_amount,'card','Payment attempt: '||a.id::text,
      a.created_by,v_key,a.id,a.obligation_snapshot
    )
    RETURNING id INTO v_receipt;

    PERFORM private.payment_transition_attempt(a.id,'succeeded',NULL,NULL,NULL,v_receipt,NULL);

    PERFORM private.payment_write_audit_event(
      'payment_attempt_posted_to_request_payment','payment_attempt',a.id,v_request,bill.id,
      jsonb_build_object('receipt_id',v_receipt,'amount',a.provider_confirmed_amount,'currency',v_currency)
    );

    IF r.workflow_stage='completed' THEN
      PERFORM private.finance_transfer_request_payments_to_invoice(bill.id,v_request);
    END IF;
  END IF;

  RETURN v_receipt;
END $$;

CREATE OR REPLACE FUNCTION private.payment_post_technician_collection(
  p_collection_id uuid,
  p_idempotency_key text,
  p_cash boolean
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='' AS $$
DECLARE
  tc public.technician_collections%ROWTYPE;
  r public.service_requests%ROWTYPE;
  b public.invoices%ROWTYPE;
  req uuid;
  receipt uuid;
  previous_key text;
  v_key text;
  v_currency text;
  total_received numeric;
  refunded numeric;
  effective_received numeric;
  snap jsonb;
BEGIN
  PERFORM private.payment_foundation_require_finance();

  IF p_idempotency_key IS NULL OR p_idempotency_key<>btrim(p_idempotency_key)
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_receipt_idempotency_key';
  END IF;

  SELECT service_request_id INTO req
  FROM public.technician_collections
  WHERE id=p_collection_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'technician_collection_not_found'; END IF;

  SELECT * INTO r FROM public.service_requests WHERE id=req FOR UPDATE;
  SELECT * INTO tc FROM public.technician_collections WHERE id=p_collection_id FOR UPDATE;

  IF tc.recorded_by=auth.uid()
     OR EXISTS(
       SELECT 1 FROM public.technicians
       WHERE id=tc.technician_id AND profile_id=auth.uid()
     ) THEN
    RAISE EXCEPTION 'collection_self_decision_forbidden';
  END IF;

  IF (tc.collection_method='cash') IS DISTINCT FROM p_cash THEN
    RAISE EXCEPTION 'collection_method_mismatch';
  END IF;

  v_key:='collection:'||tc.id::text||':'||p_idempotency_key;

  SELECT id,idempotency_key INTO receipt,previous_key
  FROM public.service_request_payments
  WHERE technician_collection_id=tc.id;

  IF NOT FOUND THEN
    SELECT id,idempotency_key INTO receipt,previous_key
    FROM public.invoice_payments
    WHERE technician_collection_id=tc.id;
  END IF;

  IF receipt IS NOT NULL THEN
    IF previous_key IS DISTINCT FROM v_key
       OR NOT ((p_cash AND tc.status='settled') OR (NOT p_cash AND tc.status='verified')) THEN
      RAISE EXCEPTION 'collection_already_posted_with_different_key';
    END IF;
    RETURN receipt;
  END IF;

  IF NOT ((p_cash AND tc.status='pending_settlement') OR (NOT p_cash AND tc.status='verified')) THEN
    RAISE EXCEPTION 'collection_not_ready_for_posting';
  END IF;

  snap:=jsonb_build_object(
    'collection_id',tc.id,
    'payment_revision',r.payment_revision,
    'source','technician_collection'
  );

  SELECT * INTO b
  FROM public.invoices
  WHERE service_request_id=req AND status='issued'
  FOR UPDATE;

  IF FOUND THEN
    SELECT coalesce(sum(amount),0)
    INTO total_received
    FROM public.invoice_payments
    WHERE invoice_id=b.id AND voided_at IS NULL;

    SELECT coalesce(sum(amount),0)
    INTO refunded
    FROM public.payment_refunds
    WHERE service_request_id=req AND status='succeeded';

    effective_received:=greatest(0,round(total_received-refunded,2));

    IF round(effective_received+tc.amount,2)>b.total THEN
      RAISE EXCEPTION 'payment_exceeds_balance';
    END IF;

    IF b.currency IS DISTINCT FROM tc.currency THEN
      RAISE EXCEPTION 'collection_currency_mismatch';
    END IF;

    INSERT INTO public.invoice_payments(
      invoice_id,amount,method,note,recorded_by,paid_at,
      idempotency_key,technician_collection_id,obligation_snapshot
    )
    VALUES(
      b.id,tc.amount,tc.collection_method,'Technician collection: '||tc.id::text,
      auth.uid(),tc.collected_at,v_key,tc.id,snap
    )
    RETURNING id INTO receipt;
  ELSE
    IF r.workflow_stage IN ('cancelled','customer_cancelled') THEN
      RAISE EXCEPTION 'request_not_open_for_preinvoice_payment';
    END IF;

    SELECT context_currency INTO v_currency
    FROM private.payment_foundation_context(req);

    IF v_currency IS DISTINCT FROM tc.currency THEN
      RAISE EXCEPTION 'collection_currency_mismatch';
    END IF;

    IF r.workflow_stage='completed' THEN
      SELECT * INTO b
      FROM public.invoices
      WHERE service_request_id=req AND status='draft'
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'completed_request_invoice_draft_required';
      END IF;

      SELECT coalesce(sum(amount),0)
      INTO total_received
      FROM (
        SELECT amount
        FROM public.invoice_payments
        WHERE invoice_id=b.id AND voided_at IS NULL
        UNION ALL
        SELECT amount
        FROM public.service_request_payments
        WHERE service_request_id=req
          AND voided_at IS NULL
          AND transferred_invoice_payment_id IS NULL
      ) x;

      SELECT coalesce(sum(amount),0)
      INTO refunded
      FROM public.payment_refunds
      WHERE service_request_id=req AND status='succeeded';

      effective_received:=greatest(0,round(total_received-refunded,2));

      IF round(effective_received+tc.amount,2)>b.total THEN
        RAISE EXCEPTION 'payment_exceeds_invoice_remaining';
      END IF;
    END IF;

    INSERT INTO public.service_request_payments(
      service_request_id,payment_type,amount,method,note,recorded_by,paid_at,
      idempotency_key,technician_collection_id,obligation_snapshot
    )
    VALUES(
      req,'advance',tc.amount,tc.collection_method,'Technician collection: '||tc.id::text,
      auth.uid(),tc.collected_at,v_key,tc.id,snap
    )
    RETURNING id INTO receipt;
  END IF;

  IF p_cash THEN
    UPDATE public.technician_collections
    SET status='settled',settled_by=auth.uid(),settled_at=now()
    WHERE id=tc.id;
  END IF;

  IF r.workflow_stage='completed' AND b.status='draft' THEN
    PERFORM private.finance_transfer_request_payments_to_invoice(b.id,req);
  END IF;

  IF b.status='issued' THEN
    IF round(effective_received+tc.amount,2)>=b.total THEN
      UPDATE public.invoices SET paid_at=coalesce(paid_at,now()) WHERE id=b.id;
    ELSE
      UPDATE public.invoices SET paid_at=NULL WHERE id=b.id;
    END IF;
  END IF;

  PERFORM private.payment_write_audit_event(
    CASE WHEN p_cash
      THEN 'technician_cash_collection_settled'
      ELSE 'technician_verified_collection_posted'
    END,
    'technician_collection',tc.id,req,b.id,
    jsonb_build_object('receipt_id',receipt,'amount',tc.amount,'currency',tc.currency)
  );

  RETURN receipt;
END $$;
