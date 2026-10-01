import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, classify, fingerprint, stableSerialize } from '../../lib/zatca/preparation.ts';
import { Decimal } from '../../lib/zatca/decimal.ts';
import { PreparationService } from '../../lib/zatca/server.ts';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
const at='2026-10-01T00:00:00.000Z';
const address={street:'ZATCA_TEST_ONLY Street',buildingNumber:'1234',district:'Test',city:'Test',postalCode:'12345',countryCode:'SA'};
function fixture() {
 return {
  sources:{invoice:{id:ids[0],number:'1',status:'draft',businessName:'ZATCA_TEST_ONLY',businessVat:'300000000000003',vatRegistered:true,currency:'SAR',taxRate:'15.00',subtotal:'50.00',taxAmount:'7.50',total:'57.50'},lines:[{id:ids[1],description:'ZATCA_TEST_ONLY Service',quantity:'1.00',unitPrice:'57.50',sortOrder:0,taxCategory:'S',allowances:[],charges:[]}],sellers:[{id:ids[2],active:true,legalName:'ZATCA_TEST_ONLY',vatNumber:'300000000000003',registration:{scheme:'OTH',value:'TESTONLY'},address}],payments:[]},
  input:{buyer:{buyerType:'consumer',vatRegistrationStatus:'not_registered',name:null,vatNumber:null,otherIdentifier:null,address:null,identityConfirmed:true,transactionCountry:'SA'},supplyDate:null,documentKind:'invoice',flags:{}},
  document:{id:ids[3],invoiceId:ids[0],uuid:ids[3],revisionNo:1,status:'draft',snapshot:null,fingerprint:null,frozenAt:null,validatedAt:null,issueAt:null,version:0}
 };
}
const run=f=>build(f.sources,f.input,f.document,at);
const has=(r,code)=>assert.ok(!r.ok && r.blockers.some(b=>b.code===code),JSON.stringify(r));
for(const [buyerType,expected] of [['consumer','simplified'],['business','standard'],['government','standard']]) test('classification '+buyerType,()=>assert.deepEqual(classify({...fixture().input.buyer,buyerType}),{ok:true,value:expected}));
for(const buyerType of ['unknown','export','special_case',undefined]) test('blocks buyer '+buyerType,()=>has(classify({...fixture().input.buyer,buyerType}),'BUYER_TYPE_UNKNOWN'));
function standard(f){f.input.buyer={...f.input.buyer,buyerType:'business',name:'ZATCA_TEST_ONLY Buyer',address,vatRegistrationStatus:'registered',vatNumber:'300000000000003'};f.input.supplyDate='2026-10-01';return f;}
test('standard registered without VAT',()=>{const f=standard(fixture());f.input.buyer.vatNumber=null;has(run(f),'BUYER_VAT_REQUIRED');});
test('standard without alternate ID',()=>{const f=standard(fixture());f.input.buyer.vatNumber=null;f.input.buyer.vatRegistrationStatus='not_registered';has(run(f),'BUYER_IDENTIFIER_REQUIRED');});
test('valid standard buyer',()=>assert.equal(run(standard(fixture())).ok,true));
test('consumer without identity',()=>assert.equal(run(fixture()).ok,true));
test('no active seller',()=>{const f=fixture();f.sources.sellers=[];has(run(f),'SELLER_PROFILE_REQUIRED');});
test('multiple active sellers',()=>{const f=fixture();f.sources.sellers.push(f.sources.sellers[0]);has(run(f),'SELLER_PROFILE_REQUIRED');});
test('invalid VAT',()=>{const f=fixture();f.sources.sellers[0].vatNumber='123';has(run(f),'SELLER_VAT_INVALID');});
test('mismatched seller',()=>{const f=fixture();f.sources.invoice.businessName='Other';has(run(f),'SELLER_IDENTITY_MISMATCH');});
test('57.50 exact calculation',()=>{const r=run(fixture());assert.equal(r.ok,true);assert.equal(r.value.totals.taxExclusiveAmount,'50.00');assert.equal(r.value.totals.vatAmount,'7.50');assert.equal(r.value.totals.taxInclusiveAmount,'57.50');});
test('multiple lines',()=>{const f=fixture();f.sources.lines.push({...f.sources.lines[0],id:ids[2],sortOrder:1});Object.assign(f.sources.invoice,{subtotal:'100.00',taxAmount:'15.00',total:'115.00'});assert.equal(run(f).ok,true);});
test('mismatch fails',()=>{const f=fixture();f.sources.invoice.total='57.51';has(run(f),'INVOICE_TOTAL_MISMATCH');});
test('small-price rounding mismatch is not hidden',()=>{const f=fixture();f.sources.lines[0].unitPrice='0.03';f.sources.lines.push({...f.sources.lines[0],id:ids[2]});Object.assign(f.sources.invoice,{subtotal:'0.05',taxAmount:'0.01',total:'0.06'});has(run(f),'INVOICE_TOTAL_MISMATCH');});
function paid(f){f.sources.payments=[{sourceTable:'invoice_payments',id:'test-payment',amount:'1.00',paidAt:at,voidedAt:null,transferredInvoicePaymentId:null}];return f;}
test('invoice #2 pattern unresolved',()=>has(run(paid(fixture())),'PREPAYMENT_CONTEXT_UNRESOLVED'));
test('internal collection not prepaid',()=>{const f=paid(fixture());f.input.paymentDecision={context:'internal_collection',actorId:ids[2],decidedAt:at,reason:'ZATCA_TEST_ONLY explicit classification',recordIds:['invoice_payments:test-payment']};const r=run(f);assert.equal(r.ok,true);assert.equal(r.value.totals.prepaidAmount,'0.00');assert.equal(r.value.totals.payableAmount,'57.50');assert.equal(r.value.payment.internalRemainingAtFreeze,'56.50');});
test('taxable prepayment blocked',()=>{const f=paid(fixture());f.input.paymentDecision={context:'taxable_prepayment',actorId:ids[2],decidedAt:at,reason:'test',recordIds:['invoice_payments:test-payment']};has(run(f),'PREPAYMENT_UNSUPPORTED_V1');});
test('transferred payment counted once',()=>{const f=paid(fixture());f.sources.payments.push({...f.sources.payments[0],sourceTable:'service_request_payments',id:'original',transferredInvoicePaymentId:'test-payment'});f.input.paymentDecision={context:'internal_collection',actorId:ids[2],decidedAt:at,reason:'test',recordIds:['invoice_payments:test-payment']};const r=run(f);assert.equal(r.ok,true);assert.equal(r.value.payment.collectedAmountAtFreeze,'1.00');});
test('duplicate records blocked',()=>{const f=paid(fixture());f.sources.payments.push(f.sources.payments[0]);has(run(f),'PAYMENT_DUPLICATE_SOURCE');});
test('voided payment ignored',()=>{const f=paid(fixture());f.sources.payments[0].voidedAt=at;assert.equal(run(f).ok,true);});
test('canonical and fingerprint deterministic',()=>{const a=run(fixture()).value,b=run(fixture()).value;assert.equal(stableSerialize(a),stableSerialize(b));assert.equal(fingerprint(a),fingerprint(b));assert.equal(stableSerialize({b:1,a:2}),stableSerialize({a:2,b:1}));});
test('source changes fingerprint',()=>{const f=fixture();const a=run(f).value;f.sources.lines[0].description='changed';assert.notEqual(fingerprint(a),fingerprint(run(f).value));});
test('unexpected secret inputs are omitted',()=>{const f=fixture();f.sources.invoice.privateKey='TEST_ONLY_SENTINEL';f.input.buyer.accessToken='TEST_ONLY_SENTINEL';const text=stableSerialize(run(f).value);assert.ok(!text.includes('TEST_ONLY_SENTINEL'));assert.ok(!/privateKey|accessToken/.test(text));});
test('decimal exact large values and tie rounding',()=>{assert.equal(Decimal.parse('9007199254740993.01').add(Decimal.parse('0.01')).fixed(),'9007199254740993.02');assert.equal(Decimal.parse('0.005').fixed(),'0.01');assert.equal(Decimal.parse('-0.005').fixed(),'-0.01');});
function service(f){const store={load:async()=>structuredClone(f.sources),readDocument:async()=>structuredClone(f.document),commit:async(expected,sources,next)=>{if(expected.version!==f.document.version || (sources!==null && stableSerialize(sources)!==stableSerialize(f.sources)))return false;f.document=structuredClone(next);return true;}};return new PreparationService(store,()=>at,{projectRef:'xpvwkelctzgidpycflzw',role:'super_admin'});}
test('prepare freeze validate; reprepare frozen blocked',async()=>{const f=fixture(),s=service(f);assert.equal((await s.run(ids[3],f.input,'prepare')).ok,true);assert.equal((await s.run(ids[3],f.input,'prepare')).ok,true);assert.equal((await s.run(ids[3],f.input,'freeze')).ok,true);const snapshot=stableSerialize(f.document.snapshot);assert.equal((await s.run(ids[3],f.input,'validate')).ok,true);assert.equal(stableSerialize(f.document.snapshot),snapshot);has(await s.run(ids[3],f.input,'prepare'),'REVISION_REQUIRED');assert.equal(f.sources.invoice.status,'draft');});
test('source changed before freeze blocked',async()=>{const f=fixture(),s=service(f);await s.run(ids[3],f.input,'prepare');f.sources.lines[0].description='changed';has(await s.run(ids[3],f.input,'freeze'),'SOURCE_CHANGED');assert.equal(f.document.status,'prepared');});
test('source changed after freeze preserves snapshot',async()=>{const f=fixture(),s=service(f);await s.run(ids[3],f.input,'prepare');await s.run(ids[3],f.input,'freeze');const old=stableSerialize(f.document.snapshot);f.sources.lines[0].description='changed';assert.equal((await s.run(ids[3],f.input,'validate')).ok,true);assert.equal(stableSerialize(f.document.snapshot),old);});
test('tampered snapshot blocked',async()=>{const f=fixture(),s=service(f);await s.run(ids[3],f.input,'prepare');f.document.snapshot.totals.taxInclusiveAmount='999';has(await s.run(ids[3],f.input,'freeze'),'SOURCE_CHANGED');});
test('production project denied',()=>{assert.throws(()=>new PreparationService({},()=>at,{projectRef:'wtmzvznsmitqmjgqwtnu',role:'super_admin'}));});
for(const [change,code] of [
[f=>f.input.documentKind='credit_note','UNSUPPORTED_DOCUMENT_KIND'],
[f=>f.sources.invoice.currency='USD','UNSUPPORTED_CURRENCY'],
[f=>f.sources.invoice.taxRate='5.00','UNSUPPORTED_VAT_RATE'],
[f=>f.sources.lines[0].taxCategory='Z','UNSUPPORTED_VAT_CATEGORY'],
[f=>f.sources.lines[0].allowances=['1.00'],'ALLOWANCE_CHARGE_UNSUPPORTED'],
[f=>f.input.flags.export=true,'UNSUPPORTED_TRANSACTION'],
[f=>f.sources.invoice.status='issued','SOURCE_INVOICE_NOT_DRAFT'],
[f=>f.sources.lines[0].quantity='-1','LINE_DATA_INVALID'],
]) test('block '+code,()=>{const f=fixture();change(f);has(run(f),code);});

