import { createHash } from 'node:crypto';
import { Decimal as D } from './decimal.ts';
import { CALCULATION_POLICY, RULES_VERSION, type Blocker, type BuyerInput, type Canonical, type CanonicalLine, type Document, type PreparationInput, type Result, type Sources } from './types.ts';
const vat = (s: string | null | undefined) => !!s && /^3\d{13}3$/.test(s);
const present = (s: string | null | undefined) => typeof s === 'string' && s.trim().length > 0;
const date = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
const timestamp = (s: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(s) && Number.isFinite(Date.parse(s));
const uuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const addressValid = (a: BuyerInput['address']) => !!a && present(a.street) && present(a.district) && present(a.city) && /^\d{4}$/.test(a.buildingNumber) && /^\d{5}$/.test(a.postalCode) && a.countryCode === 'SA' && (a.additionalNumber == null || /^\d{4}$/.test(a.additionalNumber));
const sellerSchemes = ['CRN','MOM','MLS','700','SAG','OTH'];
const buyerSchemes = ['TIN',...sellerSchemes,'NAT','GCC','IQA','PAS'];
export function classify(buyer: BuyerInput): Result<'standard' | 'simplified'> {
  if (buyer.buyerType === 'consumer') return {ok:true,value:'simplified'};
  if (buyer.buyerType === 'business' || buyer.buyerType === 'government') return {ok:true,value:'standard'};
  return {ok:false,blockers:[{code:'BUYER_TYPE_UNKNOWN',severity:'ERROR'}]};
}
export const asciiCompare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export function stableSerialize(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableSerialize).join(',') + ']';
  if (typeof value === 'object' && value !== null) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+stableSerialize((value as Record<string,unknown>)[k])).join(',')+'}';
  throw new Error('Unsupported canonical value');
}
/** Legacy canonical projection digest for core integrity tests; never an XML hash.
 * DB source_fingerprint uses sourceFingerprint() in persistence.ts instead. */
