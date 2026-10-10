BEGIN;
SET LOCAL search_path=public,extensions;
CREATE FUNCTION pg_temp.expect_error(q text,wanted text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text; BEGIN BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN got:=SQLERRM; END; IF got IS NULL OR (got<>wanted AND NOT (wanted='insufficient_privilege' AND got LIKE 'permission denied%')) THEN RAISE EXCEPTION 'expected %, got %',wanted,got; END IF; END $$;
DO $$
DECLARE base jsonb; policy jsonb; oldlegal jsonb; ver bigint; uid uuid; ro text; bad jsonb; timing text; f text;
BEGIN
 IF EXISTS(SELECT 1 FROM business_finance_settings) THEN RAISE EXCEPTION 'test_requires_empty_settings'; END IF;
 INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data)
 SELECT ('73000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'authenticated','authenticated','phase3-'||i||'@example.invalid','{"full_name":"TEST PHASE3"}','{}' FROM generate_series(1,5)i;
 UPDATE profiles SET role='technician' WHERE id='73000000-0000-4000-8000-000000000002';
 UPDATE profiles SET role='maintenance_manager' WHERE id='73000000-0000-4000-8000-000000000003';
 UPDATE profiles SET role='admin_manager' WHERE id='73000000-0000-4000-8000-000000000004';
 UPDATE profiles SET role='super_admin' WHERE id='73000000-0000-4000-8000-000000000005';
 PERFORM set_config('request.jwt.claim.sub','73000000-0000-4000-8000-000000000004',true); SET LOCAL ROLE authenticated;
 PERFORM pg_temp.expect_error($q$SELECT public.finance_save_payment_settings('{}',1,NULL)$q$,'finance_settings_not_initialized');
 RESET ROLE;
 IF EXISTS(SELECT 1 FROM business_finance_settings) THEN RAISE EXCEPTION 'fabricated_settings';END IF;
 INSERT INTO business_finance_settings(id,legal_name,address,contact_email,tax_number,vat_registered,tax_rate,currency) VALUES(true,'LEGAL TEST','ADDRESS TEST','phase3@example.invalid','TAX TEST',true,15,'SAR');
 SELECT payment_policy, to_jsonb(s)-ARRAY['payment_policy','payment_policy_version','gateway_provider','gateway_environment','updated_at'] INTO base,oldlegal FROM business_finance_settings s;
 FOR i IN 0..5 LOOP
 uid:=CASE WHEN i=0 THEN NULL ELSE ('73000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid END;
 PERFORM set_config('request.jwt.claim.sub',coalesce(uid::text,''),true);
 IF i=0 THEN SET LOCAL ROLE anon; ELSE SET LOCAL ROLE authenticated; END IF;
 IF i<4 THEN
 PERFORM pg_temp.expect_error(format('SELECT public.finance_save_payment_settings(%L,1,NULL)',base),'insufficient_privilege');
 IF EXISTS(SELECT 1 FROM public.business_finance_settings) AND i>0 THEN RAISE EXCEPTION 'rls_settings_exposure';END IF;
 ELSE
 SELECT public.finance_save_payment_settings(base,1,NULL) INTO ver;
 IF ver<>1 THEN RAISE EXCEPTION 'noop_incremented';END IF;
 END IF;
 IF has_table_privilege(current_user,'public.business_finance_settings','UPDATE') OR has_table_privilege(current_user,'public.business_finance_settings','MAINTAIN') OR has_function_privilege(current_user,'private.payment_policy_v1_is_valid(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'm7_boundary_broken';END IF;
 RESET ROLE;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub','73000000-0000-4000-8000-000000000004',true); SET LOCAL ROLE authenticated;
 ver:=1;
 FOREACH timing IN ARRAY ARRAY['customer_choice','prepay_required','pay_on_arrival','pay_after_completion'] LOOP
 policy:=jsonb_set(base,'{original_timing}',to_jsonb(timing));
 SELECT public.finance_save_payment_settings(policy,ver,NULL) INTO ver;
 END LOOP;
 IF ver<>4 THEN RAISE EXCEPTION 'policy_version_bad';END IF;
 IF public.finance_save_payment_settings(policy,ver,'  Test Provider  ')<>ver THEN RAISE EXCEPTION 'provider_incremented';END IF;
 IF public.finance_save_payment_settings(policy,ver,'Test Provider')<>ver THEN RAISE EXCEPTION 'noop_bad';END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.finance_save_payment_settings(%L,1,NULL)',policy),'payment_policy_version_conflict');
 FOR bad IN SELECT v FROM unnest(ARRAY[
 jsonb_set(base,'{original_timing}','"invalid"'),jsonb_set(base,'{additional_timing}','"invalid"'),
 jsonb_set(base,'{allowed_methods}','[]'),jsonb_set(base,'{allowed_methods}','["cash","cash"]'),
 jsonb_set(base,'{allowed_methods}','["online"]'),jsonb_set(base,'{schema_version}','2'),
 base||'{"allow_prepay":true}',base||'{"original_timing":"pay_on_arrival","allow_pay_on_arrival":false}',
 base||'{"original_timing":"pay_after_completion","allow_pay_after_completion":false}'
 ])v LOOP
 PERFORM pg_temp.expect_error(format('SELECT public.finance_save_payment_settings(%L,%s,NULL)',bad,ver),'invalid_payment_policy_v1');
 END LOOP;
 FOREACH f IN ARRAY ARRAY['inspection_included_in_final','retain_earned_inspection_on_rejection','refund_excess'] LOOP
 bad:=jsonb_set(base,ARRAY[f],'false'); PERFORM pg_temp.expect_error(format('SELECT public.finance_save_payment_settings(%L,%s,NULL)',bad,ver),'invalid_payment_policy_v1');
 END LOOP;
 FOREACH f IN ARRAY ARRAY['','   ','sk_live_SECRET','api_key secret','https://credentials.invalid',repeat('x',101)] LOOP
 PERFORM pg_temp.expect_error(format('SELECT public.finance_save_payment_settings(%L,%s,%L)',policy,ver,f),'invalid_gateway_provider'); END LOOP;
 RESET ROLE;
 IF (SELECT to_jsonb(s)-ARRAY['payment_policy','payment_policy_version','gateway_provider','gateway_environment','updated_at'] FROM business_finance_settings s) IS DISTINCT FROM oldlegal THEN RAISE EXCEPTION 'legal_or_gates_changed';END IF;
 IF NOT (SELECT gateway_provider='Test Provider' AND gateway_environment='test' AND NOT gateway_enabled AND NOT payment_domain_enabled FROM business_finance_settings) THEN RAISE EXCEPTION 'gate_bad';END IF;
 UPDATE business_finance_settings SET payment_domain_enabled=true;
 SET LOCAL ROLE authenticated; PERFORM pg_temp.expect_error(format('SELECT public.finance_save_payment_settings(%L,%s,NULL)',policy,ver),'payment_settings_phase3_gate_closed'); RESET ROLE;
 UPDATE business_finance_settings SET payment_domain_enabled=false,gateway_enabled=true;
 SET LOCAL ROLE authenticated; PERFORM pg_temp.expect_error(format('SELECT public.finance_save_payment_settings(%L,%s,NULL)',policy,ver),'payment_settings_phase3_gate_closed'); RESET ROLE;
 IF EXISTS(SELECT 1 FROM private.payment_audit_events WHERE event_type='payment_settings_updated' AND (details::text LIKE '%Test Provider%' OR details::text LIKE '%TAX TEST%')) THEN RAISE EXCEPTION 'audit_leak';END IF;
END $$;
SELECT 'PHASE3_RPC_MATRIX_PASS' result;
ROLLBACK;
