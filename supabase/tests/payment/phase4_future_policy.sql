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
 INSERT INTO business_finance_settings(id,legal_name,vat_registered,tax_rate) VALUES(true,'TEST PHASE4',false,0);
 SELECT payment_policy INTO base FROM business_finance_settings;
 -- Future-path fixtures are transaction-only; the final ROLLBACK removes settings and enabled flag.
 UPDATE business_finance_settings SET payment_domain_enabled=true;
 FOREACH timing IN ARRAY ARRAY['customer_choice','prepay_required','pay_on_arrival','pay_after_completion'] LOOP
 policy:=jsonb_set(base,'{original_timing}',to_jsonb(timing)); ver:=ver+2;
 UPDATE business_finance_settings SET payment_policy=policy,payment_policy_version=ver;
 FOREACH choice IN ARRAY ARRAY['prepay','pay_on_arrival','pay_after_completion'] LOOP
 expected:=ver; SELECT count(*) INTO before_count FROM service_requests;
 IF timing='customer_choice' OR (timing='prepay_required' AND choice='prepay') OR timing=choice THEN
 SET LOCAL ROLE anon; SELECT * INTO r,tok FROM pg_temp.submit(cat,svc,choice,expected); RESET ROLE;
 IF NOT (SELECT payment_choice_timing=choice AND payment_policy_snapshot->'policy'=policy AND (payment_policy_snapshot->>'policy_version')::bigint=ver AND payment_revision=0 AND workflow_stage='awaiting_assignment' FROM service_requests WHERE id=r) THEN RAISE EXCEPTION 'enabled_mapping_bad';END IF;
 ELSE
 SET LOCAL ROLE anon; PERFORM pg_temp.expect_error(format('SELECT * FROM pg_temp.submit(%L,%L,%L,%s)',cat,svc,choice,expected),'payment_choice_not_allowed');RESET ROLE;
 IF (SELECT count(*) FROM service_requests)<>before_count THEN RAISE EXCEPTION 'enabled_invalid_partial';END IF;
 END IF;
 END LOOP;
 SELECT count(*) INTO before_count FROM service_requests;
 SET LOCAL ROLE anon;
 PERFORM pg_temp.expect_error(format('SELECT * FROM pg_temp.submit(%L,%L,''prepay'',%s)',cat,svc,ver-1),'payment_policy_version_conflict');
 PERFORM pg_temp.expect_error(format('SELECT * FROM pg_temp.submit(%L,%L,''prepay'',NULL)',cat,svc),'payment_policy_version_conflict');
 PERFORM pg_temp.expect_error(format('SELECT * FROM pg_temp.submit(%L,%L,NULL,%s)',cat,svc,ver),'invalid_payment_choice_timing');
 PERFORM pg_temp.expect_error(format('SELECT * FROM pg_temp.submit(%L,%L,''card'',%s)',cat,svc,ver),'invalid_payment_choice_timing');
 RESET ROLE;
 IF (SELECT count(*) FROM service_requests)<>before_count THEN RAISE EXCEPTION 'version_conflict_partial';END IF;
 END LOOP;
 policy:=base||'{"allow_pay_on_arrival":false,"allow_pay_after_completion":false}'::jsonb;ver:=ver+1;
 UPDATE business_finance_settings SET payment_policy=policy,payment_policy_version=ver;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.expect_error(format('SELECT * FROM pg_temp.submit(%L,%L,''pay_on_arrival'',%s)',cat,svc,ver),'payment_choice_not_allowed');
 PERFORM pg_temp.expect_error(format('SELECT * FROM pg_temp.submit(%L,%L,''pay_after_completion'',%s)',cat,svc,ver),'payment_choice_not_allowed');
 RESET ROLE;
 IF EXISTS(SELECT 1 FROM service_request_payments) OR EXISTS(SELECT 1 FROM invoice_payments) OR EXISTS(SELECT 1 FROM payment_attempts) OR EXISTS(SELECT 1 FROM technician_collections) OR EXISTS(SELECT 1 FROM invoices) THEN RAISE EXCEPTION 'financial_creation';END IF;
 IF (SELECT payment_policy_snapshot IS NOT NULL OR payment_choice_timing IS NOT NULL FROM service_requests WHERE id=legacy) THEN RAISE EXCEPTION 'legacy_reinterpreted';END IF;

END $$;
SELECT 'PASS' result;
ROLLBACK;
