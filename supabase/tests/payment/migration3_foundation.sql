-- Synthetic rollback test: wsjmaojgjzxkmxywvcfy only.
BEGIN;
SET LOCAL search_path=public,extensions;
CREATE TEMP TABLE migration3_results(result jsonb);
CREATE FUNCTION pg_temp.expect_error(p_sql text,p_expected text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE denied boolean:=false;
BEGIN
 BEGIN EXECUTE p_sql;
 EXCEPTION WHEN OTHERS THEN
  IF p_expected IS NULL OR SQLERRM=p_expected OR SQLSTATE=p_expected THEN denied:=true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'expected_rejection_missing: %',p_sql; END IF;
END $$;
DO $test$
DECLARE
 a uuid:='34000000-0000-4000-8000-000000000001';c uuid:='34000000-0000-4000-8000-000000000002';
 t uuid:='34000000-0000-4000-8000-000000000003';t2 uuid:='34000000-0000-4000-8000-000000000004';m uuid:='34000000-0000-4000-8000-000000000005';
 r uuid;r2 uuid;tech uuid;tech2 uuid;inv uuid;rp uuid;rp2 uuid;rp3 uuid;rpvoid uuid;ip uuid;
 attempt uuid;late uuid;f uuid;f2 uuid;rejectf uuid;cancelf uuid;cash uuid;noncash uuid;claim uuid;
 bad numeric;uid uuid;fn record;before_rp jsonb;before_ip jsonb;results jsonb:='{}';states text[];nextstate text;startstate text;
BEGIN
 INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data)
 SELECT u,'authenticated','authenticated','test-m3-'||u::text||'@example.invalid','{"full_name":"TEST M3 SYNTHETIC"}','{}' FROM unnest(ARRAY[a,c,t,t2,m]) u;
 UPDATE profiles SET role='admin_manager' WHERE id=a; UPDATE profiles SET role='technician' WHERE id IN (t,t2); UPDATE profiles SET role='maintenance_manager' WHERE id=m;
 INSERT INTO technicians(profile_id,notes) VALUES(t,'TEST') RETURNING id INTO tech;
 INSERT INTO technicians(profile_id,notes) VALUES(t2,'TEST') RETURNING id INTO tech2;
 INSERT INTO business_finance_settings(id,legal_name,vat_registered,tax_rate) VALUES(true,'TEST M3',false,0);
 INSERT INTO service_requests(customer_name,phone,service_type,problem_description,city,address)
 VALUES('TEST M3 A','0500000000','TEST','TEST','مكة المكرمة','TEST') RETURNING id INTO r;
 INSERT INTO service_requests(customer_name,phone,service_type,problem_description,city,address)
 VALUES('TEST M3 B','0500000000','TEST','TEST','مكة المكرمة','TEST') RETURNING id INTO r2;
 INSERT INTO service_request_assignments(service_request_id,technician_id,assigned_by,status,responded_at) VALUES(r,tech,a,'accepted',now());
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 -- Existing ledger fixtures are created deliberately before testing foundation operations.
 -- Canonical receipt is created by the current posting helper below.
 
 
 rpvoid:=finance_record_service_request_payment(r,20,'advance','cash','TEST M3 voided origin');
 PERFORM finance_void_service_request_payment(rpvoid);
 FOREACH bad IN ARRAY ARRAY[0::numeric,-1::numeric,'NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric,1.001::numeric] LOOP
  PERFORM pg_temp.expect_error(format('SELECT private.payment_create_attempt(%L,%L::numeric,''TEST_PROVIDER'',''test'',%L)',r,bad,gen_random_uuid()::text),'invalid_attempt_amount');
 END LOOP;
 attempt:=private.payment_create_attempt(r,100,'TEST_PROVIDER','test','TEST_ATTEMPT_1');
 IF NOT (SELECT status='created' AND obligation_snapshot->>'authoritative_charge_calculated'='false' AND obligation_revision=0 AND reservation_active FROM payment_attempts WHERE id=attempt) THEN RAISE EXCEPTION 'attempt_snapshot_invalid'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT private.payment_create_attempt(%L,100,''TEST_PROVIDER'',''test'',''TEST_ATTEMPT_1'')',r),'23505');
 PERFORM pg_temp.expect_error(format('SELECT private.payment_transition_attempt(%L,''succeeded'',''TEST_TX_1'',100,''SAR'',%L,NULL)',attempt,rp),'invalid_payment_attempt_transition');
 PERFORM private.payment_transition_attempt(attempt,'pending');
 PERFORM pg_temp.expect_error(format('SELECT private.payment_transition_attempt(%L,''succeeded'',''TEST_TX_1'',100,''SAR'')',attempt));
 PERFORM private.payment_transition_attempt(attempt,'requires_reconciliation','TEST_TX_1',100,'SAR');
 IF NOT (SELECT NOT reservation_active AND verified_at IS NOT NULL AND posted_at IS NULL FROM payment_attempts WHERE id=attempt) THEN RAISE EXCEPTION 'reconciliation_semantics_invalid'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT private.payment_transition_attempt(%L,''pending'')',attempt),'invalid_payment_attempt_transition');
 rp:=private.payment_post_verified_attempt(attempt,'TEST_M3_POST');
 IF NOT EXISTS(SELECT 1 FROM payment_attempts a JOIN service_request_payments p ON p.id=a.posted_request_payment_id WHERE a.id=attempt AND a.status='succeeded' AND p.payment_attempt_id=a.id AND a.posted_invoice_payment_id IS NULL) THEN RAISE EXCEPTION 'legal_reverse_provenance_missing'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT private.payment_transition_attempt(%L,''failed'')',attempt),'payment_attempt_is_immutable');
 late:=private.payment_create_attempt(r,20,'TEST_PROVIDER','test','TEST_LATE_FAILED');
 PERFORM private.payment_transition_attempt(late,'failed');PERFORM private.payment_transition_attempt(late,'requires_reconciliation','TEST_TX_LATE_FAILED',20,'SAR');rp2:=private.payment_post_verified_attempt(late,'TEST_M3_LATE_FAILED_POST');
 late:=private.payment_create_attempt(r,20,'TEST_PROVIDER','test','TEST_LATE_CANCELLED');
 PERFORM private.payment_transition_attempt(late,'cancelled');PERFORM private.payment_transition_attempt(late,'requires_reconciliation','TEST_TX_LATE_CANCELLED',20,'SAR');
 rp3:=private.payment_post_verified_attempt(late,'TEST_M3_LATE_CANCELLED_POST');
 late:=private.payment_create_attempt(r,100,'TEST_PROVIDER','test','TEST_TX_DUP');PERFORM private.payment_transition_attempt(late,'pending');
 PERFORM pg_temp.expect_error(format('SELECT private.payment_transition_attempt(%L,''requires_reconciliation'',''TEST_TX_1'',100,''SAR'')',late),'23505');
 PERFORM pg_temp.expect_error(format('UPDATE public.payment_attempts SET requested_amount=99 WHERE id=%L',late),'payment_attempt_identity_is_immutable');
 results:=results||jsonb_build_object('ATTEMPT_AMOUNT_GUARDS','PASS','ATTEMPT_IDEMPOTENCY','PASS','PROVIDER_TRANSACTION_UNIQUENESS','PASS','ATTEMPT_STATE_MACHINE','PASS','ATTEMPT_POSTING_XOR','PASS','TERMINAL_SUCCESS','PASS','LATE_PROVIDER_RESULT','PASS');
 PERFORM set_config('request.jwt.claim.sub',c::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM pg_temp.expect_error(format('SELECT private.payment_transition_attempt(%L,''succeeded'')',late),'42501');
 PERFORM pg_temp.expect_error(format('INSERT INTO public.payment_attempts(service_request_id,requested_amount,currency,provider,environment,idempotency_key,obligation_revision,obligation_snapshot) VALUES(%L,1,''SAR'',''TEST_PROVIDER'',''test'',''TEST_FAKE'',0,''{}'')',r),'42501');EXECUTE 'RESET ROLE';
 results:=results||jsonb_build_object('CLIENT_CANNOT_FAKE_SUCCESS','PASS');
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 f:=finance_request_refund(r,rp,NULL,60,'TEST refund','TEST_REFUND_1');
 f2:=finance_request_refund(r,rp,NULL,50,'TEST rival','TEST_REFUND_2');
 PERFORM finance_decide_refund(f,'approved');
 PERFORM pg_temp.expect_error(format('SELECT public.finance_decide_refund(%L,''approved'')',f2),'refund_reservation_exceeds_original_payment');
 FOREACH bad IN ARRAY ARRAY[0::numeric,-1::numeric,'NaN'::numeric,'Infinity'::numeric,1.001::numeric] LOOP
 PERFORM pg_temp.expect_error(format('SELECT public.finance_request_refund(%L,%L,NULL,%L::numeric,''TEST'',%L)',r,rp,bad,gen_random_uuid()::text),'invalid_refund_amount'); END LOOP;
 PERFORM pg_temp.expect_error(format('SELECT public.finance_request_refund(%L,%L,NULL,101,''TEST'',''TEST_EXCESS'')',r,rp),'refund_exceeds_original_payment');
 PERFORM pg_temp.expect_error(format('SELECT public.finance_request_refund(%L,%L,NULL,1,''TEST'',''TEST_VOID'')',r,rpvoid),'invalid_or_voided_refund_origin');
 PERFORM pg_temp.expect_error(format('SELECT public.finance_request_refund(%L,NULL,NULL,1,''TEST'',''TEST_NO_ORIGIN'')',r),'refund_origin_xor_required');
 PERFORM pg_temp.expect_error(format('SELECT public.finance_request_refund(%L,%L,%L,1,''TEST'',''TEST_BOTH_ORIGIN'')',r,rp,gen_random_uuid()),'refund_origin_xor_required');
 PERFORM private.payment_transition_refund(f,'pending');PERFORM private.payment_transition_refund(f,'succeeded');
 PERFORM pg_temp.expect_error(format('UPDATE public.payment_refunds SET amount=1 WHERE id=%L',f),'payment_refund_is_immutable');
 rejectf:=finance_request_refund(r,rp,NULL,1,'TEST reject','TEST_REJECT');PERFORM finance_decide_refund(rejectf,'rejected');
 cancelf:=finance_request_refund(r,rp,NULL,1,'TEST cancel','TEST_CANCEL');PERFORM finance_decide_refund(cancelf,'cancelled');
 PERFORM pg_temp.expect_error(format('SELECT public.finance_decide_refund(%L,''approved'')',rejectf),'payment_refund_is_immutable');
 PERFORM pg_temp.expect_error(format('SELECT public.finance_decide_refund(%L,''approved'')',cancelf),'payment_refund_is_immutable');
 PERFORM finance_decide_refund(f2,'rejected');
 f2:=finance_request_refund(r,rp,NULL,10,'TEST fail','TEST_FAIL');PERFORM finance_decide_refund(f2,'approved');PERFORM private.payment_transition_refund(f2,'pending');PERFORM private.payment_transition_refund(f2,'failed',NULL,'TEST_FAILURE');
 PERFORM pg_temp.expect_error(format('SELECT private.payment_transition_refund(%L,''pending'')',f2),'payment_refund_is_immutable');
 -- Canonical transferred source remains request payment; alias cannot be refunded again.
 INSERT INTO invoices(service_request_id,customer_name,customer_email,business_name,business_address,business_email,business_tax_number,vat_registered,description,subtotal,tax_rate,tax_amount,total,created_by)
 VALUES(r,'TEST','test-m3@example.invalid','TEST','','','',false,'TEST',200,0,0,200,a) RETURNING id INTO inv;
 PERFORM private.finance_transfer_request_payments_to_invoice(inv,r);
 SELECT transferred_invoice_payment_id INTO ip FROM service_request_payments WHERE id=rp;
 PERFORM pg_temp.expect_error(format('SELECT public.finance_request_refund(%L,NULL,%L,1,''TEST alias'',''TEST_ALIAS'')',r,ip),'refund_requires_canonical_request_payment');
 f2:=finance_request_refund(r,rp,NULL,40,'TEST remaining canonical','TEST_CANONICAL');PERFORM finance_decide_refund(f2,'approved');
 PERFORM pg_temp.expect_error(format('SELECT public.finance_request_refund(%L,%L,NULL,1,''TEST wrong request'',''TEST_WRONG_REQUEST'')',r2,rp),'invalid_or_voided_refund_origin');
 FOREACH uid IN ARRAY ARRAY[c,t,m] LOOP
  PERFORM set_config('request.jwt.claim.sub',uid::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM pg_temp.expect_error(format('SELECT public.finance_request_refund(%L,%L,NULL,1,''TEST denied'',''TEST_DENIED'')',r,rp),'42501');
  PERFORM pg_temp.expect_error(format('SELECT public.finance_decide_refund(%L,''approved'')',f2),'42501');
  PERFORM pg_temp.expect_error(format('SELECT private.payment_transition_refund(%L,''succeeded'')',f2),'42501');EXECUTE 'RESET ROLE';
 END LOOP;
 results:=results||jsonb_build_object('REFUND_ORIGIN_XOR','PASS','REFUND_CANONICAL_ORIGIN','PASS','REFUND_AMOUNT_GUARDS','PASS','REFUND_RESERVATION_GUARD','PASS','REFUND_STATE_MACHINE','PASS','REFUND_TERMINAL_IMMUTABILITY','PASS','REFUND_ROLE_NEGATIVE','PASS');
 SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') INTO before_rp FROM service_request_payments p;
 SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') INTO before_ip FROM invoice_payments p;
 PERFORM set_config('request.jwt.claim.sub',t::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 cash:=technician_record_collection(r,'cash',50,'TEST_CASH');noncash:=technician_record_collection(r,'card',20,'TEST_NONCASH');claim:=technician_record_collection(r,'bank_transfer',10,'TEST_REJECT_CLAIM');
 PERFORM pg_temp.expect_error(format('SELECT public.technician_record_collection(%L,''cash'',1,''TEST_UNASSIGNED'')',r2),'accepted_assignment_not_found');
 PERFORM pg_temp.expect_error(format('SELECT public.finance_verify_technician_collection(%L,true)',noncash),'42501');
 PERFORM pg_temp.expect_error(format('SELECT public.technician_record_collection(%L,''cash'',50,''TEST_CASH'')',r),'23505');EXECUTE 'RESET ROLE';
 IF NOT (SELECT technician_id=tech AND recorded_by=t AND status='pending_settlement' FROM technician_collections WHERE id=cash) OR NOT (SELECT status='pending_verification' FROM technician_collections WHERE id=noncash) THEN RAISE EXCEPTION 'collection_initial_state_invalid'; END IF;
 PERFORM set_config('request.jwt.claim.sub',t2::text,true);EXECUTE 'SET LOCAL ROLE authenticated';PERFORM pg_temp.expect_error(format('SELECT public.technician_record_collection(%L,''cash'',1,''TEST_WRONG_TECH'')',r),'accepted_assignment_not_found');EXECUTE 'RESET ROLE';
 -- No technician parameter exists; identity spoof through owner INSERT is guarded too.
 PERFORM set_config('request.jwt.claim.sub',t::text,true);
 PERFORM pg_temp.expect_error(format('INSERT INTO public.technician_collections(service_request_id,technician_id,collection_method,amount,currency,status,collected_at,recorded_by,idempotency_key) VALUES(%L,%L,''cash'',1,''SAR'',''pending_settlement'',now(),%L,''TEST_SPOOF'')',r,tech2,t),'42501');
 UPDATE profiles SET role='admin_manager' WHERE id=t;
 PERFORM pg_temp.expect_error(format('SELECT public.finance_verify_technician_collection(%L,true)',noncash),'collection_self_decision_forbidden');UPDATE profiles SET role='technician' WHERE id=t;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM finance_verify_technician_collection(noncash,true);PERFORM finance_verify_technician_collection(claim,false,'TEST rejected evidence');PERFORM finance_void_technician_collection_record(cash,'TEST mistaken record');
 PERFORM pg_temp.expect_error(format('SELECT public.technician_record_collection(%L,''cash'',1,''TEST_ADMIN_IMPERSONATION'')',r),'42501');EXECUTE 'RESET ROLE';
 IF NOT (SELECT status='verified' AND verified_by=a FROM technician_collections WHERE id=noncash) OR NOT (SELECT status='void_recorded' AND voided_by=a FROM technician_collections WHERE id=cash) THEN RAISE EXCEPTION 'collection_decision_invalid'; END IF;
 PERFORM pg_temp.expect_error(format('UPDATE public.technician_collections SET status=''settled'',settled_by=%L,settled_at=now() WHERE id=%L',a,cash),'invalid_collection_transition');
 PERFORM set_config('request.jwt.claim.sub',t::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM pg_temp.expect_error(format('SELECT public.finance_settle_technician_cash_collection(%L,''TEST_M3_DENIED'')',cash),'42501');EXECUTE 'RESET ROLE';
 IF before_rp IS DISTINCT FROM (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') FROM service_request_payments p) OR before_ip IS DISTINCT FROM (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') FROM invoice_payments p) THEN RAISE EXCEPTION 'collection_posted_receipt'; END IF;
 results:=results||jsonb_build_object('TECHNICIAN_COLLECTION_OWNERSHIP','PASS','UNASSIGNED_TECHNICIAN_REJECTED','PASS','CASH_PENDING_SETTLEMENT','PASS','NONCASH_PENDING_VERIFICATION','PASS','FINANCE_VERIFY_NONCASH','PASS','TECHNICIAN_SELF_VERIFY_REJECTED','PASS','CASH_VOID_RECORD','PASS','TECHNICIAN_CANNOT_SETTLE','PASS','NO_RECEIPT_POSTING','PASS');
 FOREACH nextstate IN ARRAY ARRAY['payment_attempt_created','payment_attempt_status_changed','payment_refund_requested','payment_refund_approved','payment_refund_rejected','payment_refund_pending','payment_refund_succeeded','payment_refund_failed','payment_refund_cancelled','technician_collection_recorded','technician_collection_verified','technician_collection_rejected','technician_collection_void_recorded'] LOOP
 IF NOT EXISTS(SELECT 1 FROM private.payment_audit_events WHERE event_type=nextstate) THEN RAISE EXCEPTION 'audit_event_missing: %',nextstate; END IF; END LOOP;
 PERFORM pg_temp.expect_error('UPDATE private.payment_audit_events SET details=''{}''','payment_audit_is_append_only');PERFORM pg_temp.expect_error('DELETE FROM private.payment_audit_events','payment_audit_is_append_only');
 FOR fn IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname IN ('payment_foundation_context','payment_foundation_amount_valid','payment_foundation_require_finance','payment_guard_attempt','payment_create_attempt','payment_transition_attempt','payment_guard_refund','payment_transition_refund','payment_guard_collection','payment_audit_foundation') LOOP
 IF has_function_privilege('authenticated',fn.oid,'EXECUTE') OR has_function_privilege('anon',fn.oid,'EXECUTE') OR has_function_privilege('service_role',fn.oid,'EXECUTE') THEN RAISE EXCEPTION 'private_helper_exposed'; END IF; END LOOP;
 IF EXISTS(SELECT 1 FROM business_finance_settings WHERE payment_domain_enabled OR gateway_enabled) THEN RAISE EXCEPTION 'domain_activated'; END IF;
 INSERT INTO migration3_results VALUES(results||jsonb_build_object('AUDIT_EVENTS','PASS','AUDIT_IMMUTABILITY','PASS','PRIVATE_BOUNDARIES','PASS','FEATURE_GATES','PASS','M3_FIXTURE_EXPECTATION','UPDATED_FOR_M4_PROVENANCE'));
END $test$;
SELECT result FROM migration3_results;
ROLLBACK;
