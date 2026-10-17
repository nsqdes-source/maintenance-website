CREATE FUNCTION public.customer_create_gateway_payment_attempt(
  p_service_request_id uuid,
  p_idempotency_key text
)
RETURNS TABLE(
  attempt_id uuid,
  requested_amount numeric,
  currency text,
  provider text,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='' AS $$
DECLARE
  r public.service_requests%ROWTYPE;
  s public.business_finance_settings%ROWTYPE;
  v_attempt_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=auth.uid() AND p.role='customer'
  ) THEN
    RAISE EXCEPTION 'customer_role_required' USING ERRCODE='42501';
  END IF;

  SELECT * INTO r
  FROM public.service_requests
  WHERE id=p_service_request_id
  FOR SHARE;

  IF NOT FOUND OR r.customer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'service_request_not_found' USING ERRCODE='P0002';
  END IF;

  SELECT * INTO s
  FROM public.business_finance_settings
  WHERE id=true
  FOR SHARE;

  IF NOT FOUND OR NOT s.payment_domain_enabled OR NOT s.gateway_enabled THEN
    RAISE EXCEPTION 'gateway_not_enabled';
  END IF;

  IF s.gateway_provider IS NULL THEN
    RAISE EXCEPTION 'gateway_provider_not_configured';
  END IF;

  v_attempt_id:=private.payment_create_authoritative_attempt(
    p_service_request_id,
    s.gateway_provider,
    s.gateway_environment,
    p_idempotency_key
  );

  RETURN QUERY
  SELECT a.id,a.requested_amount,a.currency,a.provider,a.status,a.created_at
  FROM public.payment_attempts a
  WHERE a.id=v_attempt_id;
END $$;

CREATE FUNCTION public.customer_get_gateway_payment_attempt(
  p_attempt_id uuid
)
RETURNS TABLE(
  attempt_id uuid,
  requested_amount numeric,
  currency text,
  provider text,
  customer_status text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=auth.uid() AND p.role='customer'
  ) THEN
    RAISE EXCEPTION 'customer_role_required' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.requested_amount,
    a.currency,
    a.provider,
    CASE a.status
      WHEN 'requires_reconciliation' THEN 'processing_review'
      ELSE a.status
    END,
    a.created_at,
    a.updated_at
  FROM public.payment_attempts a
  JOIN public.service_requests r ON r.id=a.service_request_id
  WHERE a.id=p_attempt_id
    AND r.customer_id=auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_attempt_not_found' USING ERRCODE='P0002';
  END IF;
END $$;

CREATE FUNCTION public.gateway_record_verified_provider_event(
  p_provider_event_id text,
  p_event_type text,
  p_payload_hash text,
  p_payment_attempt_id uuid DEFAULT NULL,
  p_provider_transaction_id text DEFAULT NULL,
  p_safe_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='' AS $$
DECLARE
  s public.business_finance_settings%ROWTYPE;
BEGIN
  SELECT * INTO s
  FROM public.business_finance_settings
  WHERE id=true
  FOR SHARE;

  IF NOT FOUND OR NOT s.payment_domain_enabled OR NOT s.gateway_enabled THEN
    RAISE EXCEPTION 'gateway_not_enabled';
  END IF;

  IF s.gateway_provider IS NULL THEN
    RAISE EXCEPTION 'gateway_provider_not_configured';
  END IF;

  RETURN private.payment_record_provider_event(
    s.gateway_provider,
    s.gateway_environment,
    p_provider_event_id,
    p_event_type,
    p_payload_hash,
    p_payment_attempt_id,
    p_provider_transaction_id,
    p_safe_metadata
  );
END $$;

CREATE FUNCTION public.gateway_apply_verified_provider_result(
  p_event_id uuid,
  p_result text,
  p_provider_transaction_id text DEFAULT NULL,
  p_confirmed_amount numeric DEFAULT NULL,
  p_confirmed_currency text DEFAULT NULL,
  p_failure_code text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='' AS $$
BEGIN
  RETURN private.payment_apply_verified_provider_result(
    p_event_id,
    p_result,
    p_provider_transaction_id,
    p_confirmed_amount,
    p_confirmed_currency,
    p_failure_code
  );
END $$;

CREATE FUNCTION public.gateway_post_verified_attempt(
  p_attempt_id uuid,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='' AS $$
BEGIN
  RETURN private.payment_post_verified_attempt(
    p_attempt_id,
    p_idempotency_key
  );
END $$;

REVOKE ALL ON FUNCTION public.customer_create_gateway_payment_attempt(uuid,text)
FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.customer_create_gateway_payment_attempt(uuid,text)
TO authenticated;

REVOKE ALL ON FUNCTION public.customer_get_gateway_payment_attempt(uuid)
FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.customer_get_gateway_payment_attempt(uuid)
TO authenticated;

REVOKE ALL ON FUNCTION public.gateway_record_verified_provider_event(text,text,text,uuid,text,jsonb)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gateway_record_verified_provider_event(text,text,text,uuid,text,jsonb)
TO service_role;

REVOKE ALL ON FUNCTION public.gateway_apply_verified_provider_result(uuid,text,text,numeric,text,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gateway_apply_verified_provider_result(uuid,text,text,numeric,text,text)
TO service_role;

REVOKE ALL ON FUNCTION public.gateway_post_verified_attempt(uuid,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gateway_post_verified_attempt(uuid,text)
TO service_role;
