BEGIN;
SET LOCAL search_path=public,extensions;
CREATE FUNCTION pg_temp.submit(cat uuid,svc uuid,choice text DEFAULT NULL,ver bigint DEFAULT NULL)
RETURNS TABLE(request_id uuid,request_upload_token uuid) LANGUAGE sql AS $$
 SELECT * FROM public.submit_service_request_with_payment_choice_v1(
 'TEST PHASE4','0500000000','phase4@example.invalid',cat,jsonb_build_array(jsonb_build_object('id',svc,'quantity',2)),
 'TEST','TEST','مكة المكرمة','TEST ADDRESS',21.4,39.8,current_date+1,'morning',
 p_payment_choice_timing=>choice,p_expected_payment_policy_version=>ver);
$$;
CREATE FUNCTION pg_temp.expect_error(q text,wanted text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text; BEGIN BEGIN EXECUTE q;EXCEPTION WHEN OTHERS THEN got:=SQLERRM;END;
 IF got IS NULL OR (got<>wanted AND NOT (wanted='42501' AND got LIKE 'permission denied%')) THEN RAISE EXCEPTION 'expected %, got %',wanted,got;END IF;
END $$;
DO $$
DECLARE cat uuid:=gen_random_uuid(); svc uuid:=gen_random_uuid(); r uuid; legacy uuid; direct uuid; tok uuid;
 u uuid; payload jsonb; base jsonb; policy jsonb; snap jsonb; st jsonb; before_count int; before_events int;
 timing text; choice text; expected bigint; mode text; path text; ver bigint:=1;
BEGIN
 IF EXISTS(SELECT 1 FROM business_finance_settings) THEN RAISE EXCEPTION 'requires_empty_test_settings';END IF;
 INSERT INTO service_catalog_items(id,service_key,name) VALUES(cat,'test-phase4','TEST PHASE4');
 INSERT INTO service_catalog_services(id,service_catalog_item_id,name,net_price,tax_rate,is_visit_service) VALUES(svc,cat,'TEST VISIT',50,15,true);

 SELECT request_id INTO legacy FROM pg_temp.submit(cat,svc);
 SELECT count(*) INTO before_count FROM service_requests;
 PERFORM pg_temp.expect_error(format('SELECT * FROM pg_temp.submit(%L,%L,''prepay'',NULL)',cat,svc),'payment_domain_not_enabled');
 IF (SELECT count(*) FROM service_requests)<>before_count THEN RAISE EXCEPTION 'missing_settings_partial_request';END IF;
 INSERT INTO business_finance_settings(id,legal_name,vat_registered,tax_rate) VALUES(true,'TEST PHASE4',false,0);
 SELECT payment_policy INTO base FROM business_finance_settings;
 policy:=jsonb_set(base,'{original_timing}','"prepay_required"');
 UPDATE business_finance_settings SET payment_policy=policy,payment_policy_version=2;
 PERFORM set_config('request.jwt.claim.sub','',true); SET LOCAL ROLE anon;
 payload:=public.get_request_payment_policy();
 IF (SELECT count(*) FROM jsonb_object_keys(payload))<>4 OR payload->'configured'<>'true' OR payload->'payment_domain_enabled'<>'false' THEN RAISE EXCEPTION 'policy_read_leak';END IF;
 SELECT * INTO r,tok FROM pg_temp.submit(cat,svc,NULL,999);
 SELECT request_id INTO direct FROM public.submit_service_request_v4('TEST DIRECT','0500000000',NULL,cat,jsonb_build_array(jsonb_build_object('id',svc,'quantity',2)),'TEST','TEST','مكة المكرمة','TEST ADDRESS',21.4,39.8,current_date+1,'morning');
 RESET ROLE;
 IF (SELECT payment_choice_timing IS NOT NULL FROM service_requests WHERE id=r) THEN RAISE EXCEPTION 'disabled_choice_persisted';END IF;
 IF private.payment_financial_state(r)-'service_request_id' IS DISTINCT FROM private.payment_financial_state(direct)-'service_request_id' THEN RAISE EXCEPTION 'disabled_payable_operational_change';END IF;
 SELECT count(*) INTO before_count FROM service_requests;
 SELECT count(*) INTO before_events FROM service_request_events;
 SET LOCAL ROLE anon;
 PERFORM pg_temp.expect_error(format('SELECT * FROM pg_temp.submit(%L,%L,''prepay'',2)',cat,svc),'payment_domain_not_enabled');
 PERFORM pg_temp.expect_error(format('SELECT * FROM public.submit_service_request_with_payment_choice_v1(''TEST'',''0500000000'',NULL,%L,''[]'',''TEST'',''TEST'',''مكة المكرمة'',''TEST'',21.4,39.8,current_date+1,''morning'')',cat),'invalid_catalog_services');
 PERFORM pg_temp.expect_error(format('SELECT * FROM public.submit_service_request_with_payment_choice_v1(''TEST'',''0500000000'',NULL,%L,%L,''TEST'',''TEST'',''مكة المكرمة'',''TEST'',21.4,39.8,current_date+1,''morning'')',cat,jsonb_build_array(jsonb_build_object('id',svc),jsonb_build_object('id',svc))),'duplicate_catalog_service');
 RESET ROLE;
 IF (SELECT count(*) FROM service_requests)<>before_count OR (SELECT count(*) FROM service_request_events)<>before_events THEN RAISE EXCEPTION 'disabled_partial_rows';END IF;

 IF EXISTS(SELECT 1 FROM service_request_payments) OR EXISTS(SELECT 1 FROM payment_attempts) OR EXISTS(SELECT 1 FROM technician_collections) OR EXISTS(SELECT 1 FROM invoices) THEN RAISE EXCEPTION 'financial_creation';END IF;
END $$;
SELECT 'PASS' result;
ROLLBACK;
