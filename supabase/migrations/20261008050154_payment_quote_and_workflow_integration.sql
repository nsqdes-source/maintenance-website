-- M5 only: independent full-work quotes and explicit future evidence. No payment activation.
ALTER TABLE public.service_request_quotes
 ADD COLUMN quote_basis text NOT NULL DEFAULT 'legacy_as_approved',
 ADD COLUMN financial_revision bigint,
 ADD CONSTRAINT service_request_quotes_basis_check CHECK (quote_basis IN ('legacy_as_approved','full_final_work')),
 ADD CONSTRAINT service_request_quotes_revision_check CHECK ((quote_basis='legacy_as_approved' AND financial_revision IS NULL) OR (quote_basis='full_final_work' AND financial_revision IS NOT NULL AND financial_revision>=0));
CREATE UNIQUE INDEX service_request_quotes_financial_revision_uidx ON public.service_request_quotes(service_request_id,financial_revision) WHERE financial_revision IS NOT NULL;

CREATE FUNCTION private.payment_compose_full_work_lines(p_request uuid,p_change_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.service_requests%ROWTYPE; ids uuid[]:=coalesce(p_change_ids,ARRAY[]::uuid[]); result jsonb;
BEGIN
 SELECT * INTO r FROM public.service_requests WHERE id=p_request FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'service_request_not_found'; END IF;
 IF r.payment_policy_snapshot IS NULL OR NOT coalesce(private.payment_policy_v1_is_valid(r.payment_policy_snapshot->'policy'),false) THEN RAISE EXCEPTION 'historical_payment_policy_unavailable'; END IF;
 IF cardinality(ids)>100 OR EXISTS(SELECT 1 FROM unnest(ids) x WHERE x IS NULL) OR (SELECT count(DISTINCT x) FROM unnest(ids) x)<>cardinality(ids) THEN RAISE EXCEPTION 'duplicate_or_invalid_source'; END IF;
 -- Non-original request-item origins need explicit future composition semantics, never silent omission.
 IF EXISTS(SELECT 1 FROM public.service_request_items WHERE service_request_id=p_request AND item_source<>'customer_request') THEN RAISE EXCEPTION 'unsupported_request_item_origin'; END IF;
 PERFORM 1 FROM public.service_request_items WHERE service_request_id=p_request ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.service_request_change_requests WHERE id IN (SELECT change_request_id FROM public.service_request_change_items WHERE id=ANY(ids)) ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.service_request_change_items WHERE id=ANY(ids) ORDER BY id FOR SHARE;
 IF EXISTS(SELECT 1 FROM public.service_request_items WHERE service_request_id=p_request AND is_visit_service_snapshot IS NULL) THEN RAISE EXCEPTION 'historical_service_classification_unavailable'; END IF;
 IF (SELECT count(*) FROM public.service_request_change_items i JOIN public.service_request_change_requests c ON c.id=i.change_request_id WHERE i.id=ANY(ids) AND c.service_request_id=p_request AND c.status IN ('submitted','approved'))<>cardinality(ids) THEN RAISE EXCEPTION 'invalid_or_foreign_change_source'; END IF;
 IF EXISTS(SELECT 1 FROM public.service_request_change_items WHERE id=ANY(ids) AND item_type='service' AND is_visit_service_snapshot IS NULL) THEN RAISE EXCEPTION 'historical_service_classification_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM public.service_request_change_items c JOIN public.service_request_items o ON o.catalog_service_id=c.catalog_service_id AND o.service_request_id=p_request AND o.is_visit_service_snapshot=false WHERE c.id=ANY(ids) AND c.item_type='service') THEN RAISE EXCEPTION 'original_service_already_included'; END IF;
 IF EXISTS(SELECT 1 FROM public.service_request_change_items WHERE id=ANY(ids) AND item_type='service' GROUP BY catalog_service_id HAVING count(*)>1) THEN RAISE EXCEPTION 'duplicate_change_service'; END IF;
 SELECT jsonb_agg(jsonb_build_object(
  'item_type',x.item_type,'description',x.description,'quantity',x.quantity,'unit_price',x.gross_unit_price,
  'gross_unit_price',x.gross_unit_price,'gross_total',x.gross_total,'source_type',x.source_type,'source_id',x.id,
  'service_request_item_id',CASE WHEN x.source_type='service_request_item' THEN x.id END,
  'service_request_change_item_id',CASE WHEN x.source_type='service_request_change_item' THEN x.id END,
  'catalog_service_id',x.catalog_service_id,'catalog_part_id',x.catalog_part_id,
  'is_visit_service_snapshot',x.is_visit_service_snapshot,'classification_source',x.classification_source,
  'origin',x.origin,'excluded_from_final',x.excluded_from_final) ORDER BY x.source_type,x.id)
 INTO result FROM (
  SELECT id,'service'::text item_type,service_name description,quantity,gross_unit_price,gross_total,
  'service_request_item'::text source_type,catalog_service_id,NULL::uuid catalog_part_id,is_visit_service_snapshot,classification_source,
  'original'::text origin,is_visit_service_snapshot excluded_from_final
  FROM public.service_request_items WHERE service_request_id=p_request AND item_source='customer_request'
  UNION ALL
  SELECT id,item_type,item_name,quantity,gross_unit_price,gross_total,'service_request_change_item',catalog_service_id,catalog_part_id,is_visit_service_snapshot,classification_source,
  CASE WHEN item_type='part' THEN 'part' ELSE 'change' END,
  CASE WHEN item_type='service' THEN is_visit_service_snapshot ELSE false END
  FROM public.service_request_change_items WHERE id=ANY(ids)
 ) x;
 IF result IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result) x WHERE x->'excluded_from_final'='false'::jsonb) THEN RAISE EXCEPTION 'final_work_source_required'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(result) x WHERE (x->>'quantity')::numeric<=0 OR (x->>'quantity')::numeric IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) OR (x->>'gross_unit_price')::numeric<0 OR (x->>'gross_unit_price')::numeric IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) OR (x->>'gross_total')::numeric IS DISTINCT FROM round((x->>'quantity')::numeric*(x->>'gross_unit_price')::numeric,2)) THEN RAISE EXCEPTION 'invalid_historical_price_snapshot'; END IF;
 RETURN result;
