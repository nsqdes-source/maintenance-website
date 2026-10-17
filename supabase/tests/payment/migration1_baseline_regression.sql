BEGIN;
SET LOCAL search_path=public,extensions;
CREATE TEMP TABLE smoke_results(result jsonb);
DO $smoke$
DECLARE
 c uuid:='27000000-0000-4000-8000-000000000001'; t uuid:='27000000-0000-4000-8000-000000000002'; a uuid:='27000000-0000-4000-8000-000000000003';
 cat uuid:=gen_random_uuid(); visit uuid:=gen_random_uuid(); repair uuid:=gen_random_uuid(); tech uuid; r uuid; assignment uuid; quote uuid; inv uuid; pre uuid; p uuid; fullp uuid; n int; totalgross numeric; denied boolean; affected int;
 results jsonb:='{}';
BEGIN
 INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data) VALUES(c,'authenticated','authenticated','test-customer@example.invalid','{"full_name":"TEST CUSTOMER"}','{}'),(t,'authenticated','authenticated','test-tech@example.invalid','{"full_name":"TEST TECHNICIAN"}','{}'),(a,'authenticated','authenticated','test-admin@example.invalid','{"full_name":"TEST ADMIN"}','{}');
 UPDATE profiles SET role='technician' WHERE id=t; UPDATE profiles SET role='admin_manager' WHERE id=a;
 INSERT INTO technicians(profile_id,notes) VALUES(t,'TEST ONLY') RETURNING id INTO tech;
 INSERT INTO business_finance_settings(id,legal_name,vat_registered,tax_rate,address,contact_email,tax_number) VALUES(true,'TEST BUSINESS',false,15,'TEST ADDRESS','test-business@example.invalid','');
 INSERT INTO service_catalog_items(id,service_key,name) VALUES(cat,'test-smoke','TEST CATEGORY');
 INSERT INTO service_catalog_services(id,service_catalog_item_id,name,net_price,tax_rate,is_visit_service) VALUES(visit,cat,'TEST VISIT',50,0,true),(repair,cat,'TEST REPAIR',200,0,false);
 FOR n IN 1..4 LOOP
 totalgross:=CASE n WHEN 3 THEN 30 WHEN 4 THEN 115 ELSE 200 END;
 IF n=4 THEN UPDATE business_finance_settings SET vat_registered=true WHERE id=true; END IF;
 PERFORM set_config('request.jwt.claim.sub',c::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT request_id INTO r FROM submit_service_request_v4('TEST CUSTOMER','0500000000','test-customer@example.invalid',cat,jsonb_build_array(jsonb_build_object('id',visit,'quantity',1),jsonb_build_object('id',repair,'quantity',1)),'TEST ISSUE','TEST PROBLEM','مكة المكرمة','TEST ADDRESS',21.4,39.8,current_date+1,'morning');
 EXECUTE 'RESET ROLE';
 IF NOT (SELECT count(*)=2 AND sum(gross_total)=250 FROM service_request_items WHERE service_request_id=r) THEN RAISE EXCEPTION 'REQUEST_FLOW_FAILED'; END IF;
 results:=results||jsonb_build_object('REQUEST_FLOW','PASS');
 PERFORM set_config('request.jwt.claim.sub',a::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM admin_assign_service_request(r,tech); EXECUTE 'RESET ROLE'; SELECT id INTO assignment FROM service_request_assignments WHERE service_request_id=r;
 PERFORM set_config('request.jwt.claim.sub',t::text,true); EXECUTE 'SET LOCAL ROLE authenticated'; PERFORM technician_respond_to_assignment(assignment,'accepted','TEST'); EXECUTE 'RESET ROLE';
 IF NOT (SELECT status='accepted' AND responded_at IS NOT NULL FROM service_request_assignments WHERE id=assignment) THEN RAISE EXCEPTION 'ASSIGNMENT_FAILED'; END IF;
 PERFORM set_config('request.jwt.claim.sub',a::text,true); EXECUTE 'SET LOCAL ROLE authenticated'; PERFORM admin_advance_service_request(r,'in_progress'); EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',t::text,true); EXECUTE 'SET LOCAL ROLE authenticated'; PERFORM technician_record_visit_outcome(r,'needs_followup','TEST','[{"description":"TEST REPAIR"}]'::jsonb); EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',a::text,true); EXECUTE 'SET LOCAL ROLE authenticated'; PERFORM admin_advance_service_request(r,'awaiting_admin_quote');
 quote:=admin_submit_service_request_quote(r,'TEST APPROVED WORK',jsonb_build_array(jsonb_build_object('item_type','service','description','TEST VISIT','quantity',1,'unit_price',50,'catalog_service_id',visit),jsonb_build_object('item_type','service','description','TEST REPAIR FINAL','quantity',1,'unit_price',totalgross,'catalog_service_id',repair))); EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',c::text,true); EXECUTE 'SET LOCAL ROLE authenticated'; PERFORM customer_decide_service_request_quote(quote,true,'TEST'); EXECUTE 'RESET ROLE';
 IF NOT (SELECT status='approved' FROM service_request_quotes WHERE id=quote) THEN RAISE EXCEPTION 'QUOTE_FAILED'; END IF; results:=results||jsonb_build_object('QUOTE_FLOW','PASS');
 PERFORM set_config('request.jwt.claim.sub',a::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
 IF n IN (1,3) THEN pre:=finance_record_service_request_payment(r,50,'visit_fee','card','TEST PREPAYMENT'); END IF;
 PERFORM admin_advance_service_request(r,'in_progress'); EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',t::text,true); EXECUTE 'SET LOCAL ROLE authenticated'; PERFORM technician_record_visit_outcome(r,'completed','TEST COMPLETE','[]'::jsonb); EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',a::text,true); EXECUTE 'SET LOCAL ROLE authenticated'; PERFORM admin_advance_service_request(r,'completed'); inv:=finance_ensure_invoice_draft(r); EXECUTE 'RESET ROLE';
 IF NOT (SELECT status='draft' AND total=totalgross FROM invoices WHERE id=inv) OR NOT (SELECT count(*)=1 AND sum(quantity*unit_price)=totalgross AND bool_and(description='TEST REPAIR FINAL') FROM invoice_line_items WHERE invoice_id=inv) THEN RAISE EXCEPTION 'DRAFT_OR_VISIT_LINES_FAILED'; END IF;
 results:=results||jsonb_build_object('DRAFT_INVOICE','PASS','ASSIGNMENT_TECHNICIAN','PASS');
 IF n=1 THEN
 IF NOT (SELECT amount=50 AND voided_at IS NULL AND transferred_invoice_payment_id IS NULL FROM service_request_payments WHERE id=pre) THEN RAISE EXCEPTION 'PREPAY_FAILED'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated'; PERFORM finance_set_invoice_status(inv,'issued'); EXECUTE 'RESET ROLE';
 IF NOT EXISTS(SELECT 1 FROM service_request_payments rp JOIN invoice_payments ip ON ip.id=rp.transferred_invoice_payment_id WHERE rp.id=pre AND rp.transferred_at IS NOT NULL AND ip.invoice_id=inv AND ip.amount=rp.amount AND ip.method=rp.method AND ip.paid_at=rp.paid_at AND ip.recorded_by=rp.recorded_by) THEN RAISE EXCEPTION 'TRANSFER_FAILED'; END IF;
 IF NOT (SELECT total-(SELECT sum(amount) FROM invoice_payments WHERE invoice_id=inv AND voided_at IS NULL)=150 FROM invoices WHERE id=inv) THEN RAISE EXCEPTION 'VISIT_CREDIT_FAILED'; END IF;
 results:=results||jsonb_build_object('PREINVOICE_PAYMENT','PASS','TRANSFER_TO_INVOICE','PASS','VISIT_SERVICE_CREDIT','PASS');
 EXECUTE 'SET LOCAL ROLE authenticated'; p:=finance_record_payment(inv,50,'cash','TEST PARTIAL'); EXECUTE 'RESET ROLE';
 IF NOT (SELECT paid_at IS NULL FROM invoices WHERE id=inv) THEN RAISE EXCEPTION 'PARTIAL_PAID_AT_FAILED'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated'; fullp:=finance_record_payment(inv,100,'bank_transfer','TEST FULL'); EXECUTE 'RESET ROLE';
 IF NOT (SELECT paid_at IS NOT NULL FROM invoices WHERE id=inv) OR NOT (SELECT sum(amount)=200 FROM invoice_payments WHERE invoice_id=inv AND voided_at IS NULL) THEN RAISE EXCEPTION 'FULL_FAILED'; END IF;
 denied:=false; EXECUTE 'SET LOCAL ROLE authenticated'; BEGIN PERFORM finance_record_payment(inv,1,'cash','TEST EXCESS'); EXCEPTION WHEN OTHERS THEN IF SQLERRM='payment_exceeds_balance' THEN denied:=true; ELSE RAISE; END IF; END; EXECUTE 'RESET ROLE'; IF NOT denied THEN RAISE EXCEPTION 'OVERPAYMENT_ALLOWED'; END IF;
 results:=results||jsonb_build_object('PARTIAL_COLLECTION','PASS','FULL_COLLECTION','PASS','OVERPAYMENT_REJECTED','PASS');
 FOREACH p IN ARRAY ARRAY[c,t] LOOP
 PERFORM set_config('request.jwt.claim.sub',p::text,true); EXECUTE 'SET LOCAL ROLE authenticated'; denied:=false;
 BEGIN PERFORM finance_record_payment(inv,1,'cash','TEST DENIED'); EXCEPTION WHEN OTHERS THEN IF SQLERRM='insufficient_privilege' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'UNAUTHORIZED_PAYMENT_ALLOWED'; END IF; denied:=false;
 BEGIN PERFORM finance_void_payment(fullp); EXCEPTION WHEN OTHERS THEN IF SQLERRM='insufficient_privilege' THEN denied:=true; ELSE RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'UNAUTHORIZED_VOID_ALLOWED'; END IF; EXECUTE 'RESET ROLE'; END LOOP;
 PERFORM set_config('request.jwt.claim.sub','',true); EXECUTE 'SET LOCAL ROLE anon'; UPDATE invoice_payments SET amount=999 WHERE id=fullp; GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'ANON_UPDATE_ALLOWED'; END IF; denied:=false;
 BEGIN INSERT INTO invoice_payments(invoice_id,amount,method) VALUES(inv,1,'cash'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'ANON_INSERT_ALLOWED'; END IF; EXECUTE 'RESET ROLE'; results:=results||jsonb_build_object('RLS_NEGATIVE_TESTS','PASS');
 PERFORM set_config('request.jwt.claim.sub',a::text,true); EXECUTE 'SET LOCAL ROLE authenticated'; PERFORM finance_void_payment(fullp); EXECUTE 'RESET ROLE'; SELECT transferred_invoice_payment_id INTO p FROM service_request_payments WHERE id=pre;
 EXECUTE 'SET LOCAL ROLE authenticated'; PERFORM finance_void_payment(p); EXECUTE 'RESET ROLE';
 IF NOT (SELECT paid_at IS NULL FROM invoices WHERE id=inv) OR NOT EXISTS(SELECT 1 FROM service_request_payments rp JOIN invoice_payments ip ON ip.id=rp.transferred_invoice_payment_id WHERE rp.id=pre AND rp.amount=50 AND ip.amount=50 AND rp.voided_at IS NOT NULL AND ip.voided_at IS NOT NULL AND rp.transferred_at IS NOT NULL) THEN RAISE EXCEPTION 'VOID_FAILED'; END IF; results:=results||jsonb_build_object('VOID_BEHAVIOR','PASS');
 ELSIF n=2 THEN
 EXECUTE 'SET LOCAL ROLE authenticated'; pre:=finance_record_service_request_payment(r,50,'deposit','card','TEST DRAFT'); EXECUTE 'RESET ROLE';
 IF NOT EXISTS(SELECT 1 FROM invoices b JOIN invoice_payments ip ON ip.invoice_id=b.id JOIN service_request_payments rp ON rp.transferred_invoice_payment_id=ip.id WHERE b.id=inv AND b.status='draft' AND ip.amount=50 AND ip.method='card' AND rp.id=pre) THEN RAISE EXCEPTION 'DRAFT_PAYMENT_FAILED'; END IF;
 results:=results||jsonb_build_object('DRAFT_INVOICE_PAYMENT_SUPPORTED','PASS','CARD_IS_LEDGER_METHOD_ONLY','PASS');
 ELSIF n=3 THEN
 denied:=false; EXECUTE 'SET LOCAL ROLE authenticated'; BEGIN PERFORM finance_set_invoice_status(inv,'issued'); EXCEPTION WHEN OTHERS THEN IF SQLERRM='preinvoice_payments_exceed_invoice_total' THEN denied:=true; ELSE RAISE; END IF; END; EXECUTE 'RESET ROLE';
 IF NOT denied OR NOT (SELECT status='draft' FROM invoices WHERE id=inv) OR NOT (SELECT amount=50 AND transferred_invoice_payment_id IS NULL FROM service_request_payments WHERE id=pre) OR EXISTS(SELECT 1 FROM invoice_payments WHERE invoice_id=inv) THEN RAISE EXCEPTION 'EXCESS_GAP_MISMATCH'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated'; PERFORM finance_void_service_request_payment(pre); EXECUTE 'RESET ROLE'; IF NOT (SELECT amount=50 AND voided_at IS NOT NULL FROM service_request_payments WHERE id=pre) THEN RAISE EXCEPTION 'VOID_REQUEST_FAILED'; END IF;
 results:=results||jsonb_build_object('EXCESS_PREPAYMENT_CURRENTLY_REJECTED','PASS','KNOWN_BASELINE_GAP_CONFIRMED','YES');
 ELSE
 IF NOT (SELECT subtotal=100 AND tax_amount=15 AND total=115 AND tax_rate=15 AND vat_registered FROM invoices WHERE id=inv) THEN RAISE EXCEPTION 'VAT_INCLUSIVE_FAILED'; END IF;
 denied:=false; EXECUTE 'SET LOCAL ROLE authenticated'; BEGIN PERFORM finance_set_invoice_status(inv,'issued'); EXCEPTION WHEN OTHERS THEN IF SQLERRM='tax_invoicing_integration_required' THEN denied:=true; ELSE RAISE; END IF; END; EXECUTE 'RESET ROLE';
 IF NOT denied OR NOT (SELECT status='draft' AND issued_at IS NULL FROM invoices WHERE id=inv) THEN RAISE EXCEPTION 'VAT_GUARD_FAILED'; END IF;
 UPDATE business_finance_settings SET vat_registered=false WHERE id=true;
 results:=results||jsonb_build_object('VAT_INCLUSIVE_ARITHMETIC','PASS','VAT_REGISTERED_GUARD','PASS');
 END IF;
 END LOOP;
 IF to_regclass('public.payment_attempts') IS NOT NULL OR to_regclass('public.payment_refunds') IS NOT NULL THEN RAISE EXCEPTION 'PAYMENT_DOMAIN_PRESENT'; END IF;
 INSERT INTO smoke_results VALUES(results||jsonb_build_object('BASELINE_BEHAVIOR','PASS'));
END $smoke$;
SELECT result FROM smoke_results;
ROLLBACK;