export function fingerprint(snapshot: Canonical): string {
  const { preparedAt: _time, ...metadata } = snapshot.metadata;
  const { issueAt: _issue, issueDate: _date, issueTime: _clock, ...invoice } = snapshot.invoice;
  void _time; void _issue; void _date; void _clock;
  return createHash('sha256').update(stableSerialize({...snapshot,metadata,invoice})).digest('hex');
}
export function build(s: Sources, input: PreparationInput, document: Document, preparedAt: string): Result<Canonical> {
  const blockers: Blocker[] = [];
  const block = (code: Blocker['code'],field?: string) => blockers.push({code,severity:'ERROR',...(field ? {field} : {})});
  const i=s.invoice, b=input.buyer, classification=classify(b);
  if (!classification.ok) blockers.push(...classification.blockers);
  if (i.status !== 'draft') block('SOURCE_INVOICE_NOT_DRAFT');
  if (i.id !== document.invoiceId || !uuid(document.uuid) || !uuid(document.id) || document.revisionNo < 1 || !timestamp(preparedAt)) block('CANONICAL_INVALID');
  if (i.currency !== 'SAR') block('UNSUPPORTED_CURRENCY');
  if (!i.vatRegistered) block('SELLER_NOT_VAT_REGISTERED');
  if (i.taxRate !== '15' && i.taxRate !== '15.00') block('UNSUPPORTED_VAT_RATE');
  if (input.documentKind !== 'invoice') block('UNSUPPORTED_DOCUMENT_KIND');
  const flagNames=['thirdParty','nominal','export','summary','selfBilling'];
  if (Object.entries(input.flags).some(([key,value]) => !flagNames.includes(key) || value !== false) || b.transactionCountry !== 'SA' || !b.identityConfirmed) block('UNSUPPORTED_TRANSACTION');
  const sellers=s.sellers.filter(p=>p.active);
  if (sellers.length!==1) block('SELLER_PROFILE_REQUIRED');
  const p=sellers[0];
  if (p) {
    if (!present(p.vatNumber)) block('SELLER_VAT_MISSING');
    else if (!vat(p.vatNumber)) block('SELLER_VAT_INVALID');
    if (!present(p.legalName) || p.legalName.trim()!==i.businessName.trim() || p.vatNumber!==i.businessVat) block('SELLER_IDENTITY_MISMATCH');
    if (!sellerSchemes.includes(p.registration.scheme) || !/^[A-Za-z0-9]+$/.test(p.registration.value)) block('SELLER_REGISTRATION_REQUIRED');
    if (!addressValid(p.address)) block('SELLER_ADDRESS_INCOMPLETE');
  }
  if (classification.ok && classification.value==='standard') {
    if (!present(b.name)) block('BUYER_NAME_REQUIRED');
    if (b.vatRegistrationStatus==='unknown') block('BUYER_VAT_STATUS_UNKNOWN');
    if (b.vatRegistrationStatus==='registered' && !vat(b.vatNumber)) block('BUYER_VAT_REQUIRED');
    if (b.vatRegistrationStatus==='not_registered' && !b.otherIdentifier) block('BUYER_IDENTIFIER_REQUIRED');
    if (!addressValid(b.address)) block('BUYER_ADDRESS_INCOMPLETE');
    if (!date(input.supplyDate)) block('SUPPLY_DATE_REQUIRED');
  }
  if (b.vatNumber !== null && !vat(b.vatNumber)) block('BUYER_VAT_REQUIRED');
  if (b.otherIdentifier && (!buyerSchemes.includes(b.otherIdentifier.scheme) || !/^[A-Za-z0-9]+$/.test(b.otherIdentifier.value))) block('BUYER_IDENTIFIER_INVALID');
  if (b.address && !addressValid(b.address)) block('BUYER_ADDRESS_INCOMPLETE');
  if (input.supplyDate !== null && !date(input.supplyDate)) block('SUPPLY_DATE_REQUIRED');
  const ordered=[...s.lines].sort((a,b)=>a.sortOrder-b.sortOrder || asciiCompare(a.id,b.id));
  const lines: CanonicalLine[]=[];
  if (!ordered.length || new Set(ordered.map(l=>l.id)).size!==ordered.length) block('LINE_DATA_INVALID');
  for (const l of ordered) {
    if (l.taxCategory!=='S') block('UNSUPPORTED_VAT_CATEGORY',l.id);
    if (l.allowances.length || l.charges.length) block('ALLOWANCE_CHARGE_UNSUPPORTED',l.id);
    try {
      const quantity=D.parse(l.quantity), gross=D.parse(l.unitPrice);
      if (!/^\d+(\.\d{1,2})?$/.test(l.quantity) || !/^\d+(\.\d{1,2})?$/.test(l.unitPrice) || !quantity.positive() || gross.negative() || !present(l.description) || l.description.length>300 || !uuid(l.id)) { block('LINE_DATA_INVALID',l.id); continue; }
      const netPrice=gross.divide(D.parse('1.15'));
      const net=quantity.multiply(netPrice).round(), tax=net.multiply(D.parse('0.15')).round();
      if (!net.add(tax).equals(quantity.multiply(gross).round())) block('LINE_TOTAL_MISMATCH',l.id);
      lines.push({id:l.id,sourceLineId:l.id,description:l.description,quantity:quantity.fixed(2),unitCode:l.unitCode??null,grossUnitPrice:gross.fixed(2),netUnitPrice:netPrice.fixed(18),priceBaseQuantity:'1',priceIncludesVat:true,taxCategory:'S',taxRate:'15.00',netAmount:net.fixed(),vatAmount:tax.fixed(),grossAmount:net.add(tax).fixed(),allowances:[],charges:[]});
    } catch {block('LINE_DATA_INVALID',l.id);}
  }
  const net=lines.reduce((sum,l)=>sum.add(D.parse(l.netAmount)),D.parse('0'));
  const tax=net.multiply(D.parse('0.15')).round(), gross=net.add(tax);
  const lineTax=lines.reduce((sum,l)=>sum.add(D.parse(l.vatAmount)),D.parse('0'));
  const lineGross=lines.reduce((sum,l)=>sum.add(D.parse(l.grossAmount)),D.parse('0'));
  if(!lineTax.equals(tax) || !lineGross.equals(gross)) block('INVOICE_TOTAL_MISMATCH');
  try { if (!net.equals(D.parse(i.subtotal)) || !tax.equals(D.parse(i.taxAmount)) || !gross.equals(D.parse(i.total))) block('INVOICE_TOTAL_MISMATCH'); }
  catch {block('INVOICE_TOTAL_MISMATCH');}
  const active=s.payments.filter(p=>!p.voidedAt);
  if (new Set(active.map(p=>p.sourceTable+':'+p.id)).size!==active.length) block('PAYMENT_DUPLICATE_SOURCE');
  const invoicePayments=active.filter(p=>p.sourceTable==='invoice_payments');
  const effective=active.filter(p=>{
    if (!p.transferredInvoicePaymentId) return true;
    const target=invoicePayments.find(t=>t.id===p.transferredInvoicePaymentId);
    if (!target || target.amount!==p.amount) {block('PAYMENT_DUPLICATE_SOURCE');return false;}
    return false;
  }).sort((a,b)=>asciiCompare(a.sourceTable+':'+a.id,b.sourceTable+':'+b.id));
  const decision=input.paymentDecision;
  if (effective.length && !decision) block('PREPAYMENT_CONTEXT_UNRESOLVED');
  if (decision?.context==='taxable_prepayment') block('PREPAYMENT_UNSUPPORTED_V1');
  if (effective.length && decision && (!present(decision.actorId) || !present(decision.reason) || !timestamp(decision.decidedAt) || stableSerialize([...decision.recordIds].sort())!==stableSerialize(effective.map(p=>p.sourceTable+':'+p.id).sort()))) block('PREPAYMENT_CONTEXT_UNRESOLVED');
  let collected=D.parse('0');
  for (const payment of effective) {try{const amount=D.parse(payment.amount);if(!amount.positive() || !timestamp(payment.paidAt)) block('PREPAYMENT_CONTEXT_UNRESOLVED');collected=collected.add(amount);}catch{block('PREPAYMENT_CONTEXT_UNRESOLVED');}}
  if(blockers.length || !p || !classification.ok) return {ok:false,blockers};
  const copyAddress=(a: NonNullable<BuyerInput['address']>)=>({street:a.street,buildingNumber:a.buildingNumber,district:a.district,city:a.city,postalCode:a.postalCode,countryCode:a.countryCode,additionalNumber:a.additionalNumber??null});
  const snapshot: Canonical={
    metadata:{modelVersion:1,rulesVersion:RULES_VERSION,calculationPolicy:CALCULATION_POLICY,environment:'simulation',sourceInvoiceId:i.id,documentId:document.id,revisionNo:document.revisionNo,preparedAt},
    seller:{id:p.id,active:true,legalName:p.legalName,vatNumber:p.vatNumber,registration:{scheme:p.registration.scheme,value:p.registration.value},address:copyAddress(p.address)},
    buyer:{buyerType:b.buyerType,vatRegistrationStatus:b.vatRegistrationStatus,name:b.name,vatNumber:b.vatNumber,otherIdentifier:b.otherIdentifier?{scheme:b.otherIdentifier.scheme,value:b.otherIdentifier.value}:null,address:b.address?copyAddress(b.address):null,identityConfirmed:b.identityConfirmed,transactionCountry:b.transactionCountry},
    invoice:{id:i.id,number:i.number,uuid:document.uuid,profileId:'reporting:1.0',scheme:classification.value,kind:'invoice',typeCode:'388',transactionCode:classification.value==='standard'?'0100000':'0200000',flags:Object.fromEntries(flagNames.map(k=>[k,false])),currency:'SAR',taxCurrency:'SAR',issueAt:null,issueDate:null,issueTime:null,supplyDate:input.supplyDate,supplyEndDate:null},
    references:{originalInvoices:[],adjustmentReason:null,prepayments:[]},lines,
    taxes:[{category:'S',rate:'15.00',taxableAmount:net.fixed(),taxAmount:tax.fixed(),exemptionReasonCode:null,exemptionReasonText:null}],
    totals:{lineExtensionAmount:net.fixed(),allowanceTotal:'0.00',chargeTotal:'0.00',taxExclusiveAmount:net.fixed(),vatAmount:tax.fixed(),taxAccountingAmount:tax.fixed(),taxInclusiveAmount:gross.fixed(),prepaidAmount:'0.00',payableAmount:gross.fixed(),payableRoundingAmount:'0.00'},
    payment:{context:effective.length?'internal_collection':'none',collectionRecords:effective.map(r=>({sourceTable:r.sourceTable,id:r.id,amount:r.amount,paidAt:r.paidAt,voidedAt:null,transferredInvoicePaymentId:r.transferredInvoicePaymentId})),collectedAmountAtFreeze:collected.fixed(),internalRemainingAtFreeze:gross.subtract(collected).fixed(),contextDecision:decision?{context:decision.context,actorId:decision.actorId,decidedAt:decision.decidedAt,reason:decision.reason,recordIds:[...decision.recordIds].sort()}:null,meansCode:null},
    zatca:{uuid:document.uuid,egsUnitId:null,icv:null,pih:null}
  };
  return {ok:true,value:snapshot};
}

