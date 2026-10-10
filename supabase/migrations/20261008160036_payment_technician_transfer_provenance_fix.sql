CREATE OR REPLACE FUNCTION private.payment_guard_receipt_provenance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_request uuid; v_currency text; a public.payment_attempts%ROWTYPE; origin public.service_request_payments%ROWTYPE; tc public.technician_collections%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.payment_attempt_id IS NOT NULL OR OLD.technician_collection_id IS NOT NULL OR OLD.idempotency_key IS NOT NULL OR OLD.obligation_snapshot IS NOT NULL THEN RAISE EXCEPTION 'receipt_provenance_delete_forbidden'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  -- No provenance retrofit on legacy rows; neither history nor source can be rewritten.
  IF ROW(NEW.payment_attempt_id,NEW.technician_collection_id,NEW.idempotency_key,NEW.obligation_snapshot) IS DISTINCT FROM ROW(OLD.payment_attempt_id,OLD.technician_collection_id,OLD.idempotency_key,OLD.obligation_snapshot) THEN RAISE EXCEPTION 'receipt_provenance_is_immutable'; END IF;
  IF OLD.payment_attempt_id IS NOT NULL OR OLD.technician_collection_id IS NOT NULL THEN
   IF (to_jsonb(NEW)-ARRAY['voided_at','voided_by','transferred_invoice_payment_id','transferred_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['voided_at','voided_by','transferred_invoice_payment_id','transferred_at']) THEN RAISE EXCEPTION 'domain_receipt_is_immutable'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.technician_collection_id IS NOT NULL THEN
  PERFORM private.payment_foundation_require_finance();
  IF NEW.payment_attempt_id IS NOT NULL THEN RAISE EXCEPTION 'receipt_source_xor'; END IF;
  IF TG_TABLE_NAME='service_request_payments' THEN v_request:=NEW.service_request_id; ELSE SELECT service_request_id,currency INTO v_request,v_currency FROM public.invoices WHERE id=NEW.invoice_id; END IF;
  PERFORM 1 FROM public.service_requests WHERE id=v_request FOR UPDATE;
  SELECT * INTO tc FROM public.technician_collections WHERE id=NEW.technician_collection_id FOR UPDATE;
  IF NOT FOUND OR tc.service_request_id IS DISTINCT FROM v_request OR tc.recorded_by=auth.uid() THEN RAISE EXCEPTION 'invalid_collection_receipt_origin'; END IF;
  IF v_currency IS NULL THEN SELECT context_currency INTO v_currency FROM private.payment_foundation_context(v_request); END IF;
  IF tc.amount IS DISTINCT FROM NEW.amount OR tc.currency IS DISTINCT FROM v_currency OR tc.collection_method IS DISTINCT FROM NEW.method OR NEW.voided_at IS NOT NULL OR NEW.obligation_snapshot IS NULL THEN RAISE EXCEPTION 'collection_receipt_mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM public.service_request_payments WHERE technician_collection_id=tc.id) OR EXISTS(SELECT 1 FROM public.invoice_payments WHERE technician_collection_id=tc.id) THEN
   IF TG_TABLE_NAME<>'invoice_payments' THEN RAISE EXCEPTION 'collection_already_posted'; END IF;
   SELECT * INTO origin FROM public.service_request_payments WHERE technician_collection_id=tc.id;
   IF NOT FOUND OR EXISTS(SELECT 1 FROM public.invoice_payments WHERE technician_collection_id=tc.id) OR origin.transferred_invoice_payment_id IS NOT NULL OR origin.voided_at IS NOT NULL OR ROW(NEW.amount,NEW.method,NEW.paid_at,NEW.recorded_by,NEW.obligation_snapshot) IS DISTINCT FROM ROW(origin.amount,origin.method,origin.paid_at,origin.recorded_by,origin.obligation_snapshot) OR NEW.idempotency_key IS NOT NULL THEN RAISE EXCEPTION 'invalid_collection_transfer_alias'; END IF;
  ELSE
   IF NEW.idempotency_key IS NULL THEN RAISE EXCEPTION 'collection_receipt_mismatch'; END IF;
   IF NOT ((tc.collection_method='cash' AND tc.status='pending_settlement') OR (tc.collection_method<>'cash' AND tc.status='verified')) THEN RAISE EXCEPTION 'collection_not_ready_for_posting'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.payment_attempt_id IS NULL THEN
  IF NEW.idempotency_key IS NOT NULL OR NEW.obligation_snapshot IS NOT NULL THEN RAISE EXCEPTION 'receipt_source_required'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='service_request_payments' THEN v_request:=NEW.service_request_id;
 ELSE SELECT service_request_id,currency INTO v_request,v_currency FROM public.invoices WHERE id=NEW.invoice_id; END IF;
 PERFORM 1 FROM public.service_requests WHERE id=v_request FOR UPDATE;
 SELECT * INTO a FROM public.payment_attempts WHERE id=NEW.payment_attempt_id FOR UPDATE;
 IF NOT FOUND OR a.service_request_id IS DISTINCT FROM v_request THEN RAISE EXCEPTION 'receipt_request_mismatch'; END IF;
 IF a.verified_at IS NULL OR a.provider_transaction_id IS NULL THEN RAISE EXCEPTION 'attempt_not_verified'; END IF;
 IF NEW.amount IS DISTINCT FROM a.provider_confirmed_amount THEN RAISE EXCEPTION 'receipt_amount_mismatch'; END IF;
 IF v_currency IS NULL THEN SELECT context_currency INTO v_currency FROM private.payment_foundation_context(v_request); END IF;
 IF v_currency IS DISTINCT FROM a.provider_confirmed_currency THEN RAISE EXCEPTION 'receipt_currency_mismatch'; END IF;
 IF NEW.idempotency_key IS NULL OR NEW.obligation_snapshot IS DISTINCT FROM a.obligation_snapshot OR NEW.method<>'card' OR NEW.voided_at IS NOT NULL THEN RAISE EXCEPTION 'invalid_attempt_receipt_provenance'; END IF;
 IF a.status='requires_reconciliation' THEN
  IF EXISTS(SELECT 1 FROM public.service_request_payments WHERE payment_attempt_id=a.id) OR EXISTS(SELECT 1 FROM public.invoice_payments WHERE payment_attempt_id=a.id) THEN RAISE EXCEPTION 'attempt_already_has_receipt'; END IF;
 ELSIF a.status='succeeded' AND TG_TABLE_NAME='invoice_payments' AND a.posted_request_payment_id IS NOT NULL THEN
  SELECT * INTO origin FROM public.service_request_payments WHERE id=a.posted_request_payment_id AND payment_attempt_id=a.id FOR SHARE;
  IF NOT FOUND OR origin.voided_at IS NOT NULL OR origin.transferred_invoice_payment_id IS NOT NULL OR NEW.idempotency_key IS DISTINCT FROM 'transfer:'||origin.id::text OR ROW(NEW.amount,NEW.method,NEW.paid_at,NEW.recorded_by) IS DISTINCT FROM ROW(origin.amount,origin.method,origin.paid_at,origin.recorded_by) THEN RAISE EXCEPTION 'invalid_transfer_provenance_alias'; END IF;
 ELSE RAISE EXCEPTION 'attempt_requires_reconciliation_before_posting'; END IF;
 RETURN NEW;
END $function$
;
