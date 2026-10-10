-- Migration 3 foundation only. No provider IO, ledger writes or domain activation.
-- Provider identity assumes one merchant account per provider/environment (M4 must revisit).
BEGIN;
CREATE TABLE public.payment_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 service_request_id uuid NOT NULL REFERENCES public.service_requests(id),
 invoice_id uuid REFERENCES public.invoices(id),
 requested_amount numeric(12,2) NOT NULL,
 currency text NOT NULL,
 provider text NOT NULL,
 environment text NOT NULL,
 status text NOT NULL DEFAULT 'created',
 idempotency_key text NOT NULL,
 provider_transaction_id text,
 obligation_revision bigint NOT NULL,
 obligation_snapshot jsonb NOT NULL,
 reservation_active boolean NOT NULL DEFAULT true,
 reservation_expires_at timestamptz,
 verified_at timestamptz,
 provider_confirmed_amount numeric(12,2),
 provider_confirmed_currency text,
 posted_at timestamptz,
 posted_request_payment_id uuid REFERENCES public.service_request_payments(id),
 posted_invoice_payment_id uuid REFERENCES public.invoice_payments(id),
 failure_code text,
 safe_metadata jsonb NOT NULL DEFAULT '{}',
 created_by uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT payment_attempts_amount_check CHECK(requested_amount>0 AND requested_amount NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
 CONSTRAINT payment_attempts_confirmed_amount_check CHECK(provider_confirmed_amount IS NULL OR (provider_confirmed_amount>0 AND provider_confirmed_amount NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric))),
 CONSTRAINT payment_attempts_currency_check CHECK(currency ~ '^[A-Z]{3}$' AND (provider_confirmed_currency IS NULL OR provider_confirmed_currency ~ '^[A-Z]{3}$')),
 CONSTRAINT payment_attempts_provider_check CHECK(length(btrim(provider)) BETWEEN 1 AND 100 AND provider=btrim(provider) AND environment IN ('test','live')),
 CONSTRAINT payment_attempts_key_check CHECK(length(idempotency_key) BETWEEN 1 AND 200 AND idempotency_key=btrim(idempotency_key) AND (provider_transaction_id IS NULL OR (length(provider_transaction_id) BETWEEN 1 AND 200 AND provider_transaction_id=btrim(provider_transaction_id)))),
 CONSTRAINT payment_attempts_status_check CHECK(status IN ('created','pending','requires_reconciliation','succeeded','failed','cancelled')),
 CONSTRAINT payment_attempts_snapshot_check CHECK(obligation_revision>=0 AND jsonb_typeof(obligation_snapshot)='object' AND octet_length(obligation_snapshot::text)<=8192),
 CONSTRAINT payment_attempts_metadata_check CHECK(jsonb_typeof(safe_metadata)='object' AND octet_length(safe_metadata::text)<=4096 AND (failure_code IS NULL OR length(failure_code)<=100)),
 CONSTRAINT payment_attempts_confirmation_check CHECK((verified_at IS NULL AND provider_confirmed_amount IS NULL AND provider_confirmed_currency IS NULL) OR (verified_at IS NOT NULL AND provider_transaction_id IS NOT NULL AND provider_confirmed_amount IS NOT NULL AND provider_confirmed_currency IS NOT NULL)),
 CONSTRAINT payment_attempts_reservation_check CHECK(reservation_active=(status IN ('created','pending'))),
 CONSTRAINT payment_attempts_posting_check CHECK(
  (status='succeeded' AND posted_at IS NOT NULL AND verified_at IS NOT NULL AND num_nonnulls(posted_request_payment_id,posted_invoice_payment_id)=1) OR
  (status<>'succeeded' AND posted_at IS NULL AND posted_request_payment_id IS NULL AND posted_invoice_payment_id IS NULL)),
 CONSTRAINT payment_attempts_reconciliation_check CHECK((verified_at IS NULL AND status NOT IN ('requires_reconciliation','succeeded')) OR (verified_at IS NOT NULL AND status IN ('requires_reconciliation','succeeded'))),
 UNIQUE(provider,environment,idempotency_key)
);
CREATE UNIQUE INDEX payment_attempts_provider_transaction_uidx ON public.payment_attempts(provider,environment,provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX payment_attempts_posted_request_uidx ON public.payment_attempts(posted_request_payment_id) WHERE posted_request_payment_id IS NOT NULL;
CREATE UNIQUE INDEX payment_attempts_posted_invoice_uidx ON public.payment_attempts(posted_invoice_payment_id) WHERE posted_invoice_payment_id IS NOT NULL;
CREATE INDEX payment_attempts_request_status_idx ON public.payment_attempts(service_request_id,status);
CREATE INDEX payment_attempts_invoice_idx ON public.payment_attempts(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX payment_attempts_created_by_idx ON public.payment_attempts(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX payment_attempts_active_reservation_idx ON public.payment_attempts(service_request_id,reservation_expires_at) WHERE reservation_active;

CREATE TABLE public.payment_refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 service_request_id uuid NOT NULL REFERENCES public.service_requests(id),
 invoice_id uuid REFERENCES public.invoices(id),
 origin_service_request_payment_id uuid REFERENCES public.service_request_payments(id),
 origin_invoice_payment_id uuid REFERENCES public.invoice_payments(id),
 amount numeric(12,2) NOT NULL,
 currency text NOT NULL,
 status text NOT NULL DEFAULT 'requested',
 reason text NOT NULL,
 note text NOT NULL DEFAULT '',
 provider text,
 provider_refund_id text,
 idempotency_key text NOT NULL,
 requested_by uuid NOT NULL REFERENCES public.profiles(id),
 requested_at timestamptz NOT NULL DEFAULT now(),
 approved_by uuid REFERENCES public.profiles(id),
 approved_at timestamptz,
 completed_at timestamptz,
 failure_code text,
 safe_metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT payment_refunds_origin_check CHECK(num_nonnulls(origin_service_request_payment_id,origin_invoice_payment_id)=1),
 CONSTRAINT payment_refunds_amount_check CHECK(amount>0 AND amount NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
 CONSTRAINT payment_refunds_currency_check CHECK(currency ~ '^[A-Z]{3}$'),
 CONSTRAINT payment_refunds_status_check CHECK(status IN ('requested','approved','pending','succeeded','failed','rejected','cancelled')),
 CONSTRAINT payment_refunds_text_check CHECK(length(btrim(reason)) BETWEEN 1 AND 500 AND length(note)<=2000 AND (failure_code IS NULL OR length(failure_code)<=100)),
 CONSTRAINT payment_refunds_key_check CHECK(length(idempotency_key) BETWEEN 1 AND 200 AND idempotency_key=btrim(idempotency_key)),
 CONSTRAINT payment_refunds_provider_check CHECK((provider IS NULL OR length(btrim(provider)) BETWEEN 1 AND 100) AND (provider_refund_id IS NULL OR (provider IS NOT NULL AND length(btrim(provider_refund_id)) BETWEEN 1 AND 200))),
 CONSTRAINT payment_refunds_metadata_check CHECK(jsonb_typeof(safe_metadata)='object' AND octet_length(safe_metadata::text)<=4096),
 CONSTRAINT payment_refunds_approval_check CHECK((approved_by IS NULL)=(approved_at IS NULL) AND (status NOT IN ('approved','pending','succeeded','failed') OR approved_by IS NOT NULL)),
 CONSTRAINT payment_refunds_completion_check CHECK((status='succeeded')=(completed_at IS NOT NULL)),
 UNIQUE(service_request_id,idempotency_key)
);
CREATE INDEX payment_refunds_request_status_idx ON public.payment_refunds(service_request_id,status);
CREATE INDEX payment_refunds_invoice_idx ON public.payment_refunds(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX payment_refunds_request_origin_idx ON public.payment_refunds(origin_service_request_payment_id,status) WHERE origin_service_request_payment_id IS NOT NULL;
CREATE INDEX payment_refunds_invoice_origin_idx ON public.payment_refunds(origin_invoice_payment_id,status) WHERE origin_invoice_payment_id IS NOT NULL;
CREATE INDEX payment_refunds_requested_by_idx ON public.payment_refunds(requested_by);
CREATE INDEX payment_refunds_approved_by_idx ON public.payment_refunds(approved_by) WHERE approved_by IS NOT NULL;
CREATE UNIQUE INDEX payment_refunds_provider_id_uidx ON public.payment_refunds(provider,provider_refund_id) WHERE provider_refund_id IS NOT NULL;

CREATE TABLE public.technician_collections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 service_request_id uuid NOT NULL REFERENCES public.service_requests(id),
 technician_id uuid NOT NULL REFERENCES public.technicians(id),
 collection_method text NOT NULL,
 amount numeric(12,2) NOT NULL,
 currency text NOT NULL,
 status text NOT NULL,
 note text NOT NULL DEFAULT '',
 collected_at timestamptz NOT NULL,
 recorded_by uuid NOT NULL REFERENCES public.profiles(id),
 verified_by uuid REFERENCES public.profiles(id),
 verified_at timestamptz,
 settled_by uuid REFERENCES public.profiles(id),
 settled_at timestamptz,
 voided_by uuid REFERENCES public.profiles(id),
 voided_at timestamptz,
 rejection_reason text,
 idempotency_key text NOT NULL,
 safe_metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT technician_collections_amount_check CHECK(amount>0 AND amount NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
 CONSTRAINT technician_collections_currency_check CHECK(currency ~ '^[A-Z]{3}$'),
 CONSTRAINT technician_collections_method_check CHECK(collection_method IN ('cash','bank_transfer','card','other')),
 CONSTRAINT technician_collections_state_check CHECK((collection_method='cash' AND status IN ('pending_settlement','settled','void_recorded')) OR (collection_method<>'cash' AND status IN ('pending_verification','verified','rejected'))),
 CONSTRAINT technician_collections_text_check CHECK(length(note)<=2000 AND (rejection_reason IS NULL OR length(rejection_reason) BETWEEN 1 AND 500)),
 CONSTRAINT technician_collections_key_check CHECK(length(idempotency_key) BETWEEN 1 AND 200 AND idempotency_key=btrim(idempotency_key)),
 CONSTRAINT technician_collections_metadata_check CHECK(jsonb_typeof(safe_metadata)='object' AND octet_length(safe_metadata::text)<=4096),
 CONSTRAINT technician_collections_actor_pairs_check CHECK((verified_by IS NULL)=(verified_at IS NULL) AND (settled_by IS NULL)=(settled_at IS NULL) AND (voided_by IS NULL)=(voided_at IS NULL)),
 CONSTRAINT technician_collections_decision_check CHECK(
  (status IN ('pending_settlement','pending_verification') AND verified_by IS NULL AND settled_by IS NULL AND voided_by IS NULL AND rejection_reason IS NULL) OR
  (status='verified' AND verified_by IS NOT NULL AND settled_by IS NULL AND voided_by IS NULL AND rejection_reason IS NULL) OR
  (status='rejected' AND verified_by IS NOT NULL AND rejection_reason IS NOT NULL AND settled_by IS NULL AND voided_by IS NULL) OR
  (status='settled' AND settled_by IS NOT NULL AND verified_by IS NULL AND voided_by IS NULL) OR
  (status='void_recorded' AND voided_by IS NOT NULL AND verified_by IS NULL AND settled_by IS NULL AND rejection_reason IS NOT NULL)),
 UNIQUE(technician_id,idempotency_key)
);
CREATE INDEX technician_collections_request_status_idx ON public.technician_collections(service_request_id,status);
CREATE INDEX technician_collections_technician_status_idx ON public.technician_collections(technician_id,status);
CREATE INDEX technician_collections_recorded_by_idx ON public.technician_collections(recorded_by);
CREATE INDEX technician_collections_verified_by_idx ON public.technician_collections(verified_by) WHERE verified_by IS NOT NULL;
CREATE INDEX technician_collections_settled_by_idx ON public.technician_collections(settled_by) WHERE settled_by IS NOT NULL;
CREATE INDEX technician_collections_voided_by_idx ON public.technician_collections(voided_by) WHERE voided_by IS NOT NULL;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_attempts FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_refunds FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.technician_collections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.technician_collections FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.payment_foundation_context(p_request uuid)
RETURNS TABLE(context_invoice_id uuid,context_currency text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 SELECT id,currency INTO context_invoice_id,context_currency FROM public.invoices WHERE service_request_id=p_request ORDER BY created_at DESC,id LIMIT 1 FOR SHARE;
 IF NOT FOUND THEN SELECT currency INTO context_currency FROM public.business_finance_settings WHERE id=true FOR SHARE; END IF;
 IF context_currency IS NULL OR context_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'payment_currency_unavailable'; END IF;
 RETURN NEXT;
END $$;
CREATE FUNCTION private.payment_foundation_amount_valid(p_amount numeric) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT p_amount IS NOT NULL AND p_amount>0 AND p_amount NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) AND p_amount<=9999999999.99 AND p_amount=round(p_amount,2)
$$;
CREATE FUNCTION private.payment_foundation_require_finance() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.current_user_has_role(ARRAY['admin_manager','super_admin']::public.app_role[]) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION private.payment_guard_attempt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_amount numeric; v_currency text; v_request uuid;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payment_attempt_delete_forbidden'; END IF;
 PERFORM 1 FROM public.service_requests WHERE id=NEW.service_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'service_request_not_found'; END IF;
 IF NEW.invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=NEW.invoice_id AND service_request_id=NEW.service_request_id) THEN RAISE EXCEPTION 'invoice_request_mismatch'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'created' OR NEW.provider_transaction_id IS NOT NULL OR NEW.verified_at IS NOT NULL THEN RAISE EXCEPTION 'invalid_initial_attempt'; END IF;
 ELSE
  IF OLD.status='succeeded' THEN RAISE EXCEPTION 'payment_attempt_is_immutable'; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','provider_transaction_id','verified_at','provider_confirmed_amount','provider_confirmed_currency','posted_at','posted_request_payment_id','posted_invoice_payment_id','reservation_active','failure_code','updated_at'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','provider_transaction_id','verified_at','provider_confirmed_amount','provider_confirmed_currency','posted_at','posted_request_payment_id','posted_invoice_payment_id','reservation_active','failure_code','updated_at']) THEN RAISE EXCEPTION 'payment_attempt_identity_is_immutable'; END IF;
  IF NOT ((OLD.status='created' AND NEW.status IN ('pending','failed','cancelled')) OR (OLD.status='pending' AND NEW.status IN ('succeeded','failed','cancelled','requires_reconciliation')) OR (OLD.status IN ('failed','cancelled') AND NEW.status IN ('succeeded','requires_reconciliation')) OR (OLD.status='requires_reconciliation' AND NEW.status='succeeded')) THEN RAISE EXCEPTION 'invalid_payment_attempt_transition'; END IF;
  IF OLD.provider_transaction_id IS NOT NULL AND NEW.provider_transaction_id IS DISTINCT FROM OLD.provider_transaction_id THEN RAISE EXCEPTION 'provider_identity_is_immutable'; END IF;
  IF OLD.verified_at IS NOT NULL AND ROW(NEW.verified_at,NEW.provider_confirmed_amount,NEW.provider_confirmed_currency) IS DISTINCT FROM ROW(OLD.verified_at,OLD.provider_confirmed_amount,OLD.provider_confirmed_currency) THEN RAISE EXCEPTION 'provider_confirmation_is_immutable'; END IF;
 END IF;
 -- Full XOR is enforced now, but reverse receipt provenance/creation is deferred to M4.
 IF NEW.status='succeeded' THEN
  IF NEW.posted_request_payment_id IS NOT NULL THEN
   SELECT service_request_id,amount INTO v_request,v_amount FROM public.service_request_payments WHERE id=NEW.posted_request_payment_id AND voided_at IS NULL FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'invalid_posted_receipt'; END IF;
   SELECT context_currency INTO v_currency FROM private.payment_foundation_context(v_request);
  ELSIF NEW.posted_invoice_payment_id IS NOT NULL THEN
   SELECT i.service_request_id,p.amount,i.currency INTO v_request,v_amount,v_currency FROM public.invoice_payments p JOIN public.invoices i ON i.id=p.invoice_id WHERE p.id=NEW.posted_invoice_payment_id AND p.voided_at IS NULL FOR SHARE OF p,i;
   IF NOT FOUND THEN RAISE EXCEPTION 'invalid_posted_receipt'; END IF;
  END IF;
  IF v_request IS DISTINCT FROM NEW.service_request_id OR v_amount IS DISTINCT FROM NEW.provider_confirmed_amount OR v_currency IS DISTINCT FROM NEW.provider_confirmed_currency THEN RAISE EXCEPTION 'posted_receipt_confirmation_mismatch'; END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $$;

CREATE FUNCTION private.payment_create_attempt(p_request uuid,p_amount numeric,p_provider text,p_environment text,p_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid; v_invoice uuid; v_currency text; v_revision bigint; v_snapshot jsonb;
BEGIN
 PERFORM 1 FROM public.service_requests WHERE id=p_request FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'service_request_not_found'; END IF;
 IF NOT private.payment_foundation_amount_valid(p_amount) THEN RAISE EXCEPTION 'invalid_attempt_amount'; END IF;
 SELECT context_invoice_id,context_currency INTO v_invoice,v_currency FROM private.payment_foundation_context(p_request);
 SELECT payment_revision,jsonb_build_object('source','m3_context_only','authoritative_charge_calculated',false,'request_revision',payment_revision,'invoice_id',v_invoice,'invoice_total',(SELECT total FROM public.invoices WHERE id=v_invoice),'invoice_status',(SELECT status FROM public.invoices WHERE id=v_invoice))
 INTO v_revision,v_snapshot FROM public.service_requests WHERE id=p_request;
 INSERT INTO public.payment_attempts(service_request_id,invoice_id,requested_amount,currency,provider,environment,idempotency_key,obligation_revision,obligation_snapshot,created_by)
 VALUES(p_request,v_invoice,p_amount,v_currency,p_provider,p_environment,p_key,v_revision,v_snapshot,auth.uid()) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
CREATE FUNCTION private.payment_transition_attempt(p_id uuid,p_status text,p_transaction text DEFAULT NULL,p_confirmed_amount numeric DEFAULT NULL,p_confirmed_currency text DEFAULT NULL,p_request_receipt uuid DEFAULT NULL,p_invoice_receipt uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_request uuid; v_old public.payment_attempts%ROWTYPE;
BEGIN
 SELECT service_request_id INTO v_request FROM public.payment_attempts WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'payment_attempt_not_found'; END IF;
 PERFORM 1 FROM public.service_requests WHERE id=v_request FOR UPDATE;
 SELECT * INTO v_old FROM public.payment_attempts WHERE id=p_id FOR UPDATE;
 IF p_confirmed_amount IS NOT NULL AND NOT private.payment_foundation_amount_valid(p_confirmed_amount) THEN RAISE EXCEPTION 'invalid_confirmed_amount'; END IF;
 UPDATE public.payment_attempts SET status=p_status,reservation_active=p_status IN ('created','pending'),
 provider_transaction_id=coalesce(p_transaction,v_old.provider_transaction_id),
 provider_confirmed_amount=coalesce(p_confirmed_amount,v_old.provider_confirmed_amount),provider_confirmed_currency=coalesce(p_confirmed_currency,v_old.provider_confirmed_currency),
 verified_at=CASE WHEN p_status IN ('requires_reconciliation','succeeded') THEN coalesce(v_old.verified_at,now()) ELSE v_old.verified_at END,
 posted_at=CASE WHEN p_status='succeeded' THEN now() ELSE NULL END,posted_request_payment_id=p_request_receipt,posted_invoice_payment_id=p_invoice_receipt
 WHERE id=p_id;
END $$;

CREATE FUNCTION private.payment_guard_refund() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_request uuid; v_amount numeric; v_currency text; v_voided timestamptz; v_invoice uuid; v_reserved numeric;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payment_refund_delete_forbidden'; END IF;
 PERFORM 1 FROM public.service_requests WHERE id=NEW.service_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'service_request_not_found'; END IF;
 IF num_nonnulls(NEW.origin_service_request_payment_id,NEW.origin_invoice_payment_id)<>1 THEN RAISE EXCEPTION 'refund_origin_xor_required'; END IF;
 IF NEW.origin_service_request_payment_id IS NOT NULL THEN
  SELECT service_request_id,amount,voided_at INTO v_request,v_amount,v_voided FROM public.service_request_payments WHERE id=NEW.origin_service_request_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'refund_origin_not_found'; END IF;
  SELECT i.id,i.currency INTO v_invoice,v_currency FROM public.service_request_payments r JOIN public.invoice_payments p ON p.id=r.transferred_invoice_payment_id JOIN public.invoices i ON i.id=p.invoice_id WHERE r.id=NEW.origin_service_request_payment_id FOR SHARE OF p,i;
  IF NOT FOUND THEN SELECT context_invoice_id,context_currency INTO v_invoice,v_currency FROM private.payment_foundation_context(v_request); END IF;
 ELSE
  SELECT i.service_request_id,p.amount,p.voided_at,i.id,i.currency INTO v_request,v_amount,v_voided,v_invoice,v_currency FROM public.invoice_payments p JOIN public.invoices i ON i.id=p.invoice_id WHERE p.id=NEW.origin_invoice_payment_id FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'refund_origin_not_found'; END IF;
  IF EXISTS(SELECT 1 FROM public.service_request_payments WHERE transferred_invoice_payment_id=NEW.origin_invoice_payment_id) THEN RAISE EXCEPTION 'refund_requires_canonical_request_payment'; END IF;
 END IF;
 IF v_request IS DISTINCT FROM NEW.service_request_id OR v_voided IS NOT NULL THEN RAISE EXCEPTION 'invalid_or_voided_refund_origin'; END IF;
 IF NEW.currency IS DISTINCT FROM v_currency THEN RAISE EXCEPTION 'refund_currency_mismatch'; END IF;
 IF NEW.invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=NEW.invoice_id AND service_request_id=NEW.service_request_id) THEN RAISE EXCEPTION 'invoice_request_mismatch'; END IF;
 IF NEW.amount>v_amount THEN RAISE EXCEPTION 'refund_exceeds_original_payment'; END IF;
 IF TG_OP='INSERT' THEN
  PERFORM private.payment_foundation_require_finance();
  IF NEW.status<>'requested' OR NEW.requested_by IS DISTINCT FROM auth.uid() OR NEW.approved_by IS NOT NULL THEN RAISE EXCEPTION 'invalid_initial_refund'; END IF;
 ELSE
  IF OLD.status IN ('succeeded','rejected','cancelled','failed') THEN RAISE EXCEPTION 'payment_refund_is_immutable'; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','approved_by','approved_at','completed_at','provider_refund_id','failure_code','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','approved_by','approved_at','completed_at','provider_refund_id','failure_code','updated_at']) THEN RAISE EXCEPTION 'refund_identity_is_immutable'; END IF;
  IF NOT ((OLD.status='requested' AND NEW.status IN ('approved','rejected','cancelled')) OR (OLD.status='approved' AND NEW.status IN ('pending','cancelled')) OR (OLD.status='pending' AND NEW.status IN ('succeeded','failed'))) THEN RAISE EXCEPTION 'invalid_refund_transition'; END IF;
  IF OLD.status='requested' OR NEW.status='cancelled' THEN PERFORM private.payment_foundation_require_finance(); END IF;
  IF NEW.status='approved' AND (NEW.approved_by IS DISTINCT FROM auth.uid() OR NEW.approved_at IS NULL) THEN RAISE EXCEPTION 'invalid_refund_approver'; END IF;
  IF OLD.approved_by IS NOT NULL AND ROW(NEW.approved_by,NEW.approved_at) IS DISTINCT FROM ROW(OLD.approved_by,OLD.approved_at) THEN RAISE EXCEPTION 'refund_approval_is_immutable'; END IF;
  IF OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id THEN RAISE EXCEPTION 'refund_provider_identity_is_immutable'; END IF;
 END IF;
 IF NEW.status IN ('approved','pending','succeeded') THEN
  SELECT coalesce(sum(amount),0) INTO v_reserved FROM public.payment_refunds WHERE id<>NEW.id AND status IN ('approved','pending','succeeded') AND
   ((NEW.origin_service_request_payment_id IS NOT NULL AND origin_service_request_payment_id=NEW.origin_service_request_payment_id) OR (NEW.origin_invoice_payment_id IS NOT NULL AND origin_invoice_payment_id=NEW.origin_invoice_payment_id));
  IF v_reserved+NEW.amount>v_amount THEN RAISE EXCEPTION 'refund_reservation_exceeds_original_payment'; END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $$;

CREATE FUNCTION public.finance_request_refund(p_service_request_id uuid,p_origin_service_request_payment_id uuid,p_origin_invoice_payment_id uuid,p_amount numeric,p_reason text,p_idempotency_key text,p_note text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid; v_invoice uuid; v_currency text; v_request uuid;
BEGIN
 PERFORM private.payment_foundation_require_finance();
 PERFORM 1 FROM public.service_requests WHERE id=p_service_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'service_request_not_found'; END IF;
 IF NOT private.payment_foundation_amount_valid(p_amount) THEN RAISE EXCEPTION 'invalid_refund_amount'; END IF;
 IF num_nonnulls(p_origin_service_request_payment_id,p_origin_invoice_payment_id)<>1 THEN RAISE EXCEPTION 'refund_origin_xor_required'; END IF;
 SELECT context_invoice_id,context_currency INTO v_invoice,v_currency FROM private.payment_foundation_context(p_service_request_id);
 IF p_origin_invoice_payment_id IS NOT NULL THEN
  SELECT i.id,i.currency,i.service_request_id INTO v_invoice,v_currency,v_request FROM public.invoice_payments p JOIN public.invoices i ON i.id=p.invoice_id WHERE p.id=p_origin_invoice_payment_id;
  IF v_request IS DISTINCT FROM p_service_request_id THEN RAISE EXCEPTION 'invalid_or_voided_refund_origin'; END IF;
 END IF;
 INSERT INTO public.payment_refunds(service_request_id,invoice_id,origin_service_request_payment_id,origin_invoice_payment_id,amount,currency,reason,note,idempotency_key,requested_by)
 VALUES(p_service_request_id,v_invoice,p_origin_service_request_payment_id,p_origin_invoice_payment_id,p_amount,v_currency,p_reason,coalesce(p_note,''),p_idempotency_key,auth.uid()) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
CREATE FUNCTION public.finance_decide_refund(p_refund_id uuid,p_decision text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_request uuid;
BEGIN
 PERFORM private.payment_foundation_require_finance();
 IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected','cancelled') THEN RAISE EXCEPTION 'invalid_refund_decision'; END IF;
 SELECT service_request_id INTO v_request FROM public.payment_refunds WHERE id=p_refund_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'refund_not_found'; END IF;
 PERFORM 1 FROM public.service_requests WHERE id=v_request FOR UPDATE;
 UPDATE public.payment_refunds SET status=p_decision,approved_by=CASE WHEN p_decision='approved' THEN auth.uid() ELSE approved_by END,approved_at=CASE WHEN p_decision='approved' THEN now() ELSE approved_at END WHERE id=p_refund_id;
END $$;
CREATE FUNCTION private.payment_transition_refund(p_refund_id uuid,p_status text,p_provider_refund_id text DEFAULT NULL,p_failure_code text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_request uuid;
BEGIN
 IF p_status IS NULL OR p_status NOT IN ('pending','succeeded','failed') THEN RAISE EXCEPTION 'invalid_internal_refund_transition'; END IF;
 SELECT service_request_id INTO v_request FROM public.payment_refunds WHERE id=p_refund_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'refund_not_found'; END IF;
 PERFORM 1 FROM public.service_requests WHERE id=v_request FOR UPDATE;
 UPDATE public.payment_refunds SET status=p_status,provider_refund_id=p_provider_refund_id,failure_code=p_failure_code,completed_at=CASE WHEN p_status='succeeded' THEN now() ELSE NULL END WHERE id=p_refund_id;
END $$;

CREATE FUNCTION private.payment_guard_collection() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_profile uuid; v_currency text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'technician_collection_delete_forbidden'; END IF;
 PERFORM 1 FROM public.service_requests WHERE id=NEW.service_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'service_request_not_found'; END IF;
 SELECT profile_id INTO v_profile FROM public.technicians WHERE id=NEW.technician_id AND is_active;
 IF TG_OP='INSERT' THEN
  IF auth.uid() IS NULL OR NOT public.current_user_has_role(ARRAY['technician']::public.app_role[]) OR v_profile IS DISTINCT FROM auth.uid() OR NEW.recorded_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.service_request_assignments WHERE service_request_id=NEW.service_request_id AND technician_id=NEW.technician_id AND status='accepted' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'accepted_assignment_not_found'; END IF;
  SELECT context_currency INTO v_currency FROM private.payment_foundation_context(NEW.service_request_id);
  IF NEW.currency IS DISTINCT FROM v_currency THEN RAISE EXCEPTION 'collection_currency_mismatch'; END IF;
  IF NEW.status IS DISTINCT FROM (CASE WHEN NEW.collection_method='cash' THEN 'pending_settlement' ELSE 'pending_verification' END) THEN RAISE EXCEPTION 'invalid_initial_collection'; END IF;
 ELSE
  PERFORM private.payment_foundation_require_finance();
  IF OLD.recorded_by=auth.uid() THEN RAISE EXCEPTION 'collection_self_decision_forbidden'; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','verified_by','verified_at','settled_by','settled_at','voided_by','voided_at','rejection_reason','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','verified_by','verified_at','settled_by','settled_at','voided_by','voided_at','rejection_reason','updated_at']) THEN RAISE EXCEPTION 'collection_identity_is_immutable'; END IF;
  -- Cash settlement is explicitly blocked in M3. Migration 6 will provide provenance.
  IF NOT ((OLD.status='pending_settlement' AND NEW.status='void_recorded') OR (OLD.status='pending_verification' AND NEW.status IN ('verified','rejected'))) THEN RAISE EXCEPTION 'invalid_collection_transition'; END IF;
  IF NEW.status IN ('verified','rejected') AND (NEW.verified_by IS DISTINCT FROM auth.uid() OR NEW.verified_at IS NULL) THEN RAISE EXCEPTION 'invalid_collection_verifier'; END IF;
  IF NEW.status='void_recorded' AND (NEW.voided_by IS DISTINCT FROM auth.uid() OR NEW.voided_at IS NULL) THEN RAISE EXCEPTION 'invalid_collection_void_actor'; END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE FUNCTION public.technician_record_collection(p_service_request_id uuid,p_method text,p_amount numeric,p_idempotency_key text,p_note text DEFAULT '',p_collected_at timestamptz DEFAULT now())
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_tech uuid; v_currency text; v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.current_user_has_role(ARRAY['technician']::public.app_role[]) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501'; END IF;
 SELECT id INTO v_tech FROM public.technicians WHERE profile_id=auth.uid() AND is_active;
 IF v_tech IS NULL THEN RAISE EXCEPTION 'technician_not_found'; END IF;
 PERFORM 1 FROM public.service_requests WHERE id=p_service_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'service_request_not_found'; END IF;
 IF NOT private.payment_foundation_amount_valid(p_amount) THEN RAISE EXCEPTION 'invalid_collection_amount'; END IF;
 IF p_method IS NULL OR p_method NOT IN ('cash','bank_transfer','card','other') OR p_collected_at IS NULL OR p_collected_at>now() THEN RAISE EXCEPTION 'invalid_collection_method_or_time'; END IF;
 SELECT context_currency INTO v_currency FROM private.payment_foundation_context(p_service_request_id);
 INSERT INTO public.technician_collections(service_request_id,technician_id,collection_method,amount,currency,status,note,collected_at,recorded_by,idempotency_key)
 VALUES(p_service_request_id,v_tech,p_method,p_amount,v_currency,CASE WHEN p_method='cash' THEN 'pending_settlement' ELSE 'pending_verification' END,coalesce(p_note,''),p_collected_at,auth.uid(),p_idempotency_key) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
CREATE FUNCTION public.finance_verify_technician_collection(p_collection_id uuid,p_verify boolean,p_rejection_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_request uuid;
BEGIN
 PERFORM private.payment_foundation_require_finance();
 IF p_verify IS NULL OR (NOT p_verify AND nullif(btrim(p_rejection_reason),'') IS NULL) THEN RAISE EXCEPTION 'invalid_collection_decision'; END IF;
 SELECT service_request_id INTO v_request FROM public.technician_collections WHERE id=p_collection_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'collection_not_found'; END IF;
 PERFORM 1 FROM public.service_requests WHERE id=v_request FOR UPDATE;
 UPDATE public.technician_collections SET status=CASE WHEN p_verify THEN 'verified' ELSE 'rejected' END,verified_by=auth.uid(),verified_at=now(),rejection_reason=CASE WHEN p_verify THEN NULL ELSE btrim(p_rejection_reason) END WHERE id=p_collection_id;
END $$;
CREATE FUNCTION public.finance_void_technician_collection_record(p_collection_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_request uuid;
BEGIN
 PERFORM private.payment_foundation_require_finance();
 IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'collection_void_reason_required'; END IF;
 SELECT service_request_id INTO v_request FROM public.technician_collections WHERE id=p_collection_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'collection_not_found'; END IF;
 PERFORM 1 FROM public.service_requests WHERE id=v_request FOR UPDATE;
 UPDATE public.technician_collections SET status='void_recorded',voided_by=auth.uid(),voided_at=now(),rejection_reason=btrim(p_reason) WHERE id=p_collection_id;
END $$;
CREATE FUNCTION private.payment_audit_foundation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_event text; v_invoice uuid;
BEGIN
 IF TG_TABLE_NAME='payment_attempts' THEN
  v_event:=CASE WHEN TG_OP='INSERT' THEN 'payment_attempt_created' ELSE 'payment_attempt_status_changed' END;v_invoice:=NEW.invoice_id;
 ELSIF TG_TABLE_NAME='payment_refunds' THEN
  v_event:='payment_refund_'||NEW.status;v_invoice:=NEW.invoice_id;
 ELSE
  v_event:='technician_collection_'||CASE WHEN TG_OP='INSERT' THEN 'recorded' ELSE NEW.status END;v_invoice:=NULL;
 END IF;
 PERFORM private.payment_write_audit_event(v_event,TG_TABLE_NAME,NEW.id,NEW.service_request_id,v_invoice,
  jsonb_build_object('status',NEW.status,'amount',CASE WHEN TG_TABLE_NAME='payment_attempts' THEN to_jsonb(NEW)->'requested_amount' ELSE to_jsonb(NEW)->'amount' END,'currency',NEW.currency,'previous_status',CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)->'status' ELSE NULL END));
 RETURN NEW;
END $$;
CREATE TRIGGER payment_attempts_guard BEFORE INSERT OR UPDATE OR DELETE ON public.payment_attempts FOR EACH ROW EXECUTE FUNCTION private.payment_guard_attempt();
CREATE TRIGGER payment_attempts_audit AFTER INSERT OR UPDATE ON public.payment_attempts FOR EACH ROW EXECUTE FUNCTION private.payment_audit_foundation();
CREATE TRIGGER payment_refunds_guard BEFORE INSERT OR UPDATE OR DELETE ON public.payment_refunds FOR EACH ROW EXECUTE FUNCTION private.payment_guard_refund();
CREATE TRIGGER payment_refunds_audit AFTER INSERT OR UPDATE ON public.payment_refunds FOR EACH ROW EXECUTE FUNCTION private.payment_audit_foundation();
CREATE TRIGGER technician_collections_guard BEFORE INSERT OR UPDATE OR DELETE ON public.technician_collections FOR EACH ROW EXECUTE FUNCTION private.payment_guard_collection();
CREATE TRIGGER technician_collections_audit AFTER INSERT OR UPDATE ON public.technician_collections FOR EACH ROW EXECUTE FUNCTION private.payment_audit_foundation();
REVOKE ALL ON FUNCTION private.payment_foundation_context(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_foundation_amount_valid(numeric) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_foundation_require_finance() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_guard_attempt() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_create_attempt(uuid,numeric,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_transition_attempt(uuid,text,text,numeric,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_guard_refund() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.finance_request_refund(uuid,uuid,uuid,numeric,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finance_request_refund(uuid,uuid,uuid,numeric,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.finance_decide_refund(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finance_decide_refund(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION private.payment_transition_refund(uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_guard_collection() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.technician_record_collection(uuid,text,numeric,text,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.technician_record_collection(uuid,text,numeric,text,text,timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.finance_verify_technician_collection(uuid,boolean,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finance_verify_technician_collection(uuid,boolean,text) TO authenticated;
REVOKE ALL ON FUNCTION public.finance_void_technician_collection_record(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finance_void_technician_collection_record(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION private.payment_audit_foundation() FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX payment_attempts_status_created_idx ON public.payment_attempts(status,created_at);
CREATE INDEX payment_refunds_status_requested_idx ON public.payment_refunds(status,requested_at);
CREATE INDEX technician_collections_status_created_idx ON public.technician_collections(status,created_at);
COMMIT;
