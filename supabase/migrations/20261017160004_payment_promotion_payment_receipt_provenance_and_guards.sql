-- M4: receipt provenance only. No gateway integration or technician posting.
ALTER TABLE public.service_request_payments
 ADD COLUMN idempotency_key text NULL,
 ADD COLUMN payment_attempt_id uuid NULL REFERENCES public.payment_attempts(id),
 ADD COLUMN technician_collection_id uuid NULL REFERENCES public.technician_collections(id),
 ADD COLUMN obligation_snapshot jsonb NULL,
 ADD CONSTRAINT service_request_payments_source_xor CHECK (num_nonnulls(payment_attempt_id,technician_collection_id)<=1),
 ADD CONSTRAINT service_request_payments_provenance_key CHECK (idempotency_key IS NULL OR (idempotency_key=btrim(idempotency_key) AND length(idempotency_key) BETWEEN 1 AND 300)),
 ADD CONSTRAINT service_request_payments_snapshot_object CHECK (obligation_snapshot IS NULL OR (jsonb_typeof(obligation_snapshot)='object' AND octet_length(obligation_snapshot::text)<=8192));
CREATE UNIQUE INDEX service_request_payments_idempotency_uidx ON public.service_request_payments(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX service_request_payments_attempt_uidx ON public.service_request_payments(payment_attempt_id) WHERE payment_attempt_id IS NOT NULL;
CREATE UNIQUE INDEX service_request_payments_collection_uidx ON public.service_request_payments(technician_collection_id) WHERE technician_collection_id IS NOT NULL;
ALTER TABLE public.invoice_payments
 ADD COLUMN idempotency_key text NULL,
 ADD COLUMN payment_attempt_id uuid NULL REFERENCES public.payment_attempts(id),
 ADD COLUMN technician_collection_id uuid NULL REFERENCES public.technician_collections(id),
 ADD COLUMN obligation_snapshot jsonb NULL,
 ADD CONSTRAINT invoice_payments_source_xor CHECK (num_nonnulls(payment_attempt_id,technician_collection_id)<=1),
 ADD CONSTRAINT invoice_payments_provenance_key CHECK (idempotency_key IS NULL OR (idempotency_key=btrim(idempotency_key) AND length(idempotency_key) BETWEEN 1 AND 300)),
 ADD CONSTRAINT invoice_payments_snapshot_object CHECK (obligation_snapshot IS NULL OR (jsonb_typeof(obligation_snapshot)='object' AND octet_length(obligation_snapshot::text)<=8192));
CREATE UNIQUE INDEX invoice_payments_idempotency_uidx ON public.invoice_payments(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX invoice_payments_attempt_uidx ON public.invoice_payments(payment_attempt_id) WHERE payment_attempt_id IS NOT NULL;
CREATE UNIQUE INDEX invoice_payments_collection_uidx ON public.invoice_payments(technician_collection_id) WHERE technician_collection_id IS NOT NULL;
CREATE OR REPLACE FUNCTION private.payment_guard_attempt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 -- M4: success requires a verified reconciliation state and reverse provenance.
 IF NEW.status='succeeded' AND (TG_OP<>'UPDATE' OR OLD.status<>'requires_reconciliation') THEN RAISE EXCEPTION 'attempt_requires_reconciliation_before_posting'; END IF;
 IF NEW.status='succeeded' THEN
  IF NEW.posted_request_payment_id IS NOT NULL THEN
   SELECT service_request_id,amount INTO v_request,v_amount FROM public.service_request_payments WHERE id=NEW.posted_request_payment_id AND voided_at IS NULL AND payment_attempt_id=NEW.id FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'invalid_posted_receipt'; END IF;
   SELECT context_currency INTO v_currency FROM private.payment_foundation_context(v_request);
  ELSIF NEW.posted_invoice_payment_id IS NOT NULL THEN
   SELECT i.service_request_id,p.amount,i.currency INTO v_request,v_amount,v_currency FROM public.invoice_payments p JOIN public.invoices i ON i.id=p.invoice_id WHERE p.id=NEW.posted_invoice_payment_id AND p.voided_at IS NULL AND p.payment_attempt_id=NEW.id AND NOT EXISTS(SELECT 1 FROM public.service_request_payments rp WHERE rp.payment_attempt_id=NEW.id) FOR SHARE OF p,i;
   IF NOT FOUND THEN RAISE EXCEPTION 'invalid_posted_receipt'; END IF;
  END IF;
  IF v_request IS DISTINCT FROM NEW.service_request_id OR v_amount IS DISTINCT FROM NEW.provider_confirmed_amount OR v_currency IS DISTINCT FROM NEW.provider_confirmed_currency THEN RAISE EXCEPTION 'posted_receipt_confirmation_mismatch'; END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $function$
;

CREATE FUNCTION private.payment_guard_receipt_provenance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_request uuid; v_currency text; a public.payment_attempts%ROWTYPE; origin public.service_request_payments%ROWTYPE;
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
 IF NEW.technician_collection_id IS NOT NULL THEN RAISE EXCEPTION 'technician_receipt_posting_deferred'; END IF;
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
END $$;

-- Deferred cross-table guard closes INSERT/attempt-pointer atomicity without session flags.
CREATE FUNCTION private.payment_check_receipt_reverse_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.payment_attempts%ROWTYPE; v_id uuid; v_source uuid;
BEGIN
 IF NEW.payment_attempt_id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO a FROM public.payment_attempts WHERE id=NEW.payment_attempt_id;
 IF a.status IS DISTINCT FROM 'succeeded' THEN RAISE EXCEPTION 'receipt_attempt_not_posted'; END IF;
 IF TG_TABLE_NAME='service_request_payments' THEN
  IF a.posted_request_payment_id IS DISTINCT FROM NEW.id OR a.posted_invoice_payment_id IS NOT NULL THEN RAISE EXCEPTION 'receipt_reverse_link_mismatch'; END IF;
  SELECT transferred_invoice_payment_id INTO v_id FROM public.service_request_payments WHERE id=NEW.id;
  IF v_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.invoice_payments WHERE id=v_id AND payment_attempt_id=a.id AND obligation_snapshot=NEW.obligation_snapshot) THEN RAISE EXCEPTION 'transfer_reverse_link_mismatch'; END IF;
 ELSE
  IF a.posted_invoice_payment_id=NEW.id AND a.posted_request_payment_id IS NULL THEN RETURN NULL; END IF;
  SELECT transferred_invoice_payment_id INTO v_id FROM public.service_request_payments WHERE id=a.posted_request_payment_id AND payment_attempt_id=a.id;
  IF v_id IS DISTINCT FROM NEW.id OR a.posted_invoice_payment_id IS NOT NULL THEN RAISE EXCEPTION 'transfer_reverse_link_mismatch'; END IF;
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION private.payment_post_verified_attempt(p_attempt_id uuid,p_idempotency_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.payment_attempts%ROWTYPE; r public.service_requests%ROWTYPE; bill public.invoices%ROWTYPE;
 v_request uuid; v_currency text; v_receipt uuid; v_key text; received numeric; untransferred numeric; existing_key text;
BEGIN
 IF p_idempotency_key IS NULL OR p_idempotency_key<>btrim(p_idempotency_key) OR length(p_idempotency_key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid_receipt_idempotency_key'; END IF;
 SELECT service_request_id INTO v_request FROM public.payment_attempts WHERE id=p_attempt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'payment_attempt_not_found'; END IF;
 SELECT * INTO r FROM public.service_requests WHERE id=v_request FOR UPDATE;
 SELECT * INTO a FROM public.payment_attempts WHERE id=p_attempt_id FOR UPDATE;
 v_key:='attempt:'||a.id::text||':'||p_idempotency_key;
 IF a.status='succeeded' THEN
  IF a.posted_request_payment_id IS NOT NULL THEN SELECT id,idempotency_key INTO v_receipt,existing_key FROM public.service_request_payments WHERE id=a.posted_request_payment_id AND payment_attempt_id=a.id;
  ELSE SELECT id,idempotency_key INTO v_receipt,existing_key FROM public.invoice_payments WHERE id=a.posted_invoice_payment_id AND payment_attempt_id=a.id; END IF;
  IF v_receipt IS NULL OR existing_key IS DISTINCT FROM v_key THEN RAISE EXCEPTION 'attempt_already_posted_with_different_key'; END IF;
  RETURN v_receipt;
 END IF;
 IF a.status<>'requires_reconciliation' OR a.verified_at IS NULL OR a.provider_transaction_id IS NULL THEN RAISE EXCEPTION 'attempt_not_ready_for_posting'; END IF;
 IF a.created_by IS NULL THEN RAISE EXCEPTION 'receipt_recorder_unavailable'; END IF;
 SELECT * INTO bill FROM public.invoices WHERE service_request_id=v_request AND status='issued' ORDER BY created_at DESC,id LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  v_currency:=bill.currency;
  SELECT coalesce(sum(amount),0) INTO received FROM public.invoice_payments WHERE invoice_id=bill.id AND voided_at IS NULL;
  IF received+a.provider_confirmed_amount>bill.total THEN RAISE EXCEPTION 'payment_exceeds_balance'; END IF;
  IF v_currency IS DISTINCT FROM a.provider_confirmed_currency THEN RAISE EXCEPTION 'receipt_currency_mismatch'; END IF;
  INSERT INTO public.invoice_payments(invoice_id,amount,method,note,recorded_by,idempotency_key,payment_attempt_id,obligation_snapshot)
  VALUES(bill.id,a.provider_confirmed_amount,'card','Payment attempt: '||a.id::text,a.created_by,v_key,a.id,a.obligation_snapshot) RETURNING id INTO v_receipt;
  PERFORM private.payment_transition_attempt(a.id,'succeeded',NULL,NULL,NULL,NULL,v_receipt);
  IF received+a.provider_confirmed_amount=bill.total THEN UPDATE public.invoices SET paid_at=now() WHERE id=bill.id; END IF;
  PERFORM private.payment_write_audit_event('payment_attempt_posted_to_invoice_payment','payment_attempt',a.id,v_request,bill.id,jsonb_build_object('receipt_id',v_receipt,'amount',a.provider_confirmed_amount,'currency',v_currency));
 ELSE
  IF r.workflow_stage IN ('cancelled','customer_cancelled') THEN RAISE EXCEPTION 'request_not_open_for_preinvoice_payment'; END IF;
  SELECT context_currency INTO v_currency FROM private.payment_foundation_context(v_request);
  IF v_currency IS DISTINCT FROM a.provider_confirmed_currency THEN RAISE EXCEPTION 'receipt_currency_mismatch'; END IF;
  IF r.workflow_stage='completed' THEN
   SELECT * INTO bill FROM public.invoices WHERE service_request_id=v_request AND status='draft' ORDER BY created_at DESC,id LIMIT 1 FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'completed_request_invoice_draft_required'; END IF;
   SELECT coalesce(sum(amount),0) INTO received FROM public.invoice_payments WHERE invoice_id=bill.id AND voided_at IS NULL;
   SELECT coalesce(sum(amount),0) INTO untransferred FROM public.service_request_payments WHERE service_request_id=v_request AND voided_at IS NULL AND transferred_invoice_payment_id IS NULL;
   IF round(received+untransferred+a.provider_confirmed_amount,2)>bill.total THEN RAISE EXCEPTION 'payment_exceeds_invoice_remaining'; END IF;
  END IF;
  INSERT INTO public.service_request_payments(service_request_id,payment_type,amount,method,note,recorded_by,idempotency_key,payment_attempt_id,obligation_snapshot)
  VALUES(v_request,'advance',a.provider_confirmed_amount,'card','Payment attempt: '||a.id::text,a.created_by,v_key,a.id,a.obligation_snapshot) RETURNING id INTO v_receipt;
  PERFORM private.payment_transition_attempt(a.id,'succeeded',NULL,NULL,NULL,v_receipt,NULL);
  PERFORM private.payment_write_audit_event('payment_attempt_posted_to_request_payment','payment_attempt',a.id,v_request,bill.id,jsonb_build_object('receipt_id',v_receipt,'amount',a.provider_confirmed_amount,'currency',v_currency));
  IF r.workflow_stage='completed' THEN PERFORM private.finance_transfer_request_payments_to_invoice(bill.id,v_request); END IF;
 END IF;
 RETURN v_receipt;
END $$;
CREATE OR REPLACE FUNCTION private.finance_transfer_request_payments_to_invoice(p_invoice_id uuid, p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  request_payment public.service_request_payments%rowtype;
  new_invoice_payment_id uuid;
  current_received numeric(12,2);
  invoice_total numeric(12,2);
begin
  select total
  into invoice_total
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found';
  end if;

  select coalesce(sum(amount), 0)
  into current_received
  from public.invoice_payments
  where invoice_id = p_invoice_id
    and voided_at is null;

  for request_payment in
    select *
    from public.service_request_payments
    where service_request_id = p_request_id
      and voided_at is null
      and transferred_invoice_payment_id is null
    order by paid_at, created_at, id
    for update
  loop
    if current_received + request_payment.amount > invoice_total then
      raise exception 'preinvoice_payments_exceed_invoice_total';
    end if;

    insert into public.invoice_payments (
      invoice_id,
      amount,
      method,
      note,
      paid_at,
      recorded_by,
      payment_attempt_id,
      technician_collection_id,
      obligation_snapshot,
      idempotency_key
    )
    values (
      p_invoice_id,
      request_payment.amount,
      request_payment.method,
      left(
        trim(
          concat(
            case request_payment.payment_type
              when 'visit_fee' then 'رسوم زيارة'
              when 'deposit' then 'عربون'
              when 'advance' then 'دفعة مقدمة'
              else 'دفعة قبل الفاتورة'
            end,
            case
              when nullif(trim(request_payment.note), '') is not null
                then ' - ' || trim(request_payment.note)
              else ''
            end
          )
        ),
        500
      ),
      request_payment.paid_at,
      request_payment.recorded_by,
      request_payment.payment_attempt_id,
      request_payment.technician_collection_id,
      request_payment.obligation_snapshot,
      CASE WHEN request_payment.payment_attempt_id IS NOT NULL THEN 'transfer:'||request_payment.id::text ELSE NULL END
    )
    returning id into new_invoice_payment_id;

    update public.service_request_payments
    set
      transferred_invoice_payment_id = new_invoice_payment_id,
      transferred_at = now()
    where id = request_payment.id;

    IF request_payment.payment_attempt_id IS NOT NULL THEN
      PERFORM private.payment_write_audit_event('payment_receipt_provenance_transferred','service_request_payment',request_payment.id,p_request_id,p_invoice_id,jsonb_build_object('payment_attempt_id',request_payment.payment_attempt_id,'invoice_payment_id',new_invoice_payment_id));
    END IF;

    current_received :=
      current_received + request_payment.amount;
  end loop;

  if current_received = invoice_total then
    update public.invoices
    set
      paid_at = coalesce(paid_at, now()),
      updated_at = now()
    where id = p_invoice_id;
  else
    update public.invoices
    set
      paid_at = null,
      updated_at = now()
    where id = p_invoice_id;
  end if;
end;
$function$
;
CREATE TRIGGER service_request_payments_provenance_guard BEFORE INSERT OR UPDATE OR DELETE ON public.service_request_payments FOR EACH ROW EXECUTE FUNCTION private.payment_guard_receipt_provenance();
CREATE CONSTRAINT TRIGGER service_request_payments_reverse_link AFTER INSERT OR UPDATE ON public.service_request_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.payment_check_receipt_reverse_link();
CREATE TRIGGER invoice_payments_provenance_guard BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_payments FOR EACH ROW EXECUTE FUNCTION private.payment_guard_receipt_provenance();
CREATE CONSTRAINT TRIGGER invoice_payments_reverse_link AFTER INSERT OR UPDATE ON public.invoice_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.payment_check_receipt_reverse_link();
REVOKE ALL ON FUNCTION private.payment_guard_receipt_provenance() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_check_receipt_reverse_link() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_post_verified_attempt(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
-- Existing receipt RLS/grants and manual RPC definitions are unchanged.
