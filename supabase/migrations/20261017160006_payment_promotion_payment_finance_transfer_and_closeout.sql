-- M6: canonical request-level finance. Test-only apply target wsjmaojgjzxkmxywvcfy.
-- Legacy reporting/application integration remains deferred; feature gates stay false.
ALTER TABLE public.invoices
 ADD COLUMN financial_basis_type text,
 ADD COLUMN financial_basis_revision bigint,
 ADD COLUMN financial_basis_quote_id uuid REFERENCES public.service_request_quotes(id),
 ADD COLUMN financial_basis_charge_review_id uuid REFERENCES public.finance_charge_reviews(id),
 ADD CONSTRAINT invoices_financial_basis_check CHECK (coalesce((
 (financial_basis_type IS NULL AND financial_basis_revision IS NULL AND financial_basis_quote_id IS NULL AND financial_basis_charge_review_id IS NULL)
 OR (financial_basis_type='original_request' AND financial_basis_revision IS NOT NULL AND financial_basis_revision>=0 AND financial_basis_quote_id IS NULL AND financial_basis_charge_review_id IS NULL)
 OR (financial_basis_type='full_final_work_quote' AND financial_basis_revision IS NOT NULL AND financial_basis_revision>=0 AND financial_basis_quote_id IS NOT NULL AND financial_basis_charge_review_id IS NULL)
 OR (financial_basis_type='charge_review' AND financial_basis_charge_review_id IS NOT NULL AND financial_basis_quote_id IS NULL AND (financial_basis_revision IS NULL OR financial_basis_revision>=0))),false));
CREATE INDEX invoices_financial_basis_quote_idx ON public.invoices(financial_basis_quote_id) WHERE financial_basis_quote_id IS NOT NULL;
CREATE INDEX invoices_financial_basis_review_idx ON public.invoices(financial_basis_charge_review_id) WHERE financial_basis_charge_review_id IS NOT NULL;

CREATE FUNCTION private.payment_invoice_line_signature(p_invoice uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_array(description,quantity,unit_price) ORDER BY sort_order,id),'[]'::jsonb) FROM public.invoice_line_items WHERE invoice_id=p_invoice
$$;
CREATE FUNCTION private.payment_guard_invoice_basis() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.status<>'draft' AND ROW(NEW.financial_basis_type,NEW.financial_basis_revision,NEW.financial_basis_quote_id,NEW.financial_basis_charge_review_id) IS DISTINCT FROM ROW(OLD.financial_basis_type,OLD.financial_basis_revision,OLD.financial_basis_quote_id,OLD.financial_basis_charge_review_id) THEN RAISE EXCEPTION 'issued_financial_basis_is_immutable'; END IF;
 IF TG_OP='UPDATE' AND OLD.status='draft' AND ROW(NEW.total,NEW.subtotal,NEW.tax_rate,NEW.tax_amount,NEW.vat_registered,NEW.currency,NEW.service_request_id) IS DISTINCT FROM ROW(OLD.total,OLD.subtotal,OLD.tax_rate,OLD.tax_amount,OLD.vat_registered,OLD.currency,OLD.service_request_id) THEN
  NEW.financial_basis_type:=NULL; NEW.financial_basis_revision:=NULL; NEW.financial_basis_quote_id:=NULL; NEW.financial_basis_charge_review_id:=NULL;
 END IF;
 IF NEW.financial_basis_quote_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.service_request_quotes WHERE id=NEW.financial_basis_quote_id AND service_request_id=NEW.service_request_id AND status='approved' AND quote_basis='full_final_work' AND financial_revision=NEW.financial_basis_revision) THEN RAISE EXCEPTION 'invoice_quote_basis_mismatch'; END IF;
 IF NEW.financial_basis_charge_review_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_charge_reviews WHERE id=NEW.financial_basis_charge_review_id AND service_request_id=NEW.service_request_id AND status='approved') THEN RAISE EXCEPTION 'invoice_review_basis_mismatch'; END IF;
 IF NEW.financial_basis_type IS NOT NULL AND (TG_OP='INSERT' OR ROW(NEW.financial_basis_type,NEW.financial_basis_revision,NEW.financial_basis_quote_id,NEW.financial_basis_charge_review_id) IS DISTINCT FROM ROW(OLD.financial_basis_type,OLD.financial_basis_revision,OLD.financial_basis_quote_id,OLD.financial_basis_charge_review_id)) THEN
  IF NOT EXISTS(SELECT 1 FROM private.payment_audit_events WHERE event_type='invoice_financial_basis_seeded' AND entity_id=NEW.id AND details->>'basis_type'=NEW.financial_basis_type AND (details->>'revision')::bigint=NEW.financial_basis_revision AND details->'lines'=private.payment_invoice_line_signature(NEW.id) AND (details->>'total')::numeric=NEW.total AND created_at=now()) THEN RAISE EXCEPTION 'invoice_basis_requires_controlled_seed'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_guard_invoice_basis BEFORE INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION private.payment_guard_invoice_basis();
CREATE FUNCTION private.payment_invalidate_invoice_line_basis() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[];
BEGIN
 IF TG_OP='INSERT' THEN ids:=ARRAY[NEW.invoice_id]; ELSIF TG_OP='DELETE' THEN ids:=ARRAY[OLD.invoice_id];
 ELSE
  IF ROW(NEW.invoice_id,NEW.description,NEW.quantity,NEW.unit_price,NEW.sort_order) IS NOT DISTINCT FROM ROW(OLD.invoice_id,OLD.description,OLD.quantity,OLD.unit_price,OLD.sort_order) THEN RETURN NEW; END IF;
  ids:=ARRAY[OLD.invoice_id,NEW.invoice_id];
 END IF;
 UPDATE public.invoices SET financial_basis_type=NULL,financial_basis_revision=NULL,financial_basis_quote_id=NULL,financial_basis_charge_review_id=NULL WHERE id=ANY(ids) AND status='draft' AND financial_basis_type IS NOT NULL;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER payment_invalidate_invoice_line_basis AFTER INSERT OR UPDATE OR DELETE ON public.invoice_line_items FOR EACH ROW EXECUTE FUNCTION private.payment_invalidate_invoice_line_basis();
