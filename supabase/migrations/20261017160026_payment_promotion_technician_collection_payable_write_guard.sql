CREATE OR REPLACE FUNCTION public.technician_record_collection(
  p_service_request_id uuid,
  p_method text,
  p_amount numeric,
  p_idempotency_key text,
  p_note text DEFAULT ''::text,
  p_collected_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='' AS $$
DECLARE
  v_tech uuid;
  v_existing public.technician_collections%ROWTYPE;
  v_state jsonb;
  v_currency text;
  v_payable_cap numeric;
  v_payable_now numeric;
  v_enabled boolean;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.current_user_has_role(ARRAY['technician']::public.app_role[]) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501';
  END IF;

  SELECT id INTO v_tech
  FROM public.technicians
  WHERE profile_id=auth.uid() AND is_active;

  IF v_tech IS NULL THEN
    RAISE EXCEPTION 'technician_not_found';
  END IF;

  IF p_idempotency_key IS NULL
     OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200
     OR p_idempotency_key<>btrim(p_idempotency_key) THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;

  SELECT * INTO v_existing
  FROM public.technician_collections
  WHERE technician_id=v_tech
    AND idempotency_key=p_idempotency_key;

  IF FOUND THEN
    IF v_existing.service_request_id=p_service_request_id
       AND v_existing.collection_method=p_method
       AND v_existing.amount=p_amount
       AND v_existing.note=coalesce(p_note,'') THEN
      RETURN v_existing.id;
    END IF;
    RAISE EXCEPTION 'collection_idempotency_conflict';
  END IF;

  PERFORM 1
  FROM public.service_requests
  WHERE id=p_service_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_request_not_found';
  END IF;

  IF NOT EXISTS(
    SELECT 1
    FROM public.service_request_assignments
    WHERE service_request_id=p_service_request_id
      AND technician_id=v_tech
      AND status='accepted'
  ) THEN
    RAISE EXCEPTION 'accepted_assignment_not_found' USING ERRCODE='42501';
  END IF;

  IF NOT private.payment_foundation_amount_valid(p_amount) THEN
    RAISE EXCEPTION 'invalid_collection_amount';
  END IF;

  IF p_method IS NULL
     OR p_method NOT IN ('cash','bank_transfer','card','other')
     OR p_collected_at IS NULL
     OR p_collected_at>now() THEN
    RAISE EXCEPTION 'invalid_collection_method_or_time';
  END IF;

  SELECT coalesce(payment_domain_enabled,false)
  INTO v_enabled
  FROM public.business_finance_settings
  WHERE id=true;

  IF NOT coalesce(v_enabled,false) THEN
    RAISE EXCEPTION 'payment_domain_not_enabled';
  END IF;

  v_state:=private.payment_financial_state(p_service_request_id);

  IF coalesce((v_state->>'review_required')::boolean,true) THEN
    RAISE EXCEPTION 'financial_review_required';
  END IF;

  IF coalesce((v_state->>'reconciliation_required')::boolean,true) THEN
    RAISE EXCEPTION 'financial_reconciliation_required';
  END IF;

  IF NOT coalesce((v_state->>'policy_supported')::boolean,false) THEN
    RAISE EXCEPTION 'legacy_policy_unsupported';
  END IF;

  IF v_state->>'payable_cap' IS NULL OR v_state->>'payable_now' IS NULL THEN
    RAISE EXCEPTION 'payable_now_unavailable';
  END IF;

  v_payable_cap:=(v_state->>'payable_cap')::numeric;
  v_payable_now:=(v_state->>'payable_now')::numeric;
  v_currency:=v_state->>'currency';

  IF v_currency IS NULL THEN
    RAISE EXCEPTION 'financial_currency_unavailable';
  END IF;

  IF v_payable_now<=0 THEN
    RAISE EXCEPTION 'nothing_payable_now';
  END IF;

  IF p_amount>v_payable_cap OR p_amount>v_payable_now THEN
    RAISE EXCEPTION 'collection_exceeds_payable_now';
  END IF;

  INSERT INTO public.technician_collections(
    service_request_id,technician_id,collection_method,amount,currency,status,
    note,collected_at,recorded_by,idempotency_key
  )
  VALUES(
    p_service_request_id,v_tech,p_method,p_amount,v_currency,
    CASE WHEN p_method='cash' THEN 'pending_settlement' ELSE 'pending_verification' END,
    coalesce(p_note,''),p_collected_at,auth.uid(),p_idempotency_key
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.technician_record_collection(
  uuid,text,numeric,text,text,timestamptz
) FROM PUBLIC,anon,service_role;

GRANT EXECUTE ON FUNCTION public.technician_record_collection(
  uuid,text,numeric,text,text,timestamptz
) TO authenticated;
