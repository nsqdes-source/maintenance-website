CREATE TABLE private.payment_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  environment text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payment_attempt_id uuid REFERENCES public.payment_attempts(id),
  provider_transaction_id text,
  payload_hash text NOT NULL,
  processing_status text NOT NULL DEFAULT 'received',
  failure_code text,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT payment_provider_events_provider_chk CHECK (
    provider = btrim(provider) AND length(provider) BETWEEN 1 AND 100
    AND environment IN ('test','live')
  ),
  CONSTRAINT payment_provider_events_event_chk CHECK (
    provider_event_id = btrim(provider_event_id) AND length(provider_event_id) BETWEEN 1 AND 200
    AND event_type = btrim(event_type) AND length(event_type) BETWEEN 1 AND 100
  ),
  CONSTRAINT payment_provider_events_transaction_chk CHECK (
    provider_transaction_id IS NULL OR
    (provider_transaction_id = btrim(provider_transaction_id) AND length(provider_transaction_id) BETWEEN 1 AND 200)
  ),
  CONSTRAINT payment_provider_events_hash_chk CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT payment_provider_events_status_chk CHECK (
    processing_status IN ('received','pending','ready_for_posting','reconciliation_required','terminal_applied','already_succeeded','failed_processing')
  ),
  CONSTRAINT payment_provider_events_failure_chk CHECK (
    failure_code IS NULL OR length(failure_code) BETWEEN 1 AND 100
  ),
  CONSTRAINT payment_provider_events_metadata_chk CHECK (
    jsonb_typeof(safe_metadata)='object' AND octet_length(safe_metadata::text)<=4096
  ),
  CONSTRAINT payment_provider_events_processed_chk CHECK (
    (processing_status IN ('received','pending') AND processed_at IS NULL)
    OR (processing_status NOT IN ('received','pending') AND processed_at IS NOT NULL)
  ),
  UNIQUE(provider,environment,provider_event_id)
);

CREATE INDEX payment_provider_events_attempt_idx
  ON private.payment_provider_events(payment_attempt_id)
  WHERE payment_attempt_id IS NOT NULL;