END $$;

CREATE FUNCTION private.payment_guard_financial_quote() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[]; expected jsonb; revision bigint; amount numeric;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.quote_basis='full_final_work' THEN RAISE EXCEPTION 'financial_quote_delete_forbidden'; END IF; RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.quote_basis,NEW.financial_revision) IS DISTINCT FROM ROW(OLD.quote_basis,OLD.financial_revision) THEN RAISE EXCEPTION 'quote_financial_metadata_is_immutable'; END IF;
  IF OLD.quote_basis='full_final_work' THEN
   IF OLD.status<>'pending' OR (to_jsonb(NEW)-ARRAY['status','decided_at','customer_notes']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','decided_at','customer_notes']) OR NEW.status NOT IN ('approved','rejected') OR NEW.decided_at IS NULL THEN RAISE EXCEPTION 'full_work_quote_is_immutable'; END IF;
   IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.service_requests WHERE id=OLD.service_request_id AND customer_id=auth.uid()) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.quote_basis='legacy_as_approved' THEN
  IF NEW.financial_revision IS NOT NULL THEN RAISE EXCEPTION 'legacy_financial_revision_unavailable'; END IF; RETURN NEW;
 END IF;
 IF auth.uid() IS NULL OR NOT public.current_user_has_role(ARRAY['maintenance_manager','admin_manager','super_admin']::public.app_role[]) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501'; END IF;
 SELECT payment_revision INTO revision FROM public.service_requests WHERE id=NEW.service_request_id AND workflow_stage='awaiting_admin_quote' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_workflow_transition'; END IF;
 SELECT coalesce(array_agg((x->>'source_id')::uuid),ARRAY[]::uuid[]) INTO ids FROM jsonb_array_elements(NEW.line_items) x WHERE x->>'source_type'='service_request_change_item';
 expected:=private.payment_compose_full_work_lines(NEW.service_request_id,ids);
 IF NEW.line_items IS DISTINCT FROM expected THEN RAISE EXCEPTION 'financial_quote_source_tampering'; END IF;
 SELECT round(sum((x->>'gross_total')::numeric),2) INTO amount FROM jsonb_array_elements(expected) x WHERE x->'excluded_from_final'='false'::jsonb;
 IF NEW.parts_cost IS DISTINCT FROM amount OR NEW.labor_cost<>0 OR NEW.created_by IS DISTINCT FROM auth.uid() OR NEW.status<>'pending' THEN RAISE EXCEPTION 'financial_quote_amount_tampering'; END IF;
 IF NEW.financial_revision IS NOT NULL AND NEW.financial_revision<>revision+1 THEN RAISE EXCEPTION 'financial_quote_revision_tampering'; END IF;
 NEW.financial_revision:=revision+1; RETURN NEW;
