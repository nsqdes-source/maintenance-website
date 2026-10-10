-- Synthetic fixtures only, target wsjmaojgjzxkmxywvcfy. Every fixture rolls back.
BEGIN;
SET LOCAL search_path=public,extensions;
CREATE TEMP TABLE m6_results(name text primary key,result text);
CREATE FUNCTION pg_temp.assert_state(p_request uuid,p_expected jsonb,p_name text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual jsonb;
BEGIN actual:=private.payment_financial_state(p_request);IF NOT actual @> p_expected THEN RAISE EXCEPTION '% expected %, got %',p_name,p_expected,actual; END IF;INSERT INTO m6_results VALUES(p_name,'PASS');END $$;
CREATE FUNCTION pg_temp.reject(p_sql text,p_error text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE denied boolean:=false;
BEGIN BEGIN EXECUTE p_sql;EXCEPTION WHEN OTHERS THEN IF p_error IS NULL OR SQLERRM=p_error OR SQLSTATE=p_error THEN denied:=true;ELSE RAISE;END IF;END;IF NOT denied THEN RAISE EXCEPTION 'rejection_missing: %',p_sql;END IF;END $$;
DO $test$
DECLARE a uuid:='66000000-0000-4000-8000-000000000001';c uuid:='66000000-0000-4000-8000-000000000002';t uuid:='66000000-0000-4000-8000-000000000003';
 cat uuid:=gen_random_uuid();svc uuid:=gen_random_uuid();tech uuid;r uuid;rp uuid;rf uuid;bill uuid;rev bigint;old_receipt jsonb;attempt uuid;cash uuid;noncash uuid;receipt uuid;q uuid;cr uuid;cr2 uuid;r2 uuid;v jsonb;ts timestamptz;
BEGIN
 INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data) SELECT u,'authenticated','authenticated','test-m6-'||u::text||'@example.invalid','{"full_name":"TEST M6"}','{}' FROM unnest(ARRAY[a,c,t]) u;
 UPDATE profiles SET role='admin_manager' WHERE id=a; UPDATE profiles SET role='technician' WHERE id=t;
 INSERT INTO technicians(profile_id,notes) VALUES(t,'TEST M6') RETURNING id INTO tech;
 INSERT INTO business_finance_settings(id,legal_name,vat_registered,tax_rate) VALUES(true,'TEST M6',false,0);
 INSERT INTO service_catalog_items(id,service_key,name) VALUES(cat,'test-m6','TEST M6');
 INSERT INTO service_catalog_services(id,service_catalog_item_id,name,net_price,tax_rate,is_visit_service) VALUES(svc,cat,'TEST M6 regular',100,0,false);
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 INSERT INTO service_requests(customer_id,customer_name,phone,service_type,problem_description,city,address,payment_choice_timing) VALUES(c,'TEST M6','0500000000','TEST','TEST','مكة المكرمة','TEST','prepay') RETURNING id INTO r;
 INSERT INTO service_request_items(service_request_id,catalog_service_id,service_name,quantity,net_unit_price,tax_rate,gross_unit_price) VALUES(r,svc,'TEST M6',1,100,0,100);
 INSERT INTO service_request_assignments(service_request_id,technician_id,assigned_by,status,responded_at) VALUES(r,tech,a,'accepted',now());
 PERFORM set_config('request.jwt.claim.sub',t::text,true);cash:=technician_record_collection(r,'cash',40,'TEST_ALIAS_CASH');
 PERFORM pg_temp.assert_state(r,'{"gross_receipts":0,"technician_cash_custody":40,"customer_net_paid":40}','BEFORE');
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 UPDATE service_requests SET workflow_stage='completed' WHERE id=r;
 bill:=finance_ensure_invoice_draft(r);
 receipt:=finance_settle_technician_cash_collection(cash,'TEST_ALIAS_SETTLE');
 IF NOT EXISTS(SELECT 1 FROM service_request_payments s JOIN invoice_payments i ON i.id=s.transferred_invoice_payment_id WHERE s.id=receipt AND s.technician_collection_id=cash AND s.idempotency_key IS NOT NULL AND i.technician_collection_id=cash AND i.idempotency_key IS NULL AND i.obligation_snapshot=s.obligation_snapshot AND ROW(i.amount,i.method,i.paid_at,i.recorded_by)=ROW(s.amount,s.method,s.paid_at,s.recorded_by)) THEN RAISE EXCEPTION 'alias_invariant_failed'; END IF;
 IF NOT (SELECT status='settled' FROM technician_collections WHERE id=cash) THEN RAISE EXCEPTION 'not_settled'; END IF;
 PERFORM pg_temp.assert_state(r,'{"gross_receipts":40,"technician_cash_custody":0,"customer_net_paid":40}','TARGETED_COMPLETED_CASH_ALIAS');

 -- Fresh origin remains untransferred for forgery checks.
 INSERT INTO service_requests(customer_id,customer_name,phone,service_type,problem_description,city,address) VALUES(c,'TEST alias negatives','0500000000','TEST','TEST','مكة المكرمة','TEST') RETURNING id INTO r;
 INSERT INTO service_request_items(service_request_id,catalog_service_id,service_name,quantity,net_unit_price,tax_rate,gross_unit_price) VALUES(r,svc,'TEST',1,100,0,100);
 INSERT INTO service_request_assignments(service_request_id,technician_id,assigned_by,status,responded_at) VALUES(r,tech,a,'accepted',now());
 PERFORM set_config('request.jwt.claim.sub',t::text,true);cash:=technician_record_collection(r,'cash',10,'TEST_NEG_CASH');
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 PERFORM pg_temp.reject(format('INSERT INTO public.service_request_payments(service_request_id,amount,method,payment_type,recorded_by,technician_collection_id,obligation_snapshot) VALUES(%L,10,''cash'',''advance'',%L,%L,''{}'')',r,a,cash),'collection_receipt_mismatch');
 receipt:=finance_settle_technician_cash_collection(cash,'TEST_NEG_SETTLE');
 UPDATE service_requests SET workflow_stage='completed' WHERE id=r;bill:=finance_ensure_invoice_draft(r);
 -- Every forged alias is rejected inside a subtransaction, retaining origin.
 PERFORM pg_temp.reject(format('INSERT INTO public.invoice_payments(invoice_id,amount,method,paid_at,recorded_by,technician_collection_id,obligation_snapshot,idempotency_key) SELECT %L,amount,method,paid_at,recorded_by,technician_collection_id,obligation_snapshot,''forged-key'' FROM public.service_request_payments WHERE id=%L',bill,receipt),'invalid_collection_transfer_alias');
 PERFORM pg_temp.reject(format('INSERT INTO public.invoice_payments(invoice_id,amount,method,paid_at,recorded_by,technician_collection_id,obligation_snapshot) SELECT %L,amount,method,paid_at,recorded_by,technician_collection_id,''{}'' FROM public.service_request_payments WHERE id=%L',bill,receipt),'invalid_collection_transfer_alias');
 PERFORM pg_temp.reject(format('INSERT INTO public.invoice_payments(invoice_id,amount,method,paid_at,recorded_by,technician_collection_id,obligation_snapshot) SELECT %L,amount+1,method,paid_at,recorded_by,technician_collection_id,obligation_snapshot FROM public.service_request_payments WHERE id=%L',bill,receipt));
 PERFORM pg_temp.reject(format('INSERT INTO public.invoice_payments(invoice_id,amount,method,paid_at,recorded_by,technician_collection_id,obligation_snapshot) SELECT %L,amount,''card'',paid_at,recorded_by,technician_collection_id,obligation_snapshot FROM public.service_request_payments WHERE id=%L',bill,receipt));
 PERFORM pg_temp.reject(format('INSERT INTO public.invoice_payments(invoice_id,amount,method,paid_at,recorded_by,technician_collection_id,obligation_snapshot) SELECT %L,amount,method,paid_at-interval ''1 second'',recorded_by,technician_collection_id,obligation_snapshot FROM public.service_request_payments WHERE id=%L',bill,receipt));
 PERFORM pg_temp.reject(format('INSERT INTO public.invoice_payments(invoice_id,amount,method,paid_at,recorded_by,technician_collection_id,obligation_snapshot) SELECT %L,amount,method,paid_at,%L,technician_collection_id,obligation_snapshot FROM public.service_request_payments WHERE id=%L',bill,c,receipt));
 PERFORM private.finance_transfer_request_payments_to_invoice(bill,r);
 PERFORM pg_temp.reject(format('INSERT INTO public.invoice_payments(invoice_id,amount,method,paid_at,recorded_by,technician_collection_id,obligation_snapshot) SELECT invoice_id,amount,method,paid_at,recorded_by,technician_collection_id,obligation_snapshot FROM public.invoice_payments WHERE technician_collection_id=%L',cash),'invalid_collection_transfer_alias');
 -- No origin + NULL key is not a valid canonical posting or alias.
 PERFORM pg_temp.reject(format('INSERT INTO public.invoice_payments(invoice_id,amount,method,recorded_by,technician_collection_id,obligation_snapshot) VALUES(%L,10,''cash'',%L,%L,''{}'')',bill,a,gen_random_uuid()));
 INSERT INTO m6_results VALUES('TARGETED_ALIAS_NEGATIVES','PASS');
END $test$;
SELECT * FROM m6_results;
ROLLBACK;