/** Validate historical content using ONLY the supplied frozen snapshot. Never loads live sources. */
export function validateFrozenSnapshot(document: Document): Result<Canonical> {
  const fail = (code: Blocker['code'] = 'CANONICAL_INVALID'): Result<Canonical> => ({ok:false,blockers:[{code,severity:'ERROR'}]});
  try {
    const snapshot = document.snapshot;
    if (!snapshot || !document.frozenAt || !document.issueAt || !timestamp(document.frozenAt) || !timestamp(document.issueAt)) return fail();
    if (snapshot.metadata.rulesVersion !== RULES_VERSION || snapshot.metadata.calculationPolicy !== CALCULATION_POLICY) return fail('RULES_VERSION_UNSUPPORTED');
    if (snapshot.invoice.issueAt !== document.issueAt || snapshot.invoice.issueDate !== document.issueAt.slice(0,10) || snapshot.invoice.issueTime !== document.issueAt.slice(11,19)+'Z') return fail();
    // Runtime shape checks are needed even though the TypeScript model is typed:
    // database JSON is untrusted input and regex coercion must not accept numbers.
    const validAddressShape=(a: BuyerInput['address'])=>a!==null && typeof a==='object'
      && ['street','buildingNumber','district','city','postalCode','countryCode'].every(key=>typeof (a as unknown as Record<string,unknown>)[key]==='string')
      && (a.additionalNumber===null || a.additionalNumber===undefined || typeof a.additionalNumber==='string');
    const b=snapshot.buyer;
    if(!['consumer','business','government'].includes(b.buyerType??'')
      || !['registered','not_registered','unknown'].includes(b.vatRegistrationStatus)
      || b.identityConfirmed!==true
      || !(b.name===null || typeof b.name==='string')
      || !(b.vatNumber===null || typeof b.vatNumber==='string')
      || (b.address!==null && !validAddressShape(b.address))
      || (b.otherIdentifier!==null && (typeof b.otherIdentifier.scheme!=='string' || typeof b.otherIdentifier.value!=='string'))
      || !validAddressShape(snapshot.seller.address)
      || !uuid(snapshot.seller.id) || typeof snapshot.seller.registration.value!=='string'
      || typeof snapshot.invoice.number!=='string' || !present(snapshot.invoice.number)
      || (snapshot.payment.contextDecision!==null && !uuid(snapshot.payment.contextDecision.actorId))) return fail();
    const sources: Sources = {
      invoice: {id:document.invoiceId,number:snapshot.invoice.number,status:'draft',businessName:snapshot.seller.legalName,businessVat:snapshot.seller.vatNumber,vatRegistered:true,currency:snapshot.invoice.currency,taxRate:'15.00',subtotal:snapshot.totals.taxExclusiveAmount,taxAmount:snapshot.totals.vatAmount,total:snapshot.totals.taxInclusiveAmount},
      lines:snapshot.lines.map((line,index)=>({id:line.sourceLineId,description:line.description,quantity:line.quantity,unitPrice:line.grossUnitPrice,sortOrder:index,taxCategory:line.taxCategory,allowances:line.allowances,charges:line.charges,unitCode:line.unitCode})),
      sellers:[snapshot.seller],payments:snapshot.payment.collectionRecords,
    };
    const input: PreparationInput = {buyer:snapshot.buyer,supplyDate:snapshot.invoice.supplyDate,documentKind:snapshot.invoice.kind,flags:snapshot.invoice.flags,...(snapshot.payment.contextDecision ? {paymentDecision:snapshot.payment.contextDecision} : {})};
    const rebuilt=build(sources,input,document,snapshot.metadata.preparedAt);
    if (!rebuilt.ok) return fail();
    rebuilt.value.invoice.issueAt=document.issueAt;
    rebuilt.value.invoice.issueDate=snapshot.invoice.issueDate;
    rebuilt.value.invoice.issueTime=snapshot.invoice.issueTime;
    // Exact whitelist equality checks schema, all derived fields and arithmetic.
    if (stableSerialize(rebuilt.value)!==stableSerialize(snapshot)) return fail();
    return {ok:true,value:snapshot};
  } catch { return fail(); }
}