END $$;
CREATE FUNCTION private.payment_advance_quote_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.quote_basis='full_final_work' THEN
  UPDATE public.service_requests SET payment_revision=NEW.financial_revision WHERE id=NEW.service_request_id AND payment_revision=NEW.financial_revision-1;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_quote_revision_conflict'; END IF;
  PERFORM private.payment_write_audit_event('full_final_work_quote_created','service_request_quote',NEW.id,NEW.service_request_id,NULL,jsonb_build_object('financial_revision',NEW.financial_revision,'gross_total',NEW.parts_cost));
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER payment_guard_financial_quote BEFORE INSERT OR UPDATE OR DELETE ON public.service_request_quotes FOR EACH ROW EXECUTE FUNCTION private.payment_guard_financial_quote();
CREATE TRIGGER payment_advance_quote_revision AFTER INSERT ON public.service_request_quotes FOR EACH ROW EXECUTE FUNCTION private.payment_advance_quote_revision();

CREATE FUNCTION public.admin_submit_full_final_work_quote(p_service_request_id uuid,p_description text,p_change_item_ids uuid[] DEFAULT ARRAY[]::uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lines jsonb; amount numeric; q uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.current_user_has_role(ARRAY['maintenance_manager','admin_manager','super_admin']::public.app_role[]) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501'; END IF;
 IF nullif(btrim(p_description),'') IS NULL THEN RAISE EXCEPTION 'invalid_quote'; END IF;
 PERFORM 1 FROM public.service_requests WHERE id=p_service_request_id AND workflow_stage='awaiting_admin_quote' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_workflow_transition'; END IF;
 lines:=private.payment_compose_full_work_lines(p_service_request_id,p_change_item_ids);
 SELECT round(sum((x->>'gross_total')::numeric),2) INTO amount FROM jsonb_array_elements(lines) x WHERE x->'excluded_from_final'='false'::jsonb;
 INSERT INTO public.service_request_quotes(service_request_id,description,parts_description,parts_cost,labor_cost,line_items,created_by,quote_basis)
 VALUES(p_service_request_id,btrim(p_description),'Full final work snapshot',amount,0,lines,auth.uid(),'full_final_work') RETURNING id INTO q;
 UPDATE public.service_request_change_requests SET status='approved',reviewed_by=auth.uid(),reviewed_at=now() WHERE service_request_id=p_service_request_id AND status='submitted' AND id IN (SELECT change_request_id FROM public.service_request_change_items WHERE id=ANY(coalesce(p_change_item_ids,ARRAY[]::uuid[])));
 UPDATE public.service_requests SET workflow_stage='awaiting_customer_approval',workflow_updated_at=now() WHERE id=p_service_request_id;
 RETURN q;
END $$;

CREATE FUNCTION private.payment_require_assigned_technician(p_request uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tech uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.current_user_has_role(ARRAY['technician']::public.app_role[]) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.service_requests WHERE id=p_request FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'service_request_not_found'; END IF;
 SELECT id INTO tech FROM public.technicians WHERE profile_id=auth.uid() AND is_active FOR SHARE;
 IF tech IS NULL OR NOT EXISTS(SELECT 1 FROM public.service_request_assignments WHERE service_request_id=p_request AND technician_id=tech AND status='accepted') THEN RAISE EXCEPTION 'accepted_assignment_not_found'; END IF;
 PERFORM 1 FROM public.service_request_assignments WHERE service_request_id=p_request AND technician_id=tech AND status='accepted' FOR SHARE;
 RETURN tech;
END $$;
CREATE FUNCTION private.payment_inspection_snapshot_amount(p_request uuid) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n bigint; amount numeric;
BEGIN
 PERFORM 1 FROM public.service_request_items WHERE service_request_id=p_request ORDER BY id FOR SHARE;
 IF EXISTS(SELECT 1 FROM public.service_request_items WHERE service_request_id=p_request AND item_source='customer_request' AND is_visit_service_snapshot IS NULL) THEN RAISE EXCEPTION 'historical_service_classification_unavailable'; END IF;
 SELECT count(*),min(gross_total) INTO n,amount FROM public.service_request_items WHERE service_request_id=p_request AND item_source='customer_request' AND is_visit_service_snapshot=true;
 IF n=0 THEN RAISE EXCEPTION 'historical_visit_obligation_unavailable'; END IF;
 IF n<>1 THEN RAISE EXCEPTION 'ambiguous_multiple_visit_obligations'; END IF;
 IF amount IS NULL OR amount<0 OR amount IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) THEN RAISE EXCEPTION 'invalid_historical_visit_amount'; END IF;
 RETURN amount;
END $$;
CREATE FUNCTION private.payment_guard_workflow_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  IF NEW.payment_revision<>OLD.payment_revision+1 OR NOT (inspection_first OR EXISTS(SELECT 1 FROM public.service_request_quotes WHERE service_request_id=OLD.id AND quote_basis='full_final_work' AND financial_revision=NEW.payment_revision)) THEN RAISE EXCEPTION 'payment_revision_requires_financial_event'; END IF;
 ELSIF inspection_first THEN RAISE EXCEPTION 'inspection_revision_required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_guard_workflow_evidence BEFORE INSERT OR UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION private.payment_guard_workflow_evidence();

CREATE FUNCTION public.technician_confirm_inspection_earned(p_service_request_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.service_requests%ROWTYPE; amount numeric;
BEGIN
 PERFORM private.payment_require_assigned_technician(p_service_request_id);
 SELECT * INTO r FROM public.service_requests WHERE id=p_service_request_id;
 IF r.inspection_confirmed_at IS NOT NULL THEN
  IF r.inspection_confirmed_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'inspection_already_confirmed_by_another_actor'; END IF; RETURN;
 END IF;
 IF r.workflow_stage NOT IN ('in_progress','needs_followup','awaiting_admin_quote','awaiting_customer_approval','quote_approved','customer_rejected','awaiting_completion_review') THEN RAISE EXCEPTION 'request_not_open_for_inspection_confirmation'; END IF;
 amount:=private.payment_inspection_snapshot_amount(p_service_request_id);
 UPDATE public.service_requests SET inspection_confirmed_at=now(),inspection_confirmed_by=auth.uid(),inspection_earned_amount=amount,payment_revision=payment_revision+1 WHERE id=p_service_request_id;
 PERFORM private.payment_write_audit_event('inspection_earned_confirmed','service_request',p_service_request_id,p_service_request_id,NULL,jsonb_build_object('earned_amount',amount,'basis','single_historical_visit_item'));
END $$;
CREATE FUNCTION public.technician_confirm_work_started(p_service_request_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.service_requests%ROWTYPE;
BEGIN
 PERFORM private.payment_require_assigned_technician(p_service_request_id);
 SELECT * INTO r FROM public.service_requests WHERE id=p_service_request_id;
 IF r.work_started_at IS NOT NULL THEN RETURN; END IF;
 IF r.workflow_stage<>'in_progress' THEN RAISE EXCEPTION 'request_not_open_for_execution'; END IF;
 UPDATE public.service_requests SET work_started_at=now(),work_started_basis='technician_explicit_start' WHERE id=p_service_request_id;
 PERFORM private.payment_write_audit_event('work_started_confirmed','service_request',p_service_request_id,p_service_request_id,NULL,jsonb_build_object('basis','technician_explicit_start'));
END $$;

-- Only full_final_work uses its immutable inclusion snapshot; legacy predicate unchanged.
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
begin
  select *
  into invoice_record
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found';
  end if;

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

end;
$function$
;
REVOKE ALL ON FUNCTION private.payment_compose_full_work_lines(uuid,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_guard_financial_quote() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_advance_quote_revision() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_require_assigned_technician(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_inspection_snapshot_amount(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.payment_guard_workflow_evidence() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_submit_full_final_work_quote(uuid,text,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_submit_full_final_work_quote(uuid,text,uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.technician_confirm_inspection_earned(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.technician_confirm_inspection_earned(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.technician_confirm_work_started(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.technician_confirm_work_started(uuid) TO authenticated;
-- M2 charge-review revision synchronization is deferred to M6.

CREATE OR REPLACE FUNCTION public.customer_decide_service_request_quote(target_quote_id uuid, approve boolean, decision_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid; stage text;
begin
 -- M5 lock ordering only; approval ownership/status and financial behavior unchanged.
 select service_request_id into rid from public.service_request_quotes where id=target_quote_id;
 perform 1 from public.service_requests where id=rid for update;
 select q.service_request_id,r.workflow_stage into rid,stage from public.service_request_quotes q
 join public.service_requests r on r.id = q.service_request_id
 where q.id = target_quote_id and q.status = 'pending' and r.customer_id = auth.uid() for update of q,r;
 if not found then raise exception 'quote_not_found'; end if;
 if stage <> 'awaiting_customer_approval' then raise exception 'invalid_workflow_transition'; end if;
 update public.service_request_quotes set status = case when approve then 'approved' else 'rejected' end,
 decided_at = now(),customer_notes = nullif(trim(decision_notes),'') where id = target_quote_id;
 update public.service_requests set workflow_stage = case when approve then 'quote_approved' else 'customer_rejected' end,
 workflow_updated_at = now() where id = rid;
end; $function$
;