CREATE OR REPLACE FUNCTION private.finance_seed_invoice_from_approved_quote(p_invoice_id uuid, p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  quote_record public.service_request_quotes%rowtype;
  invoice_record public.invoices%rowtype;
  gross_total numeric(12,2);
  net_total numeric(12,2);
  vat_amount numeric(12,2);
  effective_tax_rate numeric(5,2);
  newly_seeded boolean; context_revision bigint; basis_type text;
begin
  SELECT payment_revision INTO context_revision FROM public.service_requests WHERE id=p_request_id FOR UPDATE;
  if not found then raise exception 'service_request_not_found'; end if;
  select *
  into invoice_record
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found';
  end if;

  IF invoice_record.service_request_id IS DISTINCT FROM p_request_id THEN RAISE EXCEPTION 'invoice_request_mismatch'; END IF;
  newly_seeded:=NOT EXISTS(SELECT 1 FROM public.invoice_line_items WHERE invoice_id=p_invoice_id);
  -- Seed lines only when the draft has no lines yet.
  if not exists (
    select 1
    from public.invoice_line_items
    where invoice_id = p_invoice_id
  ) then

    select *
    into quote_record
    from public.service_request_quotes
    where service_request_id = p_request_id
      and status = 'approved'
    order by decided_at desc nulls last, created_at desc
    limit 1;

    ----------------------------------------------------------------
    -- Path A: approved quote exists.
    ----------------------------------------------------------------
    if quote_record.id is not null then

      if jsonb_array_length(
        coalesce(quote_record.line_items, '[]'::jsonb)
      ) > 0 then

        insert into public.invoice_line_items (
          invoice_id,
          description,
          quantity,
          unit_price,
          sort_order
        )
        select
          p_invoice_id,
          trim(value->>'description'),
          (value->>'quantity')::numeric,
          (value->>'unit_price')::numeric,
          ordinality - 1
        from jsonb_array_elements(quote_record.line_items)
        with ordinality
        where (quote_record.quote_basis = 'full_final_work'
          and value->'excluded_from_final' = 'false'::jsonb)
        or (quote_record.quote_basis = 'legacy_as_approved' and not exists (
          select 1
          from public.service_catalog_services catalog_service
          where catalog_service.id::text = value->>'catalog_service_id'
            and catalog_service.is_visit_service = true
        ));

      else

        insert into public.invoice_line_items (
          invoice_id,
          description,
          quantity,
          unit_price,
          sort_order
        )
        select
          p_invoice_id,
          description,
          1,
          amount,
          sort_order
        from (
          values
            (
              coalesce(
                nullif(quote_record.parts_description, ''),
                'قطع وتعديلات'
              ),
              quote_record.parts_cost,
              0
            ),
            (
              'أجرة العمل',
              quote_record.labor_cost,
              1
            )
        ) as legacy_lines(
          description,
          amount,
          sort_order
        )
        where amount > 0;

      end if;

      -- Preserve old quote behavior if the approved quote has
      -- no priced lines.
      if not exists (
        select 1
        from public.invoice_line_items
        where invoice_id = p_invoice_id
      ) then
        insert into public.invoice_line_items (
          invoice_id,
          description,
          quantity,
          unit_price,
          sort_order
        )
        values (
          p_invoice_id,
          quote_record.description,
          1,
          0,
          0
        );
      end if;

      update public.invoices
      set
        work_summary = quote_record.description,
        description = quote_record.description
      where id = p_invoice_id
        and status = 'draft';

    ----------------------------------------------------------------
    -- Path B: no approved quote.
    -- Invoice from the customer's original selected services.
    ----------------------------------------------------------------
    else

      insert into public.invoice_line_items (
        invoice_id,
        description,
        quantity,
        unit_price,
        sort_order
      )
      select
        p_invoice_id,
        sri.service_name,
        sri.quantity,
        sri.gross_unit_price,
        row_number() over (
          order by sri.created_at, sri.id
        ) - 1
      from public.service_request_items sri
      where sri.service_request_id = p_request_id
        and sri.item_source = 'customer_request'
      order by sri.created_at, sri.id;

      if not exists (
        select 1
        from public.invoice_line_items
        where invoice_id = p_invoice_id
      ) then
        raise exception 'invoice_source_items_required';
      end if;

    end if;
  end if;

  ----------------------------------------------------------------
  -- Calculate invoice totals from VAT-inclusive line prices.
  ----------------------------------------------------------------
  select round(
    coalesce(sum(quantity * unit_price), 0),
    2
  )
  into gross_total
  from public.invoice_line_items
  where invoice_id = p_invoice_id;

  effective_tax_rate := invoice_record.tax_rate;

  -- Legacy drafts may have tax_rate = 0.
  if invoice_record.vat_registered
     and coalesce(effective_tax_rate, 0) <= 0 then

    select tax_rate
    into effective_tax_rate
    from public.business_finance_settings
    where id = true;

  end if;

  effective_tax_rate :=
    coalesce(effective_tax_rate, 0);

  if invoice_record.vat_registered
     and effective_tax_rate > 0 then

    net_total := round(
      gross_total / (1 + effective_tax_rate / 100),
      2
    );

    vat_amount := round(
      gross_total - net_total,
      2
    );

  else

    effective_tax_rate := 0;
    net_total := gross_total;
    vat_amount := 0;

  end if;

  update public.invoices
  set
    subtotal = net_total,
    tax_rate = effective_tax_rate,
    tax_amount = vat_amount,
    total = gross_total,
    updated_at = now()
  where id = p_invoice_id
    and status = 'draft';

IF newly_seeded AND invoice_record.status='draft' THEN
    IF quote_record.id IS NOT NULL AND quote_record.quote_basis='full_final_work' THEN basis_type:='full_final_work_quote'; context_revision:=quote_record.financial_revision;
    ELSIF quote_record.id IS NULL AND EXISTS(SELECT 1 FROM public.service_request_items WHERE service_request_id=p_request_id AND item_source='customer_request') AND NOT EXISTS(SELECT 1 FROM public.service_request_items WHERE service_request_id=p_request_id AND item_source='customer_request' AND (is_visit_service_snapshot IS NULL OR gross_total::text IN ('NaN','Infinity','-Infinity'))) THEN basis_type:='original_request'; END IF;
    IF basis_type IS NOT NULL THEN
      PERFORM private.payment_write_audit_event('invoice_financial_basis_seeded','invoice',p_invoice_id,p_request_id,p_invoice_id,jsonb_build_object('basis_type',basis_type,'revision',context_revision,'quote_id',CASE WHEN basis_type='full_final_work_quote' THEN quote_record.id END,'lines',private.payment_invoice_line_signature(p_invoice_id),'total',gross_total));
      UPDATE public.invoices SET financial_basis_type=basis_type,financial_basis_revision=context_revision,financial_basis_quote_id=CASE WHEN basis_type='full_final_work_quote' THEN quote_record.id END WHERE id=p_invoice_id;
    END IF;
  END IF;
end;
$function$
;

CREATE FUNCTION private.payment_invoice_basis_matches(p_invoice uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.invoices%ROWTYPE; q public.service_request_quotes%ROWTYPE; rev bigint;
BEGIN
 SELECT * INTO b FROM public.invoices WHERE id=p_invoice;
 IF NOT FOUND OR b.financial_basis_type IS NULL THEN RETURN false; END IF;
 SELECT payment_revision INTO rev FROM public.service_requests WHERE id=b.service_request_id;
 IF b.financial_basis_type='full_final_work_quote' THEN
  SELECT * INTO q FROM public.service_request_quotes WHERE id=b.financial_basis_quote_id AND service_request_id=b.service_request_id AND status='approved' AND quote_basis='full_final_work' AND financial_revision=b.financial_basis_revision;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.service_request_quotes WHERE service_request_id=b.service_request_id AND quote_basis='full_final_work' AND financial_revision>q.financial_revision AND status IN ('pending','approved')) THEN RETURN false; END IF;
  RETURN b.total=(SELECT coalesce(sum((v->>'gross_total')::numeric),0) FROM jsonb_array_elements(q.line_items) v WHERE v->'excluded_from_final'='false'::jsonb)
    AND private.payment_invoice_line_signature(b.id)=(SELECT coalesce(jsonb_agg(jsonb_build_array(btrim(v->>'description'),(v->>'quantity')::numeric,(v->>'unit_price')::numeric) ORDER BY ord),'[]'::jsonb) FROM jsonb_array_elements(q.line_items) WITH ORDINALITY AS x(v,ord) WHERE v->'excluded_from_final'='false'::jsonb);
 ELSIF b.financial_basis_type='original_request' THEN
  RETURN b.financial_basis_revision=rev AND NOT EXISTS(SELECT 1 FROM public.service_request_quotes WHERE service_request_id=b.service_request_id AND status='approved') AND b.total=(SELECT sum(gross_total) FROM public.service_request_items WHERE service_request_id=b.service_request_id AND item_source='customer_request') AND NOT EXISTS(SELECT 1 FROM public.service_request_items WHERE service_request_id=b.service_request_id AND item_source='customer_request' AND is_visit_service_snapshot IS NULL);
 ELSIF b.financial_basis_type='charge_review' THEN
  RETURN EXISTS(SELECT 1 FROM public.finance_charge_reviews c WHERE c.id=b.financial_basis_charge_review_id AND c.service_request_id=b.service_request_id AND c.status='approved' AND c.final_charge=b.total AND NOT EXISTS(SELECT 1 FROM public.finance_charge_reviews s WHERE s.supersedes_review_id=c.id AND s.status='approved'));
 END IF; RETURN false;
END $$;

CREATE FUNCTION private.payment_financial_state(p_service_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE r public.service_requests%ROWTYPE; b public.invoices%ROWTYPE; cr public.finance_charge_reviews%ROWTYPE; q public.service_request_quotes%ROWTYPE;
 c numeric; p numeric; f numeric; n numeric; h numeric; reserved numeric; paid numeric; remaining numeric; excess numeric; outstanding numeric; cap numeric; payable numeric;
 currency text; currencies text[]; source text; revision bigint; review boolean:=false; reconcile boolean:=false; unresolved boolean; state text; closure text; policy jsonb;
BEGIN
 SELECT * INTO r FROM public.service_requests WHERE id=p_service_request_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'service_request_not_found'; END IF;
 IF (SELECT count(*) FROM public.finance_charge_reviews a WHERE a.service_request_id=r.id AND a.status='approved' AND NOT EXISTS(SELECT 1 FROM public.finance_charge_reviews s WHERE s.supersedes_review_id=a.id AND s.status='approved'))>1 THEN RAISE EXCEPTION 'conflicting_current_charge_reviews'; END IF;
 SELECT * INTO cr FROM public.finance_charge_reviews a WHERE a.service_request_id=r.id AND a.status='approved' AND NOT EXISTS(SELECT 1 FROM public.finance_charge_reviews s WHERE s.supersedes_review_id=a.id AND s.status='approved');
 IF FOUND THEN c:=cr.final_charge; currency:=cr.currency; source:='charge_review'; revision:=r.payment_revision;
 ELSE
  SELECT * INTO b FROM public.invoices WHERE service_request_id=r.id AND status='issued';
  IF FOUND THEN c:=b.total;currency:=b.currency;source:='issued_invoice';revision:=b.financial_basis_revision;
  ELSE
   SELECT * INTO b FROM public.invoices WHERE service_request_id=r.id AND status='draft' AND private.payment_invoice_basis_matches(id);
   IF FOUND THEN c:=b.total;currency:=b.currency;source:='proven_draft_invoice';revision:=b.financial_basis_revision;
   ELSE
    SELECT * INTO q FROM public.service_request_quotes WHERE service_request_id=r.id AND status='approved' AND quote_basis='full_final_work' ORDER BY financial_revision DESC LIMIT 1;
    IF FOUND THEN
     IF NOT EXISTS(SELECT 1 FROM public.service_request_quotes WHERE service_request_id=r.id AND quote_basis='full_final_work' AND financial_revision>q.financial_revision AND status='pending') THEN
      SELECT sum((v->>'gross_total')::numeric) INTO c FROM jsonb_array_elements(q.line_items) v WHERE v->'excluded_from_final'='false'::jsonb;
      c:=coalesce(c,0);source:='full_final_work_quote';revision:=q.financial_revision;
     END IF;
    ELSE
     IF EXISTS(SELECT 1 FROM public.service_request_items WHERE service_request_id=r.id AND item_source='customer_request') AND NOT EXISTS(SELECT 1 FROM public.service_request_items WHERE service_request_id=r.id AND item_source='customer_request' AND (is_visit_service_snapshot IS NULL OR gross_total::text IN ('NaN','Infinity','-Infinity'))) AND NOT EXISTS(SELECT 1 FROM public.service_request_quotes WHERE service_request_id=r.id AND status='approved') THEN
      SELECT sum(gross_total) INTO c FROM public.service_request_items WHERE service_request_id=r.id AND item_source='customer_request';source:='original_request';revision:=r.payment_revision;
     END IF;
    END IF;
   END IF;
  END IF;
 END IF;
 -- Cancellation/rejection needs an explicit approved financial exception, never stage-derived pricing.
 IF cr.id IS NULL AND r.workflow_stage IN ('cancelled','customer_cancelled','customer_rejected') THEN c:=NULL;source:=NULL; END IF;
 SELECT coalesce(sum(x.amount),0) INTO p FROM (
  SELECT ip.amount FROM public.invoice_payments ip JOIN public.invoices i ON i.id=ip.invoice_id WHERE i.service_request_id=r.id AND ip.voided_at IS NULL
  UNION ALL SELECT amount FROM public.service_request_payments WHERE service_request_id=r.id AND voided_at IS NULL AND transferred_invoice_payment_id IS NULL
 ) x;
 SELECT coalesce(sum(amount),0) INTO f FROM public.payment_refunds WHERE service_request_id=r.id AND status='succeeded';n:=p-f;
 SELECT coalesce(sum(amount),0) INTO h FROM public.technician_collections WHERE service_request_id=r.id AND collection_method='cash' AND status='pending_settlement';
 SELECT coalesce(sum(v.amount),0) INTO reserved FROM (
  SELECT CASE WHEN status='requires_reconciliation' THEN provider_confirmed_amount ELSE requested_amount END AS amount FROM public.payment_attempts WHERE service_request_id=r.id AND ((status IN ('created','pending') AND reservation_active AND (reservation_expires_at IS NULL OR reservation_expires_at>now())) OR (status='requires_reconciliation' AND verified_at IS NOT NULL))
  UNION ALL SELECT amount FROM public.technician_collections WHERE service_request_id=r.id AND collection_method<>'cash' AND status='pending_verification'
 ) v;
 SELECT array_agg(DISTINCT v.currency) INTO currencies FROM (
  SELECT currency FROM public.invoices WHERE service_request_id=r.id AND status IN ('draft','issued')
  UNION ALL SELECT currency FROM public.payment_refunds WHERE service_request_id=r.id AND status IN ('approved','pending','succeeded')
  UNION ALL SELECT currency FROM public.technician_collections WHERE service_request_id=r.id AND status IN ('pending_settlement','pending_verification','verified','settled')
  UNION ALL SELECT coalesce(provider_confirmed_currency,currency) FROM public.payment_attempts WHERE service_request_id=r.id AND status IN ('created','pending','requires_reconciliation','succeeded')
  UNION ALL SELECT currency WHERE currency IS NOT NULL
 ) v;
 IF cardinality(currencies)>1 THEN RAISE EXCEPTION 'financial_currency_mismatch'; END IF;
 currency:=coalesce(currency,currencies[1]);
 IF currency IS NULL THEN SELECT s.currency INTO currency FROM public.business_finance_settings s WHERE id=true; END IF;
 IF currency IS NULL THEN review:=true; END IF;
 reconcile:=EXISTS(SELECT 1 FROM public.payment_attempts WHERE service_request_id=r.id AND status='requires_reconciliation') OR EXISTS(
  SELECT 1 FROM public.payment_attempts a LEFT JOIN public.service_request_payments rp ON rp.id=a.posted_request_payment_id LEFT JOIN public.invoice_payments ip ON ip.id=a.posted_invoice_payment_id WHERE a.service_request_id=r.id AND a.status='succeeded' AND ((a.posted_request_payment_id IS NOT NULL AND (rp.id IS NULL OR rp.voided_at IS NOT NULL)) OR (a.posted_invoice_payment_id IS NOT NULL AND (ip.id IS NULL OR ip.voided_at IS NOT NULL)))
 ) OR n<0 OR EXISTS(SELECT 1 FROM public.technician_collections tc WHERE tc.service_request_id=r.id AND tc.status='verified' AND NOT EXISTS(SELECT 1 FROM public.service_request_payments WHERE technician_collection_id=tc.id) AND NOT EXISTS(SELECT 1 FROM public.invoice_payments WHERE technician_collection_id=tc.id));
 unresolved:=EXISTS(SELECT 1 FROM public.payment_refunds WHERE service_request_id=r.id AND status IN ('approved','pending')) OR EXISTS(SELECT 1 FROM public.finance_charge_reviews WHERE service_request_id=r.id AND status='proposed') OR EXISTS(SELECT 1 FROM public.technician_collections WHERE service_request_id=r.id AND status='pending_verification');
 review:=review OR c IS NULL;
 paid:=n+h;
 IF c IS NOT NULL THEN remaining:=greatest(0,c-paid);excess:=greatest(0,paid-c);outstanding:=greatest(0,c-n);cap:=greatest(0,c-paid-reserved); END IF;
 policy:=r.payment_policy_snapshot->'policy';
 -- Minimal timing filter: deferred timing becomes payable only on its explicit evidence.
 IF NOT review AND NOT reconcile AND private.payment_policy_v1_is_valid(policy) THEN
  IF coalesce(r.payment_choice_timing,policy->>'original_timing') IN ('prepay','prepay_required') THEN payable:=cap;
  ELSIF coalesce(r.payment_choice_timing,policy->>'original_timing')='pay_on_arrival' AND r.inspection_confirmed_at IS NOT NULL THEN payable:=cap;
  ELSIF coalesce(r.payment_choice_timing,policy->>'original_timing')='pay_after_completion' AND r.workflow_stage='completed' THEN payable:=cap;
  END IF;
  IF payable IS NOT NULL AND q.id IS NOT NULL AND policy->>'additional_timing'='after_execution' AND r.workflow_stage<>'completed' THEN payable:=0; END IF;
 END IF;
 IF review THEN state:='review_required';ELSIF excess>0 THEN state:='excess_refund_due';ELSIF remaining=0 THEN state:='paid';ELSIF paid=0 THEN state:='unpaid';ELSE state:='partially_paid';END IF;
 closure:=CASE WHEN NOT review AND NOT reconcile AND NOT unresolved AND remaining=0 AND excess=0 AND h=0 AND reserved=0 THEN 'ready_to_close' ELSE 'open' END;
 RETURN jsonb_build_object('service_request_id',r.id,'currency',currency,'authoritative_charge',c,'charge_source',source,'charge_revision',revision,'gross_receipts',p,'succeeded_refunds',f,'net_receipts',n,'technician_cash_custody',h,'reserved_amount',reserved,'customer_net_paid',paid,'remaining_contractual',remaining,'excess_refund_liability',excess,'institution_outstanding',outstanding,'payable_cap',cap,'payable_now',payable,'policy_supported',private.payment_policy_v1_is_valid(policy),'derived_payment_state',state,'financial_closure_state',closure,'review_required',review,'reconciliation_required',reconcile);
END $$;

CREATE FUNCTION private.payment_prove_resolved_untransferred(p_invoice uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.invoices%ROWTYPE; s jsonb; gross numeric; refunds numeric; origin_ids jsonb;
BEGIN
 SELECT * INTO b FROM public.invoices WHERE id=p_invoice;
 PERFORM 1 FROM public.service_requests WHERE id=b.service_request_id FOR UPDATE;
 SELECT * INTO b FROM public.invoices WHERE id=p_invoice FOR UPDATE;
 IF b.status<>'draft' OR NOT private.payment_invoice_basis_matches(b.id) THEN RAISE EXCEPTION 'preinvoice_payments_exceed_invoice_total'; END IF;
 PERFORM 1 FROM public.service_request_payments WHERE service_request_id=b.service_request_id ORDER BY id FOR UPDATE;
 s:=private.payment_financial_state(b.service_request_id);
 IF (s->>'authoritative_charge')::numeric IS DISTINCT FROM b.total OR (s->>'net_receipts')::numeric IS DISTINCT FROM b.total OR (s->>'remaining_contractual')::numeric<>0 OR (s->>'excess_refund_liability')::numeric<>0 OR (s->>'technician_cash_custody')::numeric<>0 OR (s->>'reserved_amount')::numeric<>0 OR (s->>'review_required')::boolean OR (s->>'reconciliation_required')::boolean OR s->>'currency' IS DISTINCT FROM b.currency THEN RAISE EXCEPTION 'preinvoice_payments_exceed_invoice_total'; END IF;
 IF EXISTS(SELECT 1 FROM public.invoice_payments p JOIN public.invoices i ON i.id=p.invoice_id WHERE i.service_request_id=b.service_request_id AND p.voided_at IS NULL) OR EXISTS(SELECT 1 FROM public.payment_refunds WHERE service_request_id=b.service_request_id AND status IN ('approved','pending')) OR EXISTS(SELECT 1 FROM public.finance_charge_reviews WHERE service_request_id=b.service_request_id AND status='proposed') OR EXISTS(SELECT 1 FROM public.technician_collections WHERE service_request_id=b.service_request_id AND status IN ('pending_settlement','pending_verification','verified')) THEN RAISE EXCEPTION 'preinvoice_payments_exceed_invoice_total'; END IF;
 IF EXISTS(SELECT 1 FROM public.payment_refunds f WHERE f.service_request_id=b.service_request_id AND f.status='succeeded' AND NOT EXISTS(SELECT 1 FROM public.service_request_payments rp WHERE rp.id=f.origin_service_request_payment_id AND rp.service_request_id=b.service_request_id AND rp.voided_at IS NULL AND rp.transferred_invoice_payment_id IS NULL)) THEN RAISE EXCEPTION 'refund_origin_not_in_canonical_set'; END IF;
 IF EXISTS(SELECT 1 FROM public.service_request_payments rp WHERE rp.service_request_id=b.service_request_id AND rp.voided_at IS NULL AND rp.transferred_invoice_payment_id IS NULL AND (SELECT coalesce(sum(amount),0) FROM public.payment_refunds WHERE origin_service_request_payment_id=rp.id AND status='succeeded')>rp.amount) THEN RAISE EXCEPTION 'refund_exceeds_canonical_origin'; END IF;
 SELECT sum(amount),jsonb_agg(id ORDER BY id) INTO gross,origin_ids FROM public.service_request_payments WHERE service_request_id=b.service_request_id AND voided_at IS NULL AND transferred_invoice_payment_id IS NULL;
 SELECT coalesce(sum(f.amount),0) INTO refunds FROM public.payment_refunds f JOIN public.service_request_payments rp ON rp.id=f.origin_service_request_payment_id WHERE rp.service_request_id=b.service_request_id AND rp.voided_at IS NULL AND rp.transferred_invoice_payment_id IS NULL AND f.status='succeeded';
 IF gross IS NULL OR gross<=b.total OR gross-refunds<>b.total OR gross-b.total<>refunds THEN RAISE EXCEPTION 'preinvoice_payments_exceed_invoice_total'; END IF;
 RETURN jsonb_build_object('invoice_id',b.id,'origin_ids',origin_ids,'gross_untransferred',gross,'succeeded_refunds',refunds,'net_receipts',gross-refunds,'invoice_total',b.total);
END $$;
CREATE OR REPLACE FUNCTION public.finance_set_invoice_status(p_invoice_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  bill public.invoices%rowtype;
  v_request uuid; gross numeric; existing numeric; proof jsonb;
begin
  if not public.current_user_has_role(
    array[
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  if p_status not in ('issued', 'void') then
    raise exception 'invalid_status';
  end if;

  SELECT service_request_id INTO v_request FROM public.invoices WHERE id=p_invoice_id;
  PERFORM 1 FROM public.service_requests WHERE id=v_request FOR UPDATE;
  select *
  into bill
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found';
  end if;

  if p_status = 'issued' then
    if bill.vat_registered then
      raise exception 'tax_invoicing_integration_required';
    end if;

    if bill.status <> 'draft' then
      raise exception 'invoice_not_draft';
    end if;

    if not exists (
      select 1
      from public.invoice_line_items
      where invoice_id = p_invoice_id
    ) then
      raise exception 'invoice_lines_required';
    end if;

    SELECT coalesce(sum(amount),0) INTO gross FROM public.service_request_payments WHERE service_request_id=bill.service_request_id AND voided_at IS NULL AND transferred_invoice_payment_id IS NULL;
    SELECT coalesce(sum(amount),0) INTO existing FROM public.invoice_payments WHERE invoice_id=bill.id AND voided_at IS NULL;
    IF existing+gross>bill.total THEN proof:=private.payment_prove_resolved_untransferred(bill.id); END IF;
    update public.invoices
    set
      status = 'issued',
      issued_at = now(),
      updated_at = now()
    where id = p_invoice_id;

    IF proof IS NULL THEN
      perform private.finance_transfer_request_payments_to_invoice(p_invoice_id,bill.service_request_id);
    ELSE
      PERFORM private.payment_write_audit_event('invoice_issued_with_untransferred_canonical_receipts','invoice',bill.id,bill.service_request_id,bill.id,proof);
    END IF;

  else
    if bill.status not in ('draft', 'issued') then
      raise exception 'invoice_not_active';
    end if;

    if exists (
      select 1
      from public.invoice_payments
      where invoice_id = p_invoice_id
        and voided_at is null
    ) then
      raise exception 'invoice_has_payments';
    end if;

    update public.invoices
    set
      status = 'void',
      issued_at = coalesce(issued_at, now()),
      paid_at = null,
      updated_at = now()
    where id = p_invoice_id;
  end if;
end;
$function$
;
CREATE FUNCTION private.payment_charge_review_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rev bigint;
BEGIN
 IF OLD.status='proposed' AND NEW.status='approved' THEN
  SELECT payment_revision INTO rev FROM public.service_requests WHERE id=NEW.service_request_id FOR UPDATE;
  PERFORM private.payment_write_audit_event('charge_review_revision_advanced','finance_charge_review',NEW.id,NEW.service_request_id,NEW.invoice_id,jsonb_build_object('previous_revision',rev,'revision',rev+1));
  UPDATE public.service_requests SET payment_revision=rev+1 WHERE id=NEW.service_request_id;
 END IF; RETURN NULL;
END $$;
CREATE TRIGGER payment_charge_review_revision AFTER UPDATE ON public.finance_charge_reviews FOR EACH ROW EXECUTE FUNCTION private.payment_charge_review_revision();
CREATE OR REPLACE FUNCTION private.payment_guard_workflow_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE amount numeric; inspection_first boolean:=false;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.inspection_confirmed_at IS NOT NULL OR NEW.inspection_confirmed_by IS NOT NULL OR NEW.inspection_earned_amount IS NOT NULL OR NEW.work_started_at IS NOT NULL OR NEW.work_started_basis IS NOT NULL THEN RAISE EXCEPTION 'workflow_evidence_requires_explicit_event'; END IF; RETURN NEW;
 END IF;
 IF OLD.inspection_confirmed_at IS NOT NULL THEN
  IF ROW(NEW.inspection_confirmed_at,NEW.inspection_confirmed_by,NEW.inspection_earned_amount) IS DISTINCT FROM ROW(OLD.inspection_confirmed_at,OLD.inspection_confirmed_by,OLD.inspection_earned_amount) THEN RAISE EXCEPTION 'inspection_evidence_is_immutable'; END IF;
 ELSIF ROW(NEW.inspection_confirmed_at,NEW.inspection_confirmed_by,NEW.inspection_earned_amount) IS DISTINCT FROM ROW(OLD.inspection_confirmed_at,OLD.inspection_confirmed_by,OLD.inspection_earned_amount) THEN
  PERFORM private.payment_require_assigned_technician(OLD.id);
  IF OLD.workflow_stage NOT IN ('in_progress','needs_followup','awaiting_admin_quote','awaiting_customer_approval','quote_approved','customer_rejected','awaiting_completion_review') THEN RAISE EXCEPTION 'request_not_open_for_inspection_confirmation'; END IF;
  amount:=private.payment_inspection_snapshot_amount(OLD.id);
  IF NEW.inspection_confirmed_at IS DISTINCT FROM now() OR NEW.inspection_confirmed_by IS DISTINCT FROM auth.uid() OR NEW.inspection_earned_amount IS DISTINCT FROM amount THEN RAISE EXCEPTION 'inspection_evidence_tampering'; END IF;
  inspection_first:=true;
 END IF;
 IF OLD.work_started_at IS NOT NULL THEN
  IF ROW(NEW.work_started_at,NEW.work_started_basis) IS DISTINCT FROM ROW(OLD.work_started_at,OLD.work_started_basis) THEN RAISE EXCEPTION 'work_start_evidence_is_immutable'; END IF;
 ELSIF ROW(NEW.work_started_at,NEW.work_started_basis) IS DISTINCT FROM ROW(OLD.work_started_at,OLD.work_started_basis) THEN
  PERFORM private.payment_require_assigned_technician(OLD.id);
  IF OLD.workflow_stage<>'in_progress' OR NEW.work_started_at IS DISTINCT FROM now() OR NEW.work_started_basis IS DISTINCT FROM 'technician_explicit_start' THEN RAISE EXCEPTION 'work_start_evidence_tampering'; END IF;
 END IF;
 IF NEW.payment_revision IS DISTINCT FROM OLD.payment_revision THEN
  IF NEW.payment_revision<>OLD.payment_revision+1 OR NOT (inspection_first OR EXISTS(SELECT 1 FROM public.service_request_quotes WHERE service_request_id=OLD.id AND quote_basis='full_final_work' AND financial_revision=NEW.payment_revision) OR EXISTS(SELECT 1 FROM private.payment_audit_events e JOIN public.finance_charge_reviews cr ON cr.id=e.entity_id WHERE e.event_type='charge_review_revision_advanced' AND e.service_request_id=OLD.id AND cr.status='approved' AND NOT EXISTS(SELECT 1 FROM public.finance_charge_reviews c2 WHERE c2.supersedes_review_id=cr.id AND c2.status='approved') AND (e.details->>'revision')::bigint=NEW.payment_revision AND (e.details->>'previous_revision')::bigint=OLD.payment_revision AND e.created_at=now())) THEN RAISE EXCEPTION 'payment_revision_requires_financial_event'; END IF;
 ELSIF inspection_first THEN RAISE EXCEPTION 'inspection_revision_required'; END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION private.payment_guard_collection()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- M6 settlement requires the actual existing-ledger receipt in the same transaction.
  IF NOT ((OLD.status='pending_settlement' AND NEW.status IN ('void_recorded','settled')) OR (OLD.status='pending_verification' AND NEW.status IN ('verified','rejected'))) THEN RAISE EXCEPTION 'invalid_collection_transition'; END IF;
  IF NEW.status='settled' THEN
   IF NEW.settled_by IS DISTINCT FROM auth.uid() OR NEW.settled_at IS DISTINCT FROM now() OR v_profile=auth.uid() THEN RAISE EXCEPTION 'invalid_collection_settler'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.service_request_payments WHERE technician_collection_id=NEW.id AND service_request_id=NEW.service_request_id AND amount=NEW.amount AND voided_at IS NULL) AND NOT EXISTS(SELECT 1 FROM public.invoice_payments p JOIN public.invoices i ON i.id=p.invoice_id WHERE p.technician_collection_id=NEW.id AND i.service_request_id=NEW.service_request_id AND p.amount=NEW.amount AND p.voided_at IS NULL) THEN RAISE EXCEPTION 'settlement_receipt_required'; END IF;
  END IF;
  IF NEW.status IN ('verified','rejected') AND (NEW.verified_by IS DISTINCT FROM auth.uid() OR NEW.verified_at IS NULL) THEN RAISE EXCEPTION 'invalid_collection_verifier'; END IF;
  IF NEW.status='void_recorded' AND (NEW.voided_by IS DISTINCT FROM auth.uid() OR NEW.voided_at IS NULL) THEN RAISE EXCEPTION 'invalid_collection_void_actor'; END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $function$
;
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
  IF tc.amount IS DISTINCT FROM NEW.amount OR tc.currency IS DISTINCT FROM v_currency OR tc.collection_method IS DISTINCT FROM NEW.method OR NEW.voided_at IS NOT NULL OR NEW.idempotency_key IS NULL OR NEW.obligation_snapshot IS NULL THEN RAISE EXCEPTION 'collection_receipt_mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM public.service_request_payments WHERE technician_collection_id=tc.id) OR EXISTS(SELECT 1 FROM public.invoice_payments WHERE technician_collection_id=tc.id) THEN
   IF TG_TABLE_NAME<>'invoice_payments' THEN RAISE EXCEPTION 'collection_already_posted'; END IF;
   SELECT * INTO origin FROM public.service_request_payments WHERE technician_collection_id=tc.id;
   IF NOT FOUND OR origin.transferred_invoice_payment_id IS NOT NULL OR origin.voided_at IS NOT NULL OR ROW(NEW.amount,NEW.method,NEW.paid_at,NEW.recorded_by,NEW.obligation_snapshot) IS DISTINCT FROM ROW(origin.amount,origin.method,origin.paid_at,origin.recorded_by,origin.obligation_snapshot) OR NEW.idempotency_key IS NOT NULL THEN RAISE EXCEPTION 'invalid_collection_transfer_alias'; END IF;
  ELSIF NOT ((tc.collection_method='cash' AND tc.status='pending_settlement') OR (tc.collection_method<>'cash' AND tc.status='verified')) THEN RAISE EXCEPTION 'collection_not_ready_for_posting'; END IF;
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
CREATE OR REPLACE FUNCTION private.payment_check_receipt_reverse_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a public.payment_attempts%ROWTYPE; v_id uuid; v_source uuid; tc public.technician_collections%ROWTYPE;
BEGIN
 IF NEW.technician_collection_id IS NOT NULL THEN
  SELECT * INTO tc FROM public.technician_collections WHERE id=NEW.technician_collection_id;
  IF NOT ((tc.collection_method='cash' AND tc.status='settled') OR (tc.collection_method<>'cash' AND tc.status='verified')) THEN RAISE EXCEPTION 'collection_receipt_not_completed'; END IF;
  IF TG_TABLE_NAME='invoice_payments' AND EXISTS(SELECT 1 FROM public.service_request_payments WHERE technician_collection_id=tc.id AND transferred_invoice_payment_id IS DISTINCT FROM NEW.id) THEN RAISE EXCEPTION 'collection_reverse_link_mismatch'; END IF;
  IF TG_TABLE_NAME='service_request_payments' THEN SELECT transferred_invoice_payment_id INTO v_id FROM public.service_request_payments WHERE id=NEW.id;
   IF v_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.invoice_payments WHERE id=v_id AND technician_collection_id=tc.id) THEN RAISE EXCEPTION 'collection_reverse_link_mismatch'; END IF;
  END IF;
  RETURN NULL;
 END IF;
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
END $function$
;

CREATE FUNCTION private.payment_post_technician_collection(p_collection_id uuid,p_idempotency_key text,p_cash boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tc public.technician_collections%ROWTYPE;r public.service_requests%ROWTYPE;b public.invoices%ROWTYPE; req uuid; receipt uuid; previous_key text; v_key text; v_currency text; total_received numeric; snap jsonb;
BEGIN
 PERFORM private.payment_foundation_require_finance();
 IF p_idempotency_key IS NULL OR p_idempotency_key<>btrim(p_idempotency_key) OR length(p_idempotency_key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid_receipt_idempotency_key'; END IF;
 SELECT service_request_id INTO req FROM public.technician_collections WHERE id=p_collection_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'technician_collection_not_found'; END IF;
 SELECT * INTO r FROM public.service_requests WHERE id=req FOR UPDATE;
 SELECT * INTO tc FROM public.technician_collections WHERE id=p_collection_id FOR UPDATE;
 IF tc.recorded_by=auth.uid() OR EXISTS(SELECT 1 FROM public.technicians WHERE id=tc.technician_id AND profile_id=auth.uid()) THEN RAISE EXCEPTION 'collection_self_decision_forbidden'; END IF;
 IF (tc.collection_method='cash') IS DISTINCT FROM p_cash THEN RAISE EXCEPTION 'collection_method_mismatch'; END IF;
 v_key:='collection:'||tc.id::text||':'||p_idempotency_key;
 SELECT id,idempotency_key INTO receipt,previous_key FROM public.service_request_payments WHERE technician_collection_id=tc.id;
 IF NOT FOUND THEN SELECT id,idempotency_key INTO receipt,previous_key FROM public.invoice_payments WHERE technician_collection_id=tc.id; END IF;
 IF receipt IS NOT NULL THEN
  IF previous_key IS DISTINCT FROM v_key OR NOT ((p_cash AND tc.status='settled') OR (NOT p_cash AND tc.status='verified')) THEN RAISE EXCEPTION 'collection_already_posted_with_different_key'; END IF;
  RETURN receipt;
 END IF;
 IF NOT ((p_cash AND tc.status='pending_settlement') OR (NOT p_cash AND tc.status='verified')) THEN RAISE EXCEPTION 'collection_not_ready_for_posting'; END IF;
 snap:=jsonb_build_object('collection_id',tc.id,'payment_revision',r.payment_revision,'source','technician_collection');
 SELECT * INTO b FROM public.invoices WHERE service_request_id=req AND status='issued' FOR UPDATE;
 IF FOUND THEN
  SELECT coalesce(sum(amount),0) INTO total_received FROM public.invoice_payments WHERE invoice_id=b.id AND voided_at IS NULL;
  IF total_received+tc.amount>b.total THEN RAISE EXCEPTION 'payment_exceeds_balance'; END IF;
  IF b.currency IS DISTINCT FROM tc.currency THEN RAISE EXCEPTION 'collection_currency_mismatch'; END IF;
  INSERT INTO public.invoice_payments(invoice_id,amount,method,note,recorded_by,paid_at,idempotency_key,technician_collection_id,obligation_snapshot)
  VALUES(b.id,tc.amount,tc.collection_method,'Technician collection: '||tc.id::text,auth.uid(),tc.collected_at,v_key,tc.id,snap) RETURNING id INTO receipt;
 ELSE
  IF r.workflow_stage IN ('cancelled','customer_cancelled') THEN RAISE EXCEPTION 'request_not_open_for_preinvoice_payment'; END IF;
  SELECT context_currency INTO v_currency FROM private.payment_foundation_context(req);
  IF v_currency IS DISTINCT FROM tc.currency THEN RAISE EXCEPTION 'collection_currency_mismatch'; END IF;
  IF r.workflow_stage='completed' THEN
   SELECT * INTO b FROM public.invoices WHERE service_request_id=req AND status='draft' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'completed_request_invoice_draft_required'; END IF;
   SELECT coalesce(sum(amount),0) INTO total_received FROM (
    SELECT amount FROM public.invoice_payments WHERE invoice_id=b.id AND voided_at IS NULL
    UNION ALL SELECT amount FROM public.service_request_payments WHERE service_request_id=req AND voided_at IS NULL AND transferred_invoice_payment_id IS NULL
   ) x;
   IF total_received+tc.amount>b.total THEN RAISE EXCEPTION 'payment_exceeds_invoice_remaining'; END IF;
  END IF;
  INSERT INTO public.service_request_payments(service_request_id,payment_type,amount,method,note,recorded_by,paid_at,idempotency_key,technician_collection_id,obligation_snapshot)
  VALUES(req,'advance',tc.amount,tc.collection_method,'Technician collection: '||tc.id::text,auth.uid(),tc.collected_at,v_key,tc.id,snap) RETURNING id INTO receipt;
 END IF;
 IF p_cash THEN UPDATE public.technician_collections SET status='settled',settled_by=auth.uid(),settled_at=now() WHERE id=tc.id; END IF;
 IF r.workflow_stage='completed' AND b.status='draft' THEN PERFORM private.finance_transfer_request_payments_to_invoice(b.id,req); END IF;
 IF b.status='issued' AND total_received+tc.amount=b.total THEN UPDATE public.invoices SET paid_at=now() WHERE id=b.id; END IF;
 PERFORM private.payment_write_audit_event(CASE WHEN p_cash THEN 'technician_cash_collection_settled' ELSE 'technician_verified_collection_posted' END,'technician_collection',tc.id,req,b.id,jsonb_build_object('receipt_id',receipt,'amount',tc.amount,'currency',tc.currency));
 RETURN receipt;
END $$;
CREATE FUNCTION public.finance_settle_technician_cash_collection(p_collection_id uuid,p_idempotency_key text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.payment_foundation_require_finance();
 RETURN private.payment_post_technician_collection(p_collection_id,p_idempotency_key,true);
END $$;
CREATE FUNCTION public.finance_post_verified_technician_collection(p_collection_id uuid,p_idempotency_key text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.payment_foundation_require_finance();
 RETURN private.payment_post_technician_collection(p_collection_id,p_idempotency_key,false);
END $$;
REVOKE ALL ON FUNCTION public.finance_settle_technician_cash_collection(uuid,text),public.finance_post_verified_technician_collection(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finance_settle_technician_cash_collection(uuid,text),public.finance_post_verified_technician_collection(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION private.payment_invoice_line_signature(uuid),private.payment_guard_invoice_basis(),private.payment_invalidate_invoice_line_basis(),private.payment_invoice_basis_matches(uuid),private.payment_financial_state(uuid),private.payment_prove_resolved_untransferred(uuid),private.payment_charge_review_revision(),private.payment_post_technician_collection(uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
-- Replaced private functions retain their prior restricted ACLs.
CREATE OR REPLACE FUNCTION private.payment_guard_refund()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 IF TG_OP='INSERT' OR NEW.status IN ('approved','pending','succeeded') THEN
  SELECT coalesce(sum(amount),0) INTO v_reserved FROM public.payment_refunds WHERE id<>NEW.id AND status IN ('approved','pending','succeeded') AND
   ((NEW.origin_service_request_payment_id IS NOT NULL AND origin_service_request_payment_id=NEW.origin_service_request_payment_id) OR (NEW.origin_invoice_payment_id IS NOT NULL AND origin_invoice_payment_id=NEW.origin_invoice_payment_id));
  IF v_reserved+NEW.amount>v_amount THEN RAISE EXCEPTION 'refund_reservation_exceeds_original_payment'; END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $function$
;
