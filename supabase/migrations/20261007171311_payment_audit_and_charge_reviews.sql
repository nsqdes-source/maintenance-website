-- Migration 2: audit and charge reviews only; no activation or ledger changes.
BEGIN;
CREATE TABLE public.finance_charge_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 service_request_id uuid NOT NULL REFERENCES public.service_requests(id),
 invoice_id uuid REFERENCES public.invoices(id),
 status text NOT NULL DEFAULT 'proposed',
 final_charge numeric(12,2) NOT NULL,
 currency text NOT NULL,
 reason text NOT NULL,
 note text NOT NULL DEFAULT '',
 supersedes_review_id uuid REFERENCES public.finance_charge_reviews(id),
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 decided_by uuid REFERENCES public.profiles(id),
 decided_at timestamptz,
 decision_note text NOT NULL DEFAULT '',
 CONSTRAINT finance_charge_reviews_status_check CHECK (status IN ('proposed','approved','rejected')),
 CONSTRAINT finance_charge_reviews_amount_check CHECK (final_charge >= 0 AND final_charge NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
 CONSTRAINT finance_charge_reviews_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
 CONSTRAINT finance_charge_reviews_reason_check CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
 CONSTRAINT finance_charge_reviews_notes_check CHECK (length(note)<=2000 AND length(decision_note)<=2000),
 CONSTRAINT finance_charge_reviews_self_check CHECK (supersedes_review_id IS DISTINCT FROM id),
 CONSTRAINT finance_charge_reviews_decision_check CHECK (
  (status='proposed' AND decided_by IS NULL AND decided_at IS NULL AND decision_note='') OR
  (status IN ('approved','rejected') AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE INDEX finance_charge_reviews_request_status_idx ON public.finance_charge_reviews(service_request_id,status);
CREATE INDEX finance_charge_reviews_invoice_idx ON public.finance_charge_reviews(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX finance_charge_reviews_supersedes_idx ON public.finance_charge_reviews(supersedes_review_id) WHERE supersedes_review_id IS NOT NULL;
CREATE INDEX finance_charge_reviews_created_by_idx ON public.finance_charge_reviews(created_by);
CREATE INDEX finance_charge_reviews_decided_by_idx ON public.finance_charge_reviews(decided_by) WHERE decided_by IS NOT NULL;
-- One approved root and one approved successor per node make an immutable chain.
CREATE UNIQUE INDEX finance_charge_reviews_approved_root_uidx ON public.finance_charge_reviews(service_request_id) WHERE status='approved' AND supersedes_review_id IS NULL;
CREATE UNIQUE INDEX finance_charge_reviews_approved_successor_uidx ON public.finance_charge_reviews(supersedes_review_id) WHERE status='approved' AND supersedes_review_id IS NOT NULL;
ALTER TABLE public.finance_charge_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_charge_reviews FROM PUBLIC,anon,authenticated,service_role;

-- Archival references intentionally have no FKs: audit must never cascade or change.
CREATE TABLE private.payment_audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 event_type text NOT NULL,
 entity_type text NOT NULL,
 entity_id uuid NOT NULL,
 service_request_id uuid,
 invoice_id uuid,
 actor_id uuid,
 actor_role text,
 details jsonb NOT NULL DEFAULT '{}',
 CONSTRAINT payment_audit_events_type_check CHECK (length(event_type) BETWEEN 1 AND 100 AND length(entity_type) BETWEEN 1 AND 100),
 CONSTRAINT payment_audit_events_details_check CHECK (jsonb_typeof(details)='object' AND octet_length(details::text)<=8192)
);
ALTER TABLE private.payment_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.payment_audit_events FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.payment_write_audit_event(
 p_event_type text,p_entity_type text,p_entity_id uuid,p_service_request_id uuid,
 p_invoice_id uuid,p_details jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid(); v_role text;
BEGIN
 SELECT role::text INTO v_role FROM public.profiles WHERE id=v_actor;
 INSERT INTO private.payment_audit_events(event_type,entity_type,entity_id,service_request_id,invoice_id,actor_id,actor_role,details)
 VALUES(p_event_type,p_entity_type,p_entity_id,p_service_request_id,p_invoice_id,v_actor,v_role,p_details);
END $$;

CREATE FUNCTION private.payment_audit_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'payment_audit_is_append_only'; END $$;
CREATE TRIGGER payment_audit_no_update_delete BEFORE UPDATE OR DELETE ON private.payment_audit_events
FOR EACH ROW EXECUTE FUNCTION private.payment_audit_forbid_mutation();
CREATE TRIGGER payment_audit_no_truncate BEFORE TRUNCATE ON private.payment_audit_events
FOR EACH STATEMENT EXECUTE FUNCTION private.payment_audit_forbid_mutation();

CREATE FUNCTION private.finance_guard_charge_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_parent public.finance_charge_reviews%ROWTYPE; v_current uuid; v_currency text; v_request uuid;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'charge_review_delete_forbidden'; END IF;
 IF auth.uid() IS NULL OR NOT public.current_user_has_role(ARRAY['admin_manager','super_admin']::public.app_role[]) THEN
  RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501';
 END IF;
 -- RPCs acquire this lock before touching review rows; this also guards owner SQL.
 PERFORM 1 FROM public.service_requests WHERE id=NEW.service_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'service_request_not_found'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'proposed' OR NEW.created_by IS DISTINCT FROM auth.uid() OR NEW.decided_by IS NOT NULL OR NEW.decided_at IS NOT NULL OR NEW.decision_note<>'' THEN RAISE EXCEPTION 'invalid_initial_charge_review'; END IF;
  IF NEW.invoice_id IS NOT NULL THEN
   SELECT service_request_id,currency INTO v_request,v_currency FROM public.invoices WHERE id=NEW.invoice_id FOR SHARE;
   IF NOT FOUND OR v_request IS DISTINCT FROM NEW.service_request_id THEN RAISE EXCEPTION 'invoice_request_mismatch'; END IF;
  ELSE
   SELECT currency INTO v_currency FROM public.business_finance_settings WHERE id=true FOR SHARE;
  END IF;
  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'charge_review_currency_unavailable'; END IF;
  IF NEW.currency IS DISTINCT FROM v_currency THEN RAISE EXCEPTION 'charge_review_currency_mismatch'; END IF;
 ELSE
  IF OLD.status<>'proposed' THEN RAISE EXCEPTION 'charge_review_is_immutable'; END IF;
  IF ROW(NEW.id,NEW.service_request_id,NEW.invoice_id,NEW.final_charge,NEW.currency,NEW.reason,NEW.note,NEW.supersedes_review_id,NEW.created_by,NEW.created_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.service_request_id,OLD.invoice_id,OLD.final_charge,OLD.currency,OLD.reason,OLD.note,OLD.supersedes_review_id,OLD.created_by,OLD.created_at)
   THEN RAISE EXCEPTION 'charge_review_fields_are_immutable'; END IF;
  IF NEW.status NOT IN ('approved','rejected') OR NEW.decided_by IS DISTINCT FROM auth.uid() OR NEW.decided_at IS NULL THEN RAISE EXCEPTION 'invalid_charge_review_transition'; END IF;
 END IF;
 -- Historical supersession is checked on proposal and rechecked on approval.
 IF NEW.supersedes_review_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.status='approved') THEN
  SELECT * INTO v_parent FROM public.finance_charge_reviews WHERE id=NEW.supersedes_review_id;
  IF NOT FOUND OR v_parent.id=NEW.id OR v_parent.service_request_id<>NEW.service_request_id OR v_parent.status<>'approved' THEN RAISE EXCEPTION 'invalid_supersedes_review'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_charge_reviews WHERE supersedes_review_id=v_parent.id AND status='approved') THEN RAISE EXCEPTION 'superseded_review_not_current'; END IF;
 END IF;
 IF NEW.status='approved' THEN
  SELECT r.id INTO v_current FROM public.finance_charge_reviews r
  WHERE r.service_request_id=NEW.service_request_id AND r.status='approved'
   AND NOT EXISTS(SELECT 1 FROM public.finance_charge_reviews s WHERE s.supersedes_review_id=r.id AND s.status='approved');
  IF v_current IS NOT NULL AND NEW.supersedes_review_id IS NULL THEN RAISE EXCEPTION 'existing_approved_charge_review_requires_supersedes'; END IF;
  IF NEW.supersedes_review_id IS NOT NULL AND NEW.supersedes_review_id IS DISTINCT FROM v_current THEN RAISE EXCEPTION 'superseded_review_not_current'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_charge_reviews_guard BEFORE INSERT OR UPDATE OR DELETE ON public.finance_charge_reviews
FOR EACH ROW EXECUTE FUNCTION private.finance_guard_charge_review();

CREATE FUNCTION private.finance_audit_charge_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.payment_write_audit_event('finance_charge_review_'||NEW.status,'finance_charge_review',NEW.id,NEW.service_request_id,NEW.invoice_id,
  jsonb_build_object('final_charge',NEW.final_charge,'currency',NEW.currency,'reason',NEW.reason,'supersedes_review_id',NEW.supersedes_review_id,'invoice_id',NEW.invoice_id));
 RETURN NEW;
END $$;
CREATE TRIGGER finance_charge_reviews_audit AFTER INSERT OR UPDATE ON public.finance_charge_reviews
FOR EACH ROW EXECUTE FUNCTION private.finance_audit_charge_review();

CREATE FUNCTION public.finance_propose_charge_review(
 p_service_request_id uuid,p_final_charge numeric,p_reason text,p_note text DEFAULT '',p_supersedes_review_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_invoice uuid; v_currency text; v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.current_user_has_role(ARRAY['admin_manager','super_admin']::public.app_role[]) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.service_requests WHERE id=p_service_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'service_request_not_found'; END IF;
 IF p_final_charge IS NULL OR p_final_charge<0 OR p_final_charge IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) OR p_final_charge>9999999999.99 OR p_final_charge<>round(p_final_charge,2) THEN RAISE EXCEPTION 'invalid_final_charge'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 OR length(coalesce(p_note,''))>2000 THEN RAISE EXCEPTION 'invalid_charge_review_reason_or_note'; END IF;
 -- Existing baseline has one invoice per request; deterministic ordering also makes resolution explicit.
 SELECT id,currency INTO v_invoice,v_currency FROM public.invoices WHERE service_request_id=p_service_request_id ORDER BY created_at DESC,id LIMIT 1 FOR SHARE;
 IF NOT FOUND THEN SELECT currency INTO v_currency FROM public.business_finance_settings WHERE id=true FOR SHARE; END IF;
 IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'charge_review_currency_unavailable'; END IF;
 INSERT INTO public.finance_charge_reviews(service_request_id,invoice_id,final_charge,currency,reason,note,supersedes_review_id,created_by)
 VALUES(p_service_request_id,v_invoice,p_final_charge,v_currency,btrim(p_reason),coalesce(p_note,''),p_supersedes_review_id,auth.uid()) RETURNING id INTO v_id;
 RETURN v_id;
END $$;

CREATE FUNCTION public.finance_decide_charge_review(p_review_id uuid,p_approve boolean,p_decision_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_request uuid; v_status text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.current_user_has_role(ARRAY['admin_manager','super_admin']::public.app_role[]) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501'; END IF;
 IF p_approve IS NULL OR length(coalesce(p_decision_note,''))>2000 THEN RAISE EXCEPTION 'invalid_charge_review_decision'; END IF;
 -- Read immutable ownership without locking, then request FIRST, then review rows in UUID order.
 SELECT service_request_id INTO v_request FROM public.finance_charge_reviews WHERE id=p_review_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'charge_review_not_found'; END IF;
 PERFORM 1 FROM public.service_requests WHERE id=v_request FOR UPDATE;
 PERFORM 1 FROM public.finance_charge_reviews WHERE service_request_id=v_request ORDER BY id FOR UPDATE;
 SELECT status INTO v_status FROM public.finance_charge_reviews WHERE id=p_review_id;
 IF v_status IS DISTINCT FROM 'proposed' THEN RAISE EXCEPTION 'charge_review_not_proposed'; END IF;
 UPDATE public.finance_charge_reviews SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
 decided_by=auth.uid(),decided_at=now(),decision_note=coalesce(p_decision_note,'') WHERE id=p_review_id;
END $$;

REVOKE ALL ON FUNCTION private.payment_write_audit_event(text,text,uuid,uuid,uuid,jsonb),
 private.payment_audit_forbid_mutation(),private.finance_guard_charge_review(),private.finance_audit_charge_review()
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.finance_propose_charge_review(uuid,numeric,text,text,uuid),public.finance_decide_charge_review(uuid,boolean,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finance_propose_charge_review(uuid,numeric,text,text,uuid),public.finance_decide_charge_review(uuid,boolean,text) TO authenticated;
COMMIT;