CREATE INDEX payment_provider_events_transaction_idx
  ON private.payment_provider_events(provider,environment,provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

ALTER TABLE private.payment_provider_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.payment_provider_events FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.payment_guard_provider_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'payment_provider_event_delete_forbidden';
  END IF;

  IF ROW(NEW.provider,NEW.environment,NEW.provider_event_id,NEW.event_type,NEW.payload_hash,NEW.received_at,NEW.safe_metadata)
     IS DISTINCT FROM
     ROW(OLD.provider,OLD.environment,OLD.provider_event_id,OLD.event_type,OLD.payload_hash,OLD.received_at,OLD.safe_metadata) THEN
    RAISE EXCEPTION 'payment_provider_event_identity_is_immutable';
  END IF;

  IF OLD.payment_attempt_id IS NOT NULL
     AND NEW.payment_attempt_id IS DISTINCT FROM OLD.payment_attempt_id THEN
    RAISE EXCEPTION 'payment_provider_event_attempt_is_immutable';
  END IF;

  IF OLD.provider_transaction_id IS NOT NULL
     AND NEW.provider_transaction_id IS DISTINCT FROM OLD.provider_transaction_id THEN
    RAISE EXCEPTION 'payment_provider_event_transaction_is_immutable';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER payment_guard_provider_event
BEFORE UPDATE OR DELETE ON private.payment_provider_events
FOR EACH ROW EXECUTE FUNCTION private.payment_guard_provider_event();

CREATE FUNCTION private.payment_create_authoritative_attempt(
  p_request uuid,
  p_provider text,
  p_environment text,
  p_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='' AS $$
DECLARE
  s public.business_finance_settings%ROWTYPE;
  r public.service_requests%ROWTYPE;
  state jsonb;
  v_existing public.payment_attempts%ROWTYPE;
  v_amount numeric;
  v_currency text;
  v_invoice uuid;
  v_id uuid;
  v_snapshot jsonb;
BEGIN
  IF p_provider IS NULL OR p_provider<>btrim(p_provider) OR length(p_provider) NOT BETWEEN 1 AND 100
     OR p_environment NOT IN ('test','live')
     OR p_key IS NULL OR p_key<>btrim(p_key) OR length(p_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_attempt_identity';
  END IF;

  SELECT * INTO s FROM public.business_finance_settings WHERE id=true FOR SHARE;
  IF NOT FOUND OR NOT s.payment_domain_enabled OR NOT s.gateway_enabled THEN
    RAISE EXCEPTION 'gateway_not_enabled';
  END IF;
  IF s.gateway_provider IS DISTINCT FROM p_provider OR s.gateway_environment IS DISTINCT FROM p_environment THEN
    RAISE EXCEPTION 'gateway_configuration_mismatch';
  END IF;

  SELECT * INTO v_existing
  FROM public.payment_attempts
  WHERE provider=p_provider AND environment=p_environment AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_existing.service_request_id IS DISTINCT FROM p_request THEN
      RAISE EXCEPTION 'attempt_idempotency_conflict';
    END IF;
    RETURN v_existing.id;
  END IF;

  SELECT * INTO r FROM public.service_requests WHERE id=p_request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'service_request_not_found'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'payment_actor_required'; END IF;

  state:=private.payment_financial_state(p_request);
  IF coalesce((state->>'review_required')::boolean,true) THEN
    RAISE EXCEPTION 'financial_review_required';
  END IF;
  IF coalesce((state->>'reconciliation_required')::boolean,true) THEN
    RAISE EXCEPTION 'financial_reconciliation_required';
  END IF;

  v_amount:=(state->>'payable_now')::numeric;
  v_currency:=state->>'currency';
  IF v_amount IS NULL OR NOT private.payment_foundation_amount_valid(v_amount) THEN
    RAISE EXCEPTION 'payable_now_unavailable';
  END IF;
  IF (state->>'payable_cap') IS NULL OR v_amount>(state->>'payable_cap')::numeric THEN
    RAISE EXCEPTION 'payable_now_exceeds_cap';
  END IF;
  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'payment_currency_unavailable';
  END IF;

  SELECT context_invoice_id INTO v_invoice
  FROM private.payment_foundation_context(p_request);

  v_snapshot:=jsonb_build_object(
    'source','phase6_authoritative_financial_state',
    'request_revision',r.payment_revision,
    'financial_state',state
  );
  IF octet_length(v_snapshot::text)>8192 THEN
    RAISE EXCEPTION 'obligation_snapshot_too_large';
  END IF;

  INSERT INTO public.payment_attempts(
    service_request_id,invoice_id,requested_amount,currency,provider,environment,
    idempotency_key,obligation_revision,obligation_snapshot,created_by
  )
  VALUES(
    p_request,v_invoice,v_amount,v_currency,p_provider,p_environment,
    p_key,r.payment_revision,v_snapshot,auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

CREATE FUNCTION private.payment_record_provider_event(
  p_provider text,
  p_environment text,
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
  e private.payment_provider_events%ROWTYPE;
  a public.payment_attempts%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.business_finance_settings WHERE id=true FOR SHARE;
  IF NOT FOUND OR NOT s.payment_domain_enabled OR NOT s.gateway_enabled THEN
    RAISE EXCEPTION 'gateway_not_enabled';
  END IF;
  IF s.gateway_provider IS DISTINCT FROM p_provider OR s.gateway_environment IS DISTINCT FROM p_environment THEN
    RAISE EXCEPTION 'gateway_configuration_mismatch';
  END IF;

  IF p_provider_event_id IS NULL OR p_provider_event_id<>btrim(p_provider_event_id) OR length(p_provider_event_id) NOT BETWEEN 1 AND 200
     OR p_event_type IS NULL OR p_event_type<>btrim(p_event_type) OR length(p_event_type) NOT BETWEEN 1 AND 100
     OR p_payload_hash IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$'
     OR p_safe_metadata IS NULL OR jsonb_typeof(p_safe_metadata)<>'object' OR octet_length(p_safe_metadata::text)>4096
     OR (p_provider_transaction_id IS NOT NULL AND (p_provider_transaction_id<>btrim(p_provider_transaction_id) OR length(p_provider_transaction_id) NOT BETWEEN 1 AND 200)) THEN
    RAISE EXCEPTION 'invalid_provider_event';
  END IF;

  IF p_payment_attempt_id IS NOT NULL THEN
    SELECT * INTO a FROM public.payment_attempts WHERE id=p_payment_attempt_id FOR SHARE;
    IF NOT FOUND OR a.provider IS DISTINCT FROM p_provider OR a.environment IS DISTINCT FROM p_environment THEN
      RAISE EXCEPTION 'provider_event_attempt_mismatch';
    END IF;
  END IF;

  INSERT INTO private.payment_provider_events(
    provider,environment,provider_event_id,event_type,payment_attempt_id,
    provider_transaction_id,payload_hash,safe_metadata
  )
  VALUES(
    p_provider,p_environment,p_provider_event_id,p_event_type,p_payment_attempt_id,
    p_provider_transaction_id,p_payload_hash,p_safe_metadata
  )
  ON CONFLICT(provider,environment,provider_event_id) DO NOTHING
  RETURNING * INTO e;

  IF FOUND THEN RETURN e.id; END IF;

  SELECT * INTO e
  FROM private.payment_provider_events
  WHERE provider=p_provider AND environment=p_environment AND provider_event_id=p_provider_event_id
  FOR SHARE;

  IF e.event_type IS DISTINCT FROM p_event_type
     OR e.payload_hash IS DISTINCT FROM p_payload_hash
     OR (p_payment_attempt_id IS NOT NULL AND e.payment_attempt_id IS NOT NULL AND e.payment_attempt_id IS DISTINCT FROM p_payment_attempt_id)
     OR (p_provider_transaction_id IS NOT NULL AND e.provider_transaction_id IS NOT NULL AND e.provider_transaction_id IS DISTINCT FROM p_provider_transaction_id) THEN
    RAISE EXCEPTION 'provider_event_identity_conflict';
  END IF;

  RETURN e.id;
END $$;

CREATE FUNCTION private.payment_apply_verified_provider_result(
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
DECLARE
  e private.payment_provider_events%ROWTYPE;
  a public.payment_attempts%ROWTYPE;
  r public.service_requests%ROWTYPE;
  state jsonb;
  v_match boolean:=false;
BEGIN
  SELECT * INTO e FROM private.payment_provider_events WHERE id=p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider_event_not_found'; END IF;
  IF e.processing_status NOT IN ('received','pending') THEN RETURN e.processing_status; END IF;
  IF e.payment_attempt_id IS NULL THEN RAISE EXCEPTION 'provider_event_attempt_required'; END IF;

  SELECT * INTO a FROM public.payment_attempts WHERE id=e.payment_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_attempt_not_found'; END IF;
  IF a.provider IS DISTINCT FROM e.provider OR a.environment IS DISTINCT FROM e.environment THEN
    RAISE EXCEPTION 'provider_event_attempt_mismatch';
  END IF;

  IF a.status='succeeded' THEN
    UPDATE private.payment_provider_events
    SET processing_status='already_succeeded',processed_at=now()
    WHERE id=e.id;
    RETURN 'already_succeeded';
  END IF;

  IF p_result='pending' THEN
    IF a.status='created' THEN
      PERFORM private.payment_transition_attempt(a.id,'pending',p_provider_transaction_id,NULL,NULL,NULL,NULL);
    ELSIF a.status<>'pending' THEN
      RAISE EXCEPTION 'attempt_not_pending_transitionable';
    END IF;
    UPDATE private.payment_provider_events
    SET processing_status='pending',
        provider_transaction_id=coalesce(provider_transaction_id,p_provider_transaction_id)
    WHERE id=e.id;
    RETURN 'pending';
  END IF;

  IF p_result IN ('failed','cancelled') THEN
    IF a.status NOT IN ('created','pending') THEN
      RAISE EXCEPTION 'attempt_not_terminal_transitionable';
    END IF;
    PERFORM private.payment_transition_attempt(a.id,p_result,p_provider_transaction_id,NULL,NULL,NULL,NULL);
    UPDATE public.payment_attempts SET failure_code=p_failure_code WHERE id=a.id;
    UPDATE private.payment_provider_events
    SET processing_status='terminal_applied',
        provider_transaction_id=coalesce(provider_transaction_id,p_provider_transaction_id),
        failure_code=p_failure_code,
        processed_at=now()
    WHERE id=e.id;
    RETURN 'terminal_applied';
  END IF;

  IF p_result<>'succeeded' THEN RAISE EXCEPTION 'invalid_provider_result'; END IF;
  IF p_provider_transaction_id IS NULL OR p_provider_transaction_id<>btrim(p_provider_transaction_id)
     OR length(p_provider_transaction_id) NOT BETWEEN 1 AND 200
     OR NOT private.payment_foundation_amount_valid(p_confirmed_amount)
     OR p_confirmed_currency IS NULL OR p_confirmed_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'invalid_provider_confirmation';
  END IF;

  SELECT * INTO r FROM public.service_requests WHERE id=a.service_request_id FOR SHARE;
  state:=private.payment_financial_state(a.service_request_id);
  v_match :=
    a.requested_amount IS NOT DISTINCT FROM p_confirmed_amount
    AND a.currency IS NOT DISTINCT FROM p_confirmed_currency
    AND r.payment_revision IS NOT DISTINCT FROM a.obligation_revision
    AND NOT coalesce((state->>'review_required')::boolean,true)
    AND NOT coalesce((state->>'reconciliation_required')::boolean,true);

  IF a.status='created' THEN
    PERFORM private.payment_transition_attempt(a.id,'pending',p_provider_transaction_id,NULL,NULL,NULL,NULL);
  END IF;

  IF a.status IN ('created','pending','failed','cancelled') THEN
    PERFORM private.payment_transition_attempt(
      a.id,'requires_reconciliation',p_provider_transaction_id,
      p_confirmed_amount,p_confirmed_currency,NULL,NULL
    );
  ELSIF a.status='requires_reconciliation' THEN
    IF a.provider_transaction_id IS DISTINCT FROM p_provider_transaction_id
       OR a.provider_confirmed_amount IS DISTINCT FROM p_confirmed_amount
       OR a.provider_confirmed_currency IS DISTINCT FROM p_confirmed_currency THEN
      RAISE EXCEPTION 'provider_confirmation_conflict';
    END IF;
  ELSE
    RAISE EXCEPTION 'attempt_not_confirmation_transitionable';
  END IF;

  UPDATE private.payment_provider_events
  SET processing_status=CASE WHEN v_match THEN 'ready_for_posting' ELSE 'reconciliation_required' END,
      provider_transaction_id=coalesce(provider_transaction_id,p_provider_transaction_id),
      processed_at=now()
  WHERE id=e.id;

  RETURN CASE WHEN v_match THEN 'ready_for_posting' ELSE 'reconciliation_required' END;
EXCEPTION WHEN OTHERS THEN
  IF p_event_id IS NOT NULL THEN
    UPDATE private.payment_provider_events
    SET processing_status='failed_processing',
        failure_code=left(SQLSTATE||':'||SQLERRM,100),
        processed_at=now()
    WHERE id=p_event_id AND processing_status IN ('received','pending');
  END IF;
  RAISE;
END $$;

REVOKE ALL ON FUNCTION private.payment_guard_provider_event() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_create_authoritative_attempt(uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_record_provider_event(text,text,text,text,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_apply_verified_provider_result(uuid,text,text,numeric,text,text) FROM PUBLIC,anon,authenticated,service_role;
