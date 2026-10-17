-- Phase 5: restricted reads only. Existing financial writes are unchanged.
CREATE FUNCTION public.technician_get_collection_context(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE tech uuid; snap jsonb; state jsonb; enabled boolean; reason text; records jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.current_user_has_role(ARRAY['technician']::public.app_role[]) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501'; END IF;
 SELECT id INTO tech FROM public.technicians WHERE profile_id=auth.uid() AND is_active;
 IF tech IS NULL OR NOT EXISTS(SELECT 1 FROM public.service_request_assignments WHERE service_request_id=p_request_id AND technician_id=tech AND status='accepted') THEN RAISE EXCEPTION 'accepted_assignment_not_found' USING ERRCODE='42501'; END IF;
 SELECT payment_policy_snapshot INTO snap FROM public.service_requests WHERE id=p_request_id;
 SELECT coalesce(payment_domain_enabled,false) INTO enabled FROM public.business_finance_settings WHERE id=true;
 enabled:=coalesce(enabled,false);
 BEGIN state:=private.payment_financial_state(p_request_id);
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='financial_currency_mismatch' THEN state:='{}'::jsonb; reason:='financial_inconsistency'; ELSE RAISE; END IF;
 END;
 reason:=CASE WHEN NOT enabled THEN 'payment_domain_not_enabled' WHEN snap IS NULL THEN 'legacy_policy_unsupported' WHEN reason IS NOT NULL THEN reason WHEN coalesce((state->>'review_required')::boolean,true) THEN 'financial_review_required' WHEN coalesce((state->>'reconciliation_required')::boolean,true) THEN 'financial_reconciliation_required' WHEN state->>'payable_now' IS NULL THEN 'payable_now_unavailable' WHEN (state->>'payable_now')::numeric<=0 THEN 'nothing_payable_now' ELSE NULL END;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'method',collection_method,'amount',amount,'status',status,'collected_at',collected_at,'created_at',created_at) ORDER BY created_at DESC,id),'[]'::jsonb) INTO records FROM public.technician_collections WHERE technician_id=tech AND service_request_id=p_request_id;
 RETURN jsonb_build_object('request_id',p_request_id,'payment_domain_enabled',enabled,'currency',state->'currency','authoritative_charge',state->'authoritative_charge','remaining_contractual',state->'remaining_contractual','payable_cap',state->'payable_cap','payable_now',state->'payable_now','collection_allowed',reason IS NULL,'collection_block_reason',reason,'collections',records);
END $$;
CREATE FUNCTION public.finance_get_payment_operations(p_limit integer DEFAULT 50,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE enabled boolean; records jsonb; item jsonb; state jsonb; enriched jsonb:='[]'::jsonb;
BEGIN
 PERFORM private.payment_foundation_require_finance();
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'invalid_pagination'; END IF;
 SELECT coalesce(payment_domain_enabled,false) INTO enabled FROM public.business_finance_settings WHERE id=true;
 SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.created_at DESC,v.id DESC),'[]'::jsonb) INTO records FROM (
 SELECT tc.id,tc.service_request_id AS request_id,tc.technician_id,pr.full_name AS technician_name,tc.collection_method AS method,tc.amount,tc.currency,tc.status,tc.collected_at,tc.created_at,
 CASE WHEN EXISTS(SELECT 1 FROM public.service_request_payments WHERE technician_collection_id=tc.id) OR EXISTS(SELECT 1 FROM public.invoice_payments WHERE technician_collection_id=tc.id) THEN 'posted' ELSE 'not_posted' END AS posting_state,
 'technician_collection'::text AS source,
 CASE WHEN NOT coalesce(enabled,false) THEN 'payment_domain_not_enabled' WHEN r.payment_policy_snapshot IS NULL THEN 'legacy_policy_unsupported' WHEN tc.status='verified' THEN 'verified_awaiting_posting' ELSE NULL END AS block_reason
 FROM public.technician_collections tc JOIN public.service_requests r ON r.id=tc.service_request_id JOIN public.technicians t ON t.id=tc.technician_id JOIN public.profiles pr ON pr.id=t.profile_id
 WHERE tc.status IN ('pending_settlement','pending_verification') OR (tc.status='verified' AND NOT EXISTS(SELECT 1 FROM public.service_request_payments WHERE technician_collection_id=tc.id) AND NOT EXISTS(SELECT 1 FROM public.invoice_payments WHERE technician_collection_id=tc.id))
 ORDER BY tc.created_at DESC,tc.id DESC LIMIT p_limit OFFSET p_offset
 ) v;
 FOR item IN SELECT value FROM jsonb_array_elements(records) LOOP
  BEGIN state:=private.payment_financial_state((item->>'request_id')::uuid);
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='financial_currency_mismatch' THEN state:=jsonb_build_object('review_required',true,'reconciliation_required',true); ELSE RAISE; END IF; END;
  item:=item||jsonb_build_object('review_required',coalesce((state->>'review_required')::boolean,true),'reconciliation_required',coalesce((state->>'reconciliation_required')::boolean,true),'block_reason',CASE WHEN NOT coalesce(enabled,false) THEN 'payment_domain_not_enabled' WHEN coalesce((state->>'review_required')::boolean,true) THEN 'financial_review_required' WHEN coalesce((state->>'reconciliation_required')::boolean,true) THEN 'financial_reconciliation_required' ELSE item->>'block_reason' END);
  enriched:=enriched||jsonb_build_array(item);
 END LOOP;
 RETURN jsonb_build_object('payment_domain_enabled',coalesce(enabled,false),'operations',enriched,'limit',p_limit,'offset',p_offset);
END $$;
REVOKE ALL ON FUNCTION public.technician_get_collection_context(uuid),public.finance_get_payment_operations(integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.technician_get_collection_context(uuid),public.finance_get_payment_operations(integer,integer) TO authenticated;