test('standard unknown VAT status blocked',()=>{const f=standard(fixture());f.input.buyer.vatRegistrationStatus='unknown';has(run(f),'BUYER_VAT_STATUS_UNKNOWN');});
test('standard alternate identifier allowed',()=>{const f=standard(fixture());f.input.buyer.vatRegistrationStatus='not_registered';f.input.buyer.vatNumber=null;f.input.buyer.otherIdentifier={scheme:'OTH',value:'TESTONLY'};assert.equal(run(f).ok,true);});
test('invalid calendar date is blocker, not exception',()=>{const f=standard(fixture());f.input.supplyDate='2026-99-99';has(run(f),'SUPPLY_DATE_REQUIRED');});
test('input arrays reorder deterministically',()=>{const f=fixture();f.sources.lines.push({...f.sources.lines[0],id:ids[2],sortOrder:1});Object.assign(f.sources.invoice,{subtotal:'100.00',taxAmount:'15.00',total:'115.00'});const original=fingerprint(run(f).value);f.sources.lines.reverse();assert.equal(fingerprint(run(f).value),original);});
test('payment decision must cover exact effective records',()=>{const f=paid(fixture());f.input.paymentDecision={context:'internal_collection',actorId:ids[2],decidedAt:at,reason:'test',recordIds:[]};has(run(f),'PREPAYMENT_CONTEXT_UNRESOLVED');});
test('transfer target missing is blocker',()=>{const f=paid(fixture());f.sources.payments[0].sourceTable='service_request_payments';f.sources.payments[0].transferredInvoicePaymentId='missing';has(run(f),'PAYMENT_DUPLICATE_SOURCE');});
test('atomic storage conflict fails closed',async()=>{const f=fixture();const store={load:async()=>f.sources,readDocument:async()=>f.document,commit:async()=>false};const s=new PreparationService(store,()=>at,{projectRef:'xpvwkelctzgidpycflzw',role:'super_admin'});has(await s.run(ids[3],f.input,'prepare'),'SOURCE_CHANGED');assert.equal(f.document.status,'draft');});
test('seller read maps only active identity; no write calls',async()=>{
 const { loadActiveSellerProfiles }=await import('../../lib/zatca/seller-loader.ts');
 const calls=[];
 const client={from:table=>{calls.push(table);return {select:columns=>{assert.ok(!columns.includes('*'));return {eq:async(column,value)=>{calls.push([column,value]);return {data:[],error:null};}};}};}};
 assert.deepEqual(await loadActiveSellerProfiles(client,'xpvwkelctzgidpycflzw'),[]);
 assert.deepEqual(calls,['business_tax_profiles',['is_active',true]]);
 await assert.rejects(()=>loadActiveSellerProfiles(client,'wtmzvznsmitqmjgqwtnu'));
});

