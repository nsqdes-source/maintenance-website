import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
function load(file,mocks={}) {
 const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,require:name=>name in mocks?mocks[name]:require(name),console,Date,URL,URLSearchParams,crypto:require("node:crypto"),Set});return exports;
}
const mapping=load('lib/request-payment-policy.ts');
const base={configured:true,payment_domain_enabled:true,payment_policy_version:1,payment_policy:{original_timing:'customer_choice',allow_pay_on_arrival:true,allow_pay_after_completion:true}};
const Section=load('app/request/PaymentTimingSection.tsx',{'@/lib/request-payment-policy':mapping}).default;
for(const original_timing of ['customer_choice','prepay_required','pay_on_arrival','pay_after_completion']) {
 test('disabled UI and choice remain absent '+original_timing,()=>{const policy={...base,payment_domain_enabled:false,payment_policy:{...base.payment_policy,original_timing}};assert.equal(JSON.stringify(mapping.paymentTimingOptions(policy)),'[]');assert.equal(mapping.paymentChoiceForSubmission(policy,'prepay'),null);assert.equal(renderToStaticMarkup(React.createElement(Section,{policy,choice:null,onChange:()=>{},locale:'ar',hasVisit:true})), '');});
 test('future mapping '+original_timing,()=>{const policy={...base,payment_policy:{...base.payment_policy,original_timing}};const expected=original_timing==='customer_choice'?['prepay','pay_on_arrival','pay_after_completion']:[original_timing==='prepay_required'?'prepay':original_timing];assert.equal(JSON.stringify(mapping.paymentTimingOptions(policy)),JSON.stringify(expected));const html=renderToStaticMarkup(React.createElement(Section,{policy,choice:null,onChange:()=>{},locale:'ar',hasVisit:true}));assert.doesNotMatch(html,/ادفع الآن|بطاقة|بوابة/);if(original_timing==='prepay_required')assert.match(html,/يتطلب هذا الطلب الدفع مقدمًا/);});
}
test('choice honors allowed arrival and completion flags',()=>{const policy={...base,payment_policy:{...base.payment_policy,allow_pay_on_arrival:false,allow_pay_after_completion:false}};assert.equal(JSON.stringify(mapping.paymentTimingOptions(policy)),'["prepay"]');assert.equal(mapping.paymentChoiceForSubmission(policy,'pay_on_arrival'),null);assert.equal(mapping.paymentChoiceForSubmission(policy,'pay_after_completion'),null);assert.equal(mapping.paymentChoiceForSubmission(policy,'prepay'),'prepay');});
test('missing settings safe',()=>{assert.equal(mapping.paymentChoiceForSubmission(mapping.disabledRequestPaymentPolicy,'prepay'),null);});
const categories=[{id:'cat',name:'التكييف',service_key:'ac',sort_order:1}];
const services=[{id:'visit',service_catalog_item_id:'cat',name:'فحص',description:'',gross_price:50,is_visit_service:true,sort_order:1}];
function funnel(auth=false,files=[]) {
 let index=0;const calls=[];const states=[5,null,'',false,false,auth?'customer-id':null,auth?'account@example.invalid':'',{full_name:auth?'PROFILE NAME':null,phone:auth?'0500000001':null},'cat','',['visit'],{visit:2},'TEST DESCRIPTION',files,'TEST ADDRESS',{latitude:21.4,longitude:39.8},'2099-01-01','morning','GUEST NAME','0500000000','guest@example.invalid','2026-10-09'];
 const react={...React,useState:()=>[states[index++],()=>{}],useEffect:()=>{},useMemo:f=>f()};
 const client={rpc:(name,args)=>{calls.push({name,args});return name==='attach_service_request_image'?Promise.resolve({error:null}):{single:async()=>({data:{request_id:'request-id',request_upload_token:'upload-token'},error:null})};},storage:{from:bucket=>({upload:async(path,file,options)=>{calls.push({bucket,path,file,options});return {error:null};}})}};
 const Funnel=load('app/request/RequestFunnel.tsx',{'react':react,'next/navigation':{useRouter:()=>({push:url=>calls.push({url}),refresh:()=>{}})},'@/lib/supabase/client':{createClient:()=>client},'@/app/components/LocaleContext':{useLocale:()=> 'ar'},'./LocationPicker':{default:()=>null},'./PaymentTimingSection':{default:Section},'@/lib/request-payment-policy':mapping,'@/lib/attribution':{getAttribution:()=>({}),trackFunnelEvent:()=>{}}}).default;
 const tree=Funnel({initialCategories:categories,initialServices:services,paymentPolicy:{...base,payment_domain_enabled:false}});
 return {tree,calls};
}
function find(element,predicate){if(!element||typeof element!=='object')return null;if(predicate(element))return element;for(const child of React.Children.toArray(element.props?.children)){const found=find(child,predicate);if(found)return found;}return null;}
for(const auth of [false,true])test('disabled submit preserves '+(auth?'profile':'guest')+' and upload response',async()=>{
 const {tree,calls}=funnel(auth);const form=find(tree,e=>e.type==='form');await form.props.onSubmit({preventDefault(){}});
 assert.equal(calls[0].name,'submit_service_request_with_payment_choice_v1');assert.equal(calls[0].args.p_payment_choice_timing,null);assert.equal(calls[0].args.p_expected_payment_policy_version,null);
 assert.equal(calls[0].args.input_name,auth?'PROFILE NAME':'GUEST NAME');assert.equal(calls[0].args.input_phone,auth?'0500000001':'0500000000');assert.equal(calls[0].args.input_email,auth?'account@example.invalid':'guest@example.invalid');assert.equal(JSON.stringify(calls[0].args.input_catalog_services),'[{"id":"visit","quantity":2}]');assert.ok(calls.at(-1).url.startsWith('/request/success?'));assert.ok(calls.at(-1).url.includes('request-id'));
});
test('disabled review labels estimate and emits no payment controls',()=>{const {tree}=funnel();const html=renderToStaticMarkup(tree);assert.match(html,/إجمالي الطلب التقديري شامل الضريبة/);assert.doesNotMatch(html,/name="payment_timing"|requestPaymentTiming|المستحق الآن/);});
test('category selection and photo/auth implementation remain intact',()=>{const source=readFileSync('app/request/RequestFunnel.tsx','utf8');for(const token of ['photoError(photos)','request-images','attach_service_request_image','request.request_upload_token','auth.getUser()','setSelectedServiceIds','profile.full_name'])assert.ok(source.includes(token));assert.doesNotMatch(source,/create_attempt|record_payment|record_collection|payment_financial_state/);});
test('image upload uses wrapper token and original attachment path',async()=>{
 const image=new File(['TEST IMAGE'],'test.png',{type:'image/png'});
 const {tree,calls}=funnel(false,[image]);await find(tree,e=>e.type==='form').props.onSubmit({preventDefault(){}});
 const upload=calls.find(c=>c.bucket);assert.equal(upload.bucket,'request-images');assert.ok(upload.path.startsWith('request-id/upload-token/'));assert.ok(upload.path.endsWith('.png'));
 const attach=calls.find(c=>c.name==='attach_service_request_image');assert.equal(attach.args.target_upload_token,'upload-token');assert.equal(attach.args.target_request_id,'request-id');assert.equal(attach.args.target_storage_path,upload.path);
});
