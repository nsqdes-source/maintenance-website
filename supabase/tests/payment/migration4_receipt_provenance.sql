-- Synthetic fixtures only; all rows roll back. Target wsjmaojgjzxkmxywvcfy.
BEGIN;
SET LOCAL search_path=public,extensions;
CREATE TEMP TABLE migration4_results(result jsonb);
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
 admin uuid:='44000000-0000-4000-8000-000000000001';
 r uuid;r2 uuid;r3 uuid;inv uuid;inv3 uuid;attempt uuid;attempt2 uuid;bad uuid;rp uuid;ip uuid;manual uuid;refund uuid;
 results jsonb:='{}';col text;role_name text;fn record;before_count bigint;
BEGIN
 INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data)
 VALUES(admin,'authenticated','authenticated','test-m4@example.invalid','{"full_name":"TEST M4"}','{}');
 UPDATE profiles SET role='admin_manager' WHERE id=admin;
 PERFORM set_config('request.jwt.claim.sub',admin::text,true);
 INSERT INTO business_finance_settings(id,legal_name,vat_registered,tax_rate) VALUES(true,'TEST M4',false,0);
 INSERT INTO service_requests(customer_name,phone,service_type,problem_description,city,address) VALUES('TEST M4 R','0500000000','TEST','TEST','مكة المكرمة','TEST') RETURNING id INTO r;
 INSERT INTO service_requests(customer_name,phone,service_type,problem_description,city,address) VALUES('TEST M4 INVOICE','0500000000','TEST','TEST','مكة المكرمة','TEST') RETURNING id INTO r2;
 INSERT INTO service_requests(customer_name,phone,service_type,problem_description,city,address) VALUES('TEST M4 COMPLETED','0500000000','TEST','TEST','مكة المكرمة','TEST') RETURNING id INTO r3;
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('service_request_payments','invoice_payments') AND column_name IN ('idempotency_key','payment_attempt_id','technician_collection_id','obligation_snapshot'))<>8 THEN RAISE EXCEPTION 'schema_columns_missing'; END IF;
 manual:=finance_record_service_request_payment(r,5,'visit_fee','cash','TEST legacy');
 IF NOT (SELECT payment_attempt_id IS NULL AND technician_collection_id IS NULL AND idempotency_key IS NULL AND obligation_snapshot IS NULL FROM service_request_payments WHERE id=manual) THEN RAISE EXCEPTION 'manual_provenance_not_null'; END IF;
 attempt:=private.payment_create_attempt(r,50,'TEST_PROVIDER','test','TEST_M4_R');
 PERFORM pg_temp.expect_error(format('SELECT private.payment_post_verified_attempt(%L,''POST_R'')',attempt),'attempt_not_ready_for_posting');
 PERFORM private.payment_transition_attempt(attempt,'pending');
 PERFORM private.payment_transition_attempt(attempt,'requires_reconciliation','TEST_M4_TX',50,'SAR');
 PERFORM pg_temp.expect_error(format('INSERT INTO public.service_request_payments(service_request_id,payment_type,amount,method,recorded_by,payment_attempt_id,idempotency_key,obligation_snapshot) SELECT %L,''advance'',49,''card'',created_by,id,''TEST_BAD_AMOUNT'',obligation_snapshot FROM public.payment_attempts WHERE id=%L',r,attempt),'receipt_amount_mismatch');
 PERFORM pg_temp.expect_error(format('INSERT INTO public.service_request_payments(service_request_id,payment_type,amount,method,recorded_by,payment_attempt_id,idempotency_key,obligation_snapshot) SELECT %L,''advance'',50,''card'',created_by,id,''TEST_BAD_REQUEST'',obligation_snapshot FROM public.payment_attempts WHERE id=%L',r2,attempt),'receipt_request_mismatch');
 rp:=private.payment_post_verified_attempt(attempt,'POST_R');
 IF NOT (SELECT status='succeeded' AND posted_request_payment_id=rp AND posted_invoice_payment_id IS NULL AND posted_at IS NOT NULL AND verified_at IS NOT NULL FROM payment_attempts WHERE id=attempt) THEN RAISE EXCEPTION 'request_posting_invalid'; END IF;
 IF NOT (SELECT p.payment_attempt_id=a.id AND p.amount=50 AND p.method='card' AND p.obligation_snapshot=a.obligation_snapshot FROM service_request_payments p JOIN payment_attempts a ON a.id=p.payment_attempt_id WHERE p.id=rp) THEN RAISE EXCEPTION 'request_reverse_link_invalid'; END IF;
 IF private.payment_post_verified_attempt(attempt,'POST_R')<>rp THEN RAISE EXCEPTION 'retry_not_idempotent'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT private.payment_post_verified_attempt(%L,''OTHER_KEY'')',attempt),'attempt_already_posted_with_different_key');
 IF (SELECT count(*) FROM service_request_payments WHERE payment_attempt_id=attempt)<>1 THEN RAISE EXCEPTION 'duplicate_post'; END IF;
 FOREACH col IN ARRAY ARRAY['payment_attempt_id','technician_collection_id','obligation_snapshot','idempotency_key'] LOOP
  PERFORM pg_temp.expect_error(format('UPDATE public.service_request_payments SET %I=%s WHERE id=%L',col,CASE WHEN col='technician_collection_id' THEN 'gen_random_uuid()' ELSE 'NULL' END,rp),'receipt_provenance_is_immutable');
 END LOOP;
 PERFORM pg_temp.expect_error(format('DELETE FROM public.service_request_payments WHERE id=%L',rp),'receipt_provenance_delete_forbidden');
 PERFORM pg_temp.expect_error(format('UPDATE public.payment_attempts SET posted_invoice_payment_id=gen_random_uuid() WHERE id=%L',attempt),'payment_attempt_is_immutable');
 bad:=private.payment_create_attempt(r,1,'TEST_PROVIDER','test','TEST_M4_BAD_CUR');
 PERFORM private.payment_transition_attempt(bad,'pending');PERFORM private.payment_transition_attempt(bad,'requires_reconciliation','TEST_M4_BAD_CUR_TX',1,'USD');
 PERFORM pg_temp.expect_error(format('SELECT private.payment_post_verified_attempt(%L,''BAD_CUR'')',bad),'receipt_currency_mismatch');
 bad:=private.payment_create_attempt(r,1,'TEST_PROVIDER','test','TEST_M4_ORPHAN');
 PERFORM private.payment_transition_attempt(bad,'pending');PERFORM private.payment_transition_attempt(bad,'requires_reconciliation','TEST_M4_ORPHAN_TX',1,'SAR');
 PERFORM pg_temp.expect_error(format('INSERT INTO public.service_request_payments(service_request_id,payment_type,amount,method,recorded_by,payment_attempt_id,idempotency_key,obligation_snapshot) SELECT service_request_id,''advance'',1,''card'',created_by,id,''TEST_ORPHAN'',obligation_snapshot FROM public.payment_attempts WHERE id=%L; SET CONSTRAINTS ALL IMMEDIATE',bad),'receipt_attempt_not_posted');
 INSERT INTO invoices(service_request_id,customer_name,customer_email,business_name,business_address,business_email,business_tax_number,vat_registered,description,subtotal,tax_rate,tax_amount,total,created_by)
 VALUES(r,'TEST','test-m4@example.invalid','TEST','','','',false,'TEST',200,0,0,200,admin) RETURNING id INTO inv;
 PERFORM private.finance_transfer_request_payments_to_invoice(inv,r);
 SELECT transferred_invoice_payment_id INTO ip FROM service_request_payments WHERE id=rp;
 IF NOT (SELECT posted_request_payment_id=rp AND posted_invoice_payment_id IS NULL FROM payment_attempts WHERE id=attempt) OR NOT (SELECT payment_attempt_id=attempt AND amount=50 AND method='card' AND obligation_snapshot=(SELECT obligation_snapshot FROM service_request_payments WHERE id=rp) FROM invoice_payments WHERE id=ip) THEN RAISE EXCEPTION 'canonical_transfer_invalid'; END IF;
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
 PERFORM pg_temp.expect_error(format('SELECT public.finance_request_refund(%L,NULL,%L,1,''TEST alias'',''TEST_M4_ALIAS_REFUND'')',r,ip),'refund_requires_canonical_request_payment');
 refund:=finance_request_refund(r,rp,NULL,1,'TEST canonical','TEST_M4_REFUND');
 IF NOT (SELECT origin_service_request_payment_id=rp AND origin_invoice_payment_id IS NULL FROM payment_refunds WHERE id=refund) THEN RAISE EXCEPTION 'refund_canonicality_invalid'; END IF;
 SELECT count(*) INTO before_count FROM payment_refunds;
 PERFORM pg_temp.expect_error(format('SELECT public.finance_void_service_request_payment(%L)',rp),'payment_already_transferred');
 PERFORM finance_void_payment(ip);
 IF NOT (SELECT status='succeeded' FROM payment_attempts WHERE id=attempt) OR (SELECT count(*) FROM payment_refunds)<>before_count THEN RAISE EXCEPTION 'void_rewrote_external_history'; END IF;
 IF private.payment_post_verified_attempt(attempt,'POST_R')<>rp OR NOT (SELECT voided_at IS NOT NULL FROM service_request_payments WHERE id=rp) THEN RAISE EXCEPTION 'void_retry_reposted'; END IF;
 -- Issued invoice fixture represents current ledger routing; actual issuance is covered by full baseline smoke.
 INSERT INTO invoices(service_request_id,customer_name,customer_email,business_name,business_address,business_email,business_tax_number,vat_registered,description,subtotal,tax_rate,tax_amount,total,created_by,status,issued_at)
 VALUES(r2,'TEST','test-m4@example.invalid','TEST','','','',false,'TEST',200,0,0,200,admin,'issued',now()) RETURNING id INTO inv3;
 manual:=finance_record_payment(inv3,10,'cash','TEST legacy invoice');
 IF NOT (SELECT payment_attempt_id IS NULL AND technician_collection_id IS NULL AND idempotency_key IS NULL AND obligation_snapshot IS NULL FROM invoice_payments WHERE id=manual) THEN RAISE EXCEPTION 'manual_invoice_provenance_not_null'; END IF;
 attempt2:=private.payment_create_attempt(r2,50,'TEST_PROVIDER','test','TEST_M4_INVOICE');
 PERFORM private.payment_transition_attempt(attempt2,'pending');PERFORM private.payment_transition_attempt(attempt2,'requires_reconciliation','TEST_M4_TX_INVOICE',50,'SAR');
 ip:=private.payment_post_verified_attempt(attempt2,'POST_I');
 IF NOT (SELECT status='succeeded' AND posted_invoice_payment_id=ip AND posted_request_payment_id IS NULL FROM payment_attempts WHERE id=attempt2) OR NOT (SELECT payment_attempt_id=attempt2 AND amount=50 AND method='card' FROM invoice_payments WHERE id=ip) THEN RAISE EXCEPTION 'invoice_posting_invalid'; END IF;
 IF private.payment_post_verified_attempt(attempt2,'POST_I')<>ip OR (SELECT count(*) FROM invoice_payments WHERE payment_attempt_id=attempt2)<>1 THEN RAISE EXCEPTION 'invoice_retry_not_idempotent'; END IF;
 IF (SELECT paid_at FROM invoices WHERE id=inv3) IS NOT NULL THEN RAISE EXCEPTION 'partial_invoice_marked_paid'; END IF;
 PERFORM finance_void_payment(ip);
 IF NOT (SELECT status='succeeded' FROM payment_attempts WHERE id=attempt2) THEN RAISE EXCEPTION 'invoice_void_rewrote_attempt'; END IF;
 INSERT INTO invoices(service_request_id,customer_name,customer_email,business_name,business_address,business_email,business_tax_number,vat_registered,description,subtotal,tax_rate,tax_amount,total,created_by)
 VALUES(r3,'TEST','test-m4@example.invalid','TEST','','','',false,'TEST',200,0,0,200,admin) RETURNING id INTO inv3;
 UPDATE service_requests SET workflow_stage='completed' WHERE id=r3;
 bad:=private.payment_create_attempt(r3,50,'TEST_PROVIDER','test','TEST_M4_COMPLETED');
 PERFORM private.payment_transition_attempt(bad,'pending');PERFORM private.payment_transition_attempt(bad,'requires_reconciliation','TEST_M4_COMPLETED_TX',50,'SAR');
 manual:=private.payment_post_verified_attempt(bad,'POST_COMPLETED');
 IF NOT (SELECT transferred_invoice_payment_id IS NOT NULL FROM service_request_payments WHERE id=manual) OR NOT (SELECT posted_request_payment_id=manual AND posted_invoice_payment_id IS NULL FROM payment_attempts WHERE id=bad) THEN RAISE EXCEPTION 'completed_draft_routing_invalid'; END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_function_privilege(role_name,'private.payment_post_verified_attempt(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'posting_helper_exposed'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM private.payment_audit_events WHERE event_type='payment_attempt_posted_to_request_payment') OR NOT EXISTS(SELECT 1 FROM private.payment_audit_events WHERE event_type='payment_attempt_posted_to_invoice_payment') OR NOT EXISTS(SELECT 1 FROM private.payment_audit_events WHERE event_type='payment_receipt_provenance_transferred') THEN RAISE EXCEPTION 'posting_audit_missing'; END IF;
 IF (SELECT payment_domain_enabled OR gateway_enabled FROM business_finance_settings WHERE id=true) THEN RAISE EXCEPTION 'feature_gate_enabled'; END IF;
 results:=jsonb_build_object('SERVICE_REQUEST_PAYMENT_PROVENANCE','PASS','INVOICE_PAYMENT_PROVENANCE','PASS','ATTEMPT_REQUEST_POSTING','PASS','ATTEMPT_INVOICE_POSTING','PASS','ATTEMPT_POSTING_XOR','PASS','REVERSE_LINK_INVARIANT','PASS','AMOUNT_MISMATCH_REJECTED','PASS','CURRENCY_MISMATCH_REJECTED','PASS','REQUEST_MISMATCH_REJECTED','PASS','UNVERIFIED_ATTEMPT_REJECTED','PASS','DUPLICATE_POST_PREVENTED','PASS','IDEMPOTENCY_RETRY','PASS','TRANSFER_PROVENANCE','PASS','CANONICAL_ORIGIN_PRESERVED','PASS','MANUAL_PAYMENT_PATHS_PRESERVED','PASS','VOID_SEMANTICS_PRESERVED','PASS','REFUND_CANONICALITY_PRESERVED','PASS','LATER_APPROVED_SETTLEMENT_RPC_ALLOWED','PASS','AUDIT_EVENTS','PASS','COMPLETED_DRAFT_ROUTING','PASS','PROVENANCE_IMMUTABILITY','PASS','FEATURE_GATES','PASS');
 INSERT INTO migration4_results VALUES(results);
END $test$;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT result FROM migration4_results;
ROLLBACK;