test('frozen validation ignores new payments and never calls load',async()=>{
 const f=fixture(),s=service(f);await s.run(ids[3],f.input,'prepare');await s.run(ids[3],f.input,'freeze');
 paid(f);
 const isolated=new PreparationService({load:async()=>{throw new Error('live sources must not load');},readDocument:async()=>f.document,commit:async(_old,sources,next)=>{assert.equal(sources,null);f.document=next;return true;}},()=>at,{projectRef:'xpvwkelctzgidpycflzw',role:'super_admin'});
 assert.equal((await isolated.run(ids[3],f.input,'validate')).ok,true);
});
test('tampered frozen totals rejected',async()=>{const f=fixture(),s=service(f);await s.run(ids[3],f.input,'prepare');await s.run(ids[3],f.input,'freeze');f.document.snapshot.totals.vatAmount='0.00';has(await s.run(ids[3],f.input,'validate'),'CANONICAL_INVALID');});
test('validate before freeze denied',async()=>{const f=fixture();has(await service(f).run(ids[3],f.input,'validate'),'PREPARATION_STATE_INVALID');});

test('frozen snapshot rejects coerced boolean and registration numeric value',async()=>{
 for(const mutate of [s=>s.buyer.identityConfirmed='true',s=>s.seller.registration.value=12345,s=>s.seller.address.buildingNumber=1234,s=>s.buyer.vatRegistrationStatus='INVALID']) {
  const f=fixture(),serviceInstance=service(f);await serviceInstance.run(ids[3],f.input,'prepare');await serviceInstance.run(ids[3],f.input,'freeze');mutate(f.document.snapshot);
  has(await serviceInstance.run(ids[3],f.input,'validate'),'CANONICAL_INVALID');
 }
});
test('document totals must match the sum of line tax and gross amounts',()=>{
 const f=fixture();f.sources.lines[0].unitPrice='0.03';f.sources.lines.push({...f.sources.lines[0],id:ids[2]});Object.assign(f.sources.invoice,{subtotal:'0.06',taxAmount:'0.01',total:'0.07'});
 has(run(f),'INVOICE_TOTAL_MISMATCH');
});
