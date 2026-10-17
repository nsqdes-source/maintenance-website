BEGIN;
CREATE FUNCTION public.get_request_payment_policy()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(
  (SELECT jsonb_build_object('configured',true,'payment_domain_enabled',s.payment_domain_enabled,
   'payment_policy_version',s.payment_policy_version,'payment_policy',s.payment_policy)
   FROM public.business_finance_settings s WHERE s.id=true),
  jsonb_build_object('configured',false,'payment_domain_enabled',false,
   'payment_policy_version',NULL,'payment_policy',NULL)
 );
$$;
REVOKE ALL ON FUNCTION public.get_request_payment_policy() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_request_payment_policy() TO anon,authenticated;
CREATE FUNCTION public.submit_service_request_with_payment_choice_v1(
 input_name text, input_phone text, input_email text, input_catalog_item_id uuid, input_catalog_services jsonb, input_issue_type text, input_problem text, input_city text, input_address text, input_latitude double precision, input_longitude double precision, input_preferred_date date, input_preferred_time_period text, input_landing_page text DEFAULT NULL::text, input_referrer text DEFAULT NULL::text, input_utm_source text DEFAULT NULL::text, input_utm_medium text DEFAULT NULL::text, input_utm_campaign text DEFAULT NULL::text, input_utm_content text DEFAULT NULL::text, input_utm_term text DEFAULT NULL::text, input_gclid text DEFAULT NULL::text, input_wbraid text DEFAULT NULL::text, input_gbraid text DEFAULT NULL::text, input_first_touch_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
 p_payment_choice_timing text DEFAULT NULL,
 p_expected_payment_policy_version bigint DEFAULT NULL
)
RETURNS TABLE(request_id uuid,request_upload_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result_record record; snapshot jsonb; enabled boolean; policy jsonb; timing text;
BEGIN
 SELECT * INTO STRICT result_record FROM public.submit_service_request_v4(
  input_name,input_phone,input_email,input_catalog_item_id,input_catalog_services,input_issue_type,input_problem,input_city,input_address,input_latitude,input_longitude,input_preferred_date,input_preferred_time_period,input_landing_page,input_referrer,input_utm_source,input_utm_medium,input_utm_campaign,input_utm_content,input_utm_term,input_gclid,input_wbraid,input_gbraid,input_first_touch_at
 );
 SELECT r.payment_policy_snapshot INTO STRICT snapshot
 FROM public.service_requests r WHERE r.id=result_record.request_id;
 -- Snapshot trigger holds the singleton share lock through the transaction.
 SELECT s.payment_domain_enabled INTO enabled
 FROM public.business_finance_settings s WHERE s.id=true FOR SHARE;
 IF snapshot IS NULL OR NOT coalesce(enabled,false) THEN
  IF p_payment_choice_timing IS NOT NULL THEN RAISE EXCEPTION 'payment_domain_not_enabled'; END IF;
  -- No UPDATE while disabled: original choice, revision and workflow are untouched.
 ELSE
  IF p_expected_payment_policy_version IS DISTINCT FROM (snapshot->>'policy_version')::bigint THEN
   RAISE EXCEPTION 'payment_policy_version_conflict';
  END IF;
  policy:=snapshot->'policy';
  IF NOT coalesce(private.payment_policy_v1_is_valid(policy),false) THEN RAISE EXCEPTION 'invalid_payment_policy_v1'; END IF;
  IF p_payment_choice_timing IS NULL OR p_payment_choice_timing NOT IN ('prepay','pay_on_arrival','pay_after_completion') THEN
   RAISE EXCEPTION 'invalid_payment_choice_timing';
  END IF;
  timing:=policy->>'original_timing';
  IF (timing='prepay_required' AND p_payment_choice_timing<>'prepay')
   OR (timing='pay_on_arrival' AND p_payment_choice_timing<>'pay_on_arrival')
   OR (timing='pay_after_completion' AND p_payment_choice_timing<>'pay_after_completion')
   OR (p_payment_choice_timing='pay_on_arrival' AND policy->'allow_pay_on_arrival'<>'true'::jsonb)
   OR (p_payment_choice_timing='pay_after_completion' AND policy->'allow_pay_after_completion'<>'true'::jsonb) THEN
   RAISE EXCEPTION 'payment_choice_not_allowed';
  END IF;
  UPDATE public.service_requests SET payment_choice_timing=p_payment_choice_timing
  WHERE id=result_record.request_id AND payment_choice_timing IS NULL;
 END IF;
 RETURN QUERY SELECT result_record.request_id::uuid,result_record.request_upload_token::uuid;
END $$;
REVOKE ALL ON FUNCTION public.submit_service_request_with_payment_choice_v1(text,text,text,uuid,jsonb,text,text,text,text,double precision,double precision,date,text,text,text,text,text,text,text,text,text,text,text,timestamp with time zone,text,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.submit_service_request_with_payment_choice_v1(text,text,text,uuid,jsonb,text,text,text,text,double precision,double precision,date,text,text,text,text,text,text,text,text,text,text,text,timestamp with time zone,text,bigint) TO anon,authenticated;
COMMENT ON FUNCTION public.submit_service_request_with_payment_choice_v1(text,text,text,uuid,jsonb,text,text,text,text,double precision,double precision,date,text,text,text,text,text,text,text,text,text,text,text,timestamp with time zone,text,bigint) IS
 'Phase 4 dark launch. No financial posting. prepay_required activation is NOT ready: waiting, verification and execution blocking are not implemented.';
COMMIT;
