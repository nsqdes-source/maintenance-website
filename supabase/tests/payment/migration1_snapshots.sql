-- Test only: wsjmaojgjzxkmxywvcfy. All synthetic fixtures roll back.
BEGIN;
SET LOCAL search_path=public,extensions;
CREATE TEMP TABLE migration1_results(result jsonb);
DO $test$
DECLARE
 c uuid:='32000000-0000-4000-8000-000000000001'; cat uuid:=gen_random_uuid(); visit uuid:=gen_random_uuid();
 tech uuid; cr uuid; a uuid; b uuid; missing uuid; item uuid; change_item uuid; forged uuid;
 base_policy jsonb; bad jsonb; denied boolean; results jsonb:='{}';
BEGIN
 INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data) VALUES(c,'authenticated','authenticated','test-migration1@example.invalid','{"full_name":"TEST M1 CUSTOMER"}','{}');
 INSERT INTO technicians(profile_id,notes) VALUES(c,'TEST FIXTURE TECH') RETURNING id INTO tech;
 INSERT INTO service_catalog_items(id,service_key,name) VALUES(cat,'test-migration1','TEST M1 CATEGORY');
 INSERT INTO service_catalog_services(id,service_catalog_item_id,name,net_price,tax_rate,is_visit_service) VALUES(visit,cat,'TEST M1 VISIT',50,0,true);
 -- No singleton: preserve legacy request creation without inventing a policy.
 PERFORM set_config('request.jwt.claim.sub',c::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT request_id INTO missing FROM submit_service_request_v4('TEST CUSTOMER','0500000000','test-migration1@example.invalid',cat,jsonb_build_array(jsonb_build_object('id',visit,'quantity',1)),'TEST','TEST','مكة المكرمة','TEST ADDRESS',21.4,39.8,current_date+1,'morning'); EXECUTE 'RESET ROLE';
 IF NOT (SELECT payment_policy_snapshot IS NULL FROM service_requests WHERE id=missing) THEN RAISE EXCEPTION 'missing_settings_policy_fabricated'; END IF;
 INSERT INTO business_finance_settings(id,legal_name,vat_registered,tax_rate) VALUES(true,'TEST BUSINESS',false,15);
 SELECT payment_policy INTO base_policy FROM business_finance_settings WHERE id=true;
 IF NOT private.payment_policy_v1_is_valid(base_policy) OR NOT (SELECT payment_policy_version=1 AND NOT payment_domain_enabled AND NOT gateway_enabled AND gateway_provider IS NULL AND gateway_environment='test' FROM business_finance_settings WHERE id=true) THEN RAISE EXCEPTION 'defaults_invalid'; END IF;
 results:=results||jsonb_build_object('POLICY_V1_VALID','PASS','DEFAULTS','PASS','MISSING_SETTINGS_COMPATIBILITY','PASS');
 -- Reject missing keys, wrong timing/type, fixed-rule reversal, unsupported/duplicate methods and contradictory timing.
 FOR bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
  base_policy-'schema_version',jsonb_set(base_policy,'{original_timing}','null'),jsonb_set(base_policy,'{schema_version}','2'),
  jsonb_set(base_policy,'{allow_pay_on_arrival}','"true"'),jsonb_set(base_policy,'{refund_excess}','false'),
  jsonb_set(base_policy,'{allowed_methods}','["cash","cash"]'),jsonb_set(base_policy,'{allowed_methods}','["gateway"]'),
  jsonb_set(base_policy,'{allowed_methods}','[]'),base_policy||'{"extra_secret":"TEST REJECTED"}'::jsonb,
  base_policy||'{"original_timing":"pay_on_arrival","allow_pay_on_arrival":false}'::jsonb)) LOOP
  IF private.payment_policy_v1_is_valid(bad) IS DISTINCT FROM false THEN RAISE EXCEPTION 'invalid_policy_accepted_by_validator'; END IF;
  denied:=false; BEGIN UPDATE business_finance_settings SET payment_policy=bad,payment_policy_version=2 WHERE id=true;
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='invalid_payment_policy_v1' THEN denied:=true; ELSE RAISE; END IF; END;
  IF NOT denied THEN RAISE EXCEPTION 'invalid_policy_write_allowed'; END IF;
 END LOOP;
 denied:=false; BEGIN UPDATE business_finance_settings SET payment_policy=jsonb_set(base_policy,'{allow_work_before_balance}','false') WHERE id=true;
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='payment_policy_version_must_increase' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'policy_edit_without_version_allowed'; END IF;
 results:=results||jsonb_build_object('INVALID_POLICY_REJECTED','PASS','VERSION_GUARD','PASS');
 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT request_id INTO a FROM submit_service_request_v4('TEST A','0500000000','test-a@example.invalid',cat,jsonb_build_array(jsonb_build_object('id',visit,'quantity',1)),'TEST','TEST','مكة المكرمة','TEST ADDRESS',21.4,39.8,current_date+1,'morning'); EXECUTE 'RESET ROLE';
 SELECT id INTO item FROM service_request_items WHERE service_request_id=a;
 INSERT INTO service_request_change_requests(service_request_id,technician_id) VALUES(a,tech) RETURNING id INTO cr;
 INSERT INTO service_request_change_items(change_request_id,catalog_service_id,item_type,item_name,net_unit_price,tax_rate,gross_unit_price) VALUES(cr,visit,'service','TEST VISIT',50,0,50) RETURNING id INTO change_item;
 IF NOT (SELECT is_visit_service_snapshot AND classification_source='catalog_at_insert' AND classification_recorded_at IS NOT NULL AND classification_recorded_by=c AND gross_total=50 FROM service_request_items WHERE id=item)
 OR NOT (SELECT is_visit_service_snapshot AND classification_source='catalog_at_insert' AND classification_recorded_at IS NOT NULL AND classification_recorded_by=c AND gross_total=50 FROM service_request_change_items WHERE id=change_item) THEN RAISE EXCEPTION 'visit_snapshot_failed'; END IF;
 UPDATE service_catalog_services SET is_visit_service=false WHERE id=visit;
 IF NOT (SELECT is_visit_service_snapshot FROM service_request_items WHERE id=item) OR NOT (SELECT is_visit_service_snapshot FROM service_request_change_items WHERE id=change_item) THEN RAISE EXCEPTION 'catalog_reclassified_history'; END IF;
 denied:=false; BEGIN UPDATE service_request_items SET is_visit_service_snapshot=false WHERE id=item;
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='item_classification_snapshot_is_immutable' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'item_snapshot_mutable'; END IF;
 denied:=false; BEGIN UPDATE service_request_change_items SET is_visit_service_snapshot=false WHERE id=change_item;
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='item_classification_snapshot_is_immutable' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'change_snapshot_mutable'; END IF;
 -- Spoofed supplied classification is overwritten with the current false fact.
 INSERT INTO service_request_items(service_request_id,catalog_service_id,service_name,net_unit_price,tax_rate,gross_unit_price,item_source,is_visit_service_snapshot,classification_source,classification_recorded_at)
 VALUES(a,visit,'TEST FORGED',50,0,50,'customer_request',true,'legacy_verified',now()) RETURNING id INTO forged;
 IF NOT (SELECT is_visit_service_snapshot=false AND classification_source='catalog_at_insert' FROM service_request_items WHERE id=forged) THEN RAISE EXCEPTION 'forged_snapshot_trusted'; END IF;
 -- No catalog evidence remains UNKNOWN; attaching catalog later never fabricates an insertion-time fact.
 INSERT INTO service_request_items(service_request_id,catalog_service_id,service_name,net_unit_price,tax_rate,gross_unit_price,item_source)
 VALUES(a,NULL,'TEST UNKNOWN',10,0,10,'customer_request') RETURNING id INTO forged;
 UPDATE service_request_items SET catalog_service_id=visit WHERE id=forged;
 IF NOT (SELECT is_visit_service_snapshot IS NULL AND classification_source IS NULL FROM service_request_items WHERE id=forged) THEN RAISE EXCEPTION 'unknown_classification_invented'; END IF;
 INSERT INTO service_request_change_items(change_request_id,item_type,item_name,net_unit_price,tax_rate,gross_unit_price) VALUES(cr,'other','TEST UNKNOWN',10,0,10) RETURNING id INTO forged;
 IF NOT (SELECT is_visit_service_snapshot IS NULL AND classification_source IS NULL FROM service_request_change_items WHERE id=forged) THEN RAISE EXCEPTION 'noncatalog_false_invented'; END IF;
 results:=results||jsonb_build_object('VISIT_SNAPSHOT','PASS','VISIT_SNAPSHOT_IMMUTABLE','PASS','FORGED_CLASSIFICATION_IGNORED','PASS','UNKNOWN_CLASSIFICATION','PASS');
 UPDATE business_finance_settings SET payment_policy=jsonb_set(base_policy,'{allow_work_before_balance}','false'),payment_policy_version=2 WHERE id=true;
 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT request_id INTO b FROM submit_service_request_v4('TEST B','0500000000','test-b@example.invalid',cat,jsonb_build_array(jsonb_build_object('id',visit,'quantity',1)),'TEST','TEST','مكة المكرمة','TEST ADDRESS',21.4,39.8,current_date+1,'morning'); EXECUTE 'RESET ROLE';
 IF NOT (SELECT payment_policy_snapshot->>'policy_version'='1' AND payment_policy_snapshot->'policy'=base_policy AND payment_choice_timing IS NULL AND payment_choice_method IS NULL AND payment_revision=0 AND payment_domain_version=0 AND inspection_confirmed_at IS NULL AND inspection_earned_amount IS NULL AND work_started_at IS NULL FROM service_requests WHERE id=a)
 OR NOT (SELECT payment_policy_snapshot->>'policy_version'='2' AND payment_policy_snapshot->'policy'->'allow_work_before_balance'='false'::jsonb FROM service_requests WHERE id=b)
 OR NOT (SELECT payment_policy_snapshot IS NULL FROM service_requests WHERE id=missing) THEN RAISE EXCEPTION 'policy_versions_reinterpreted'; END IF;
 denied:=false; BEGIN UPDATE service_requests SET payment_policy_snapshot='{}' WHERE id=a;
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='payment_policy_snapshot_is_immutable' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'policy_snapshot_mutable'; END IF;
 INSERT INTO service_requests(customer_name,phone,service_type,problem_description,city,address,payment_policy_snapshot) VALUES('TEST FORGED POLICY','0500000000','TEST','TEST','مكة المكرمة','TEST','{"policy_version":999}') RETURNING id INTO forged;
 IF NOT (SELECT payment_policy_snapshot->>'policy_version'='2' FROM service_requests WHERE id=forged) THEN RAISE EXCEPTION 'client_policy_trusted'; END IF;
 results:=results||jsonb_build_object('POLICY_SNAPSHOT','PASS','POLICY_SNAPSHOT_IMMUTABLE','PASS','FORGED_POLICY_IGNORED','PASS');
 denied:=false; BEGIN UPDATE service_requests SET inspection_earned_amount=-1 WHERE id=a; EXCEPTION WHEN check_violation OR insufficient_privilege THEN denied:=true; END; IF NOT denied THEN RAISE EXCEPTION 'negative_earned_allowed'; END IF;
 denied:=false; BEGIN UPDATE service_requests SET inspection_earned_amount='NaN'::numeric WHERE id=a; EXCEPTION WHEN check_violation OR insufficient_privilege THEN denied:=true; END; IF NOT denied THEN RAISE EXCEPTION 'nan_earned_allowed'; END IF;
 denied:=false; BEGIN UPDATE service_requests SET payment_choice_method='gateway' WHERE id=a; EXCEPTION WHEN check_violation THEN denied:=true; END; IF NOT denied THEN RAISE EXCEPTION 'invalid_method_allowed'; END IF;
 denied:=false; BEGIN UPDATE business_finance_settings SET gateway_environment='production' WHERE id=true; EXCEPTION WHEN check_violation THEN denied:=true; END; IF NOT denied THEN RAISE EXCEPTION 'invalid_environment_allowed'; END IF;
 IF (SELECT inspection_earned_amount IS NOT NULL FROM service_requests WHERE id=a) THEN RAISE EXCEPTION 'rejected_amount_was_stored'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.service_requests'::regclass AND conname='service_requests_inspection_earned_amount_chk' AND convalidated AND pg_get_constraintdef(oid)='CHECK (((inspection_earned_amount IS NULL) OR ((inspection_earned_amount >= (0)::numeric) AND (inspection_earned_amount <> ''NaN''::numeric))))') THEN RAISE EXCEPTION 'm1_amount_check_changed'; END IF;
 -- Reuse existing M1 synthetic technician/request; no persistent fixtures.
 UPDATE profiles SET role='technician' WHERE id=c;
 INSERT INTO service_request_assignments(service_request_id,technician_id,assigned_by,status,responded_at) VALUES(missing,tech,c,'accepted',now());
 UPDATE service_requests SET workflow_stage='in_progress' WHERE id=missing;
 PERFORM public.technician_confirm_inspection_earned(missing);
 IF NOT (SELECT inspection_confirmed_by=c AND inspection_earned_amount=(SELECT gross_total FROM service_request_items WHERE service_request_id=missing AND is_visit_service_snapshot=true) AND inspection_earned_amount>=0 AND inspection_earned_amount NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) FROM service_requests WHERE id=missing) THEN RAISE EXCEPTION 'legitimate_inspection_amount_invalid'; END IF;
 results:=results||jsonb_build_object('M1_INSPECTION_AMOUNT_CHECK_CONSTRAINT','PASS','M1_INSPECTION_NEGATIVE_GUARD','PASS','LEGITIMATE_INSPECTION_RPC','PASS');
 results:=results||jsonb_build_object('CONSTRAINTS','PASS');
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='private' AND p.proname LIKE 'payment_%' AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('service_role',p.oid,'EXECUTE'))) THEN RAISE EXCEPTION 'new_function_execute_exposed'; END IF;
 IF EXISTS(SELECT 1 FROM business_finance_settings WHERE payment_domain_enabled OR gateway_enabled) THEN RAISE EXCEPTION 'feature_activated'; END IF;
 INSERT INTO migration1_results VALUES(results||jsonb_build_object('FEATURE_GATE','PASS','NO_NEW_EXECUTE_GRANTS','PASS'));
END $test$;
SELECT result FROM migration1_results;
ROLLBACK;
