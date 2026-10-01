/** Internal transport implementation. Production/server consumers use persistence.server.ts.
 * No route or action imports it in this phase. No transactions span RPC requests. */
import { randomUUID, createHash } from 'node:crypto';
import { build, stableSerialize, asciiCompare, validateFrozenSnapshot } from './preparation.ts';
import { RULES_VERSION, CALCULATION_POLICY, type PreparationInput, type Sources, type Document, type Result, type BlockerCode } from './types.ts';

// Disposable runtime only: no fallback to the paused original Test or Production.
export const RUNTIME_PROJECT_REF = 'tzqnljjlrkacnjqyogcj';
export const OPERATIONS = ['prepare','freeze','canonical_validate','create_revision'] as const;
export type Operation = typeof OPERATIONS[number];
type JsonObject = Record<string, unknown>;
export interface RpcClient {
  rpc(name: string, args: JsonObject): PromiseLike<{data: unknown; error: {message: string; code?: string} | null}>;
}
export interface SessionClient {
  auth: {getUser(): Promise<{data: {user: {id: string; is_anonymous?: boolean} | null}; error: unknown}>};
  from(table: string): {select(columns: string): {eq(column: string,value: string): {single(): PromiseLike<{data: {role: string} | null; error: unknown}>}}};
}
export class PersistenceError extends Error {
  constructor(readonly failureCode: BlockerCode) { super(failureCode); }
}
const errorCodes: BlockerCode[] = ['AUTH_REQUIRED','FORBIDDEN','INVOICE_NOT_FOUND','DOCUMENT_NOT_CURRENT','DOCUMENT_VERSION_CONFLICT','CONCURRENCY_RETRY_REQUIRED','SOURCE_CHANGED','PREPARATION_STATE_INVALID','REVISION_REQUIRED','CANONICAL_INVALID','RPC_OPERATION_INVALID','SOURCE_INVOICE_NOT_DRAFT'];
export function mapPersistenceFailure(error: {message: string; code?: string}): BlockerCode {
  if(['55P03','40P01'].includes(error.code??'')) return 'CONCURRENCY_RETRY_REQUIRED';
  return errorCodes.find(code=>error.message===code || error.message===`ERROR: ${code}`)??'PERSISTENCE_UNAVAILABLE';
}
const object=(value: unknown): JsonObject=>{
  if(!value || typeof value!=='object' || Array.isArray(value)) throw new PersistenceError('CANONICAL_INVALID');
  return value as JsonObject;
};
const text=(value: unknown): string=>{if(typeof value!=='string') throw new PersistenceError('CANONICAL_INVALID');return value;};
const nullableText=(value: unknown): string|null=>value===null?null:text(value);
const boolean=(value: unknown): boolean=>{if(typeof value!=='boolean')throw new PersistenceError('CANONICAL_INVALID');return value;};
const integer=(value: unknown): number=>{if(typeof value!=='number' || !Number.isSafeInteger(value))throw new PersistenceError('CANONICAL_INVALID');return value;};
const list=(value: unknown): unknown[]=>{if(!Array.isArray(value))throw new PersistenceError('CANONICAL_INVALID');return value;};
const exactDecimal=(value: unknown): string=>{const s=text(value);if(!/^-?\d+\.\d{2}$/.test(s))throw new PersistenceError('CANONICAL_INVALID');return s;};
const utc=(value: unknown): string|null=>{
 const s=nullableText(value);if(s!==null && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(\d{3})?Z$/.test(s)||!Number.isFinite(Date.parse(s))))throw new PersistenceError('CANONICAL_INVALID');return s;
};
function address(value: unknown) {
 const a=object(value);return {street:text(a.street),buildingNumber:text(a.buildingNumber),district:text(a.district),city:text(a.city),postalCode:text(a.postalCode),countryCode:text(a.countryCode),additionalNumber:nullableText(a.additionalNumber)};
}
/** Explicit whitelist. Matches SQL projection; no locale or JSON-text comparison. */
export function normalizeSourceEnvelope(value: unknown) {
 const raw=object(value),i=object(raw.invoice),f=raw.financeSettings===null?null:object(raw.financeSettings);
 if(raw.formatVersion!==1)throw new PersistenceError('CANONICAL_INVALID');
 const lines=list(raw.lines).map(value=>{const l=object(value);return {id:text(l.id),invoiceId:text(l.invoiceId),description:text(l.description),quantity:exactDecimal(l.quantity),unitPrice:exactDecimal(l.unitPrice),sortOrder:integer(l.sortOrder),taxCategory:text(l.taxCategory),allowances:list(l.allowances),charges:list(l.charges),unitCode:nullableText(l.unitCode)};}).sort((a,b)=>a.sortOrder-b.sortOrder || asciiCompare(a.id,b.id));
 const sellers=list(raw.sellers).map(value=>{const s=object(value),r=object(s.registration);return {id:text(s.id),financeSettingsId:boolean(s.financeSettingsId),active:boolean(s.active),legalName:text(s.legalName),vatNumber:text(s.vatNumber),registration:{scheme:text(r.scheme),value:text(r.value)},address:address(s.address),updatedAt:utc(s.updatedAt)};}).sort((a,b)=>asciiCompare(a.id,b.id));
 const payments=list(raw.payments).map(value=>{
  const p=object(value),sourceTable=text(p.sourceTable);
  if(sourceTable!=='invoice_payments' && sourceTable!=='service_request_payments') throw new PersistenceError('CANONICAL_INVALID');
  const common={sourceTable,id:text(p.id),amount:exactDecimal(p.amount),paidAt:utc(p.paidAt),voidedAt:utc(p.voidedAt),paymentType:nullableText(p.paymentType),transferredInvoicePaymentId:nullableText(p.transferredInvoicePaymentId),transferredAt:utc(p.transferredAt)};
  return sourceTable==='invoice_payments'?{...common,invoiceId:text(p.invoiceId)}:{...common,serviceRequestId:text(p.serviceRequestId)};
 }).sort((a,b)=>asciiCompare(a.sourceTable,b.sourceTable)||asciiCompare(a.id,b.id));
 return {formatVersion:1,invoice:{id:text(i.id),number:text(i.number),serviceRequestId:text(i.serviceRequestId),customerId:nullableText(i.customerId),status:text(i.status),businessName:text(i.businessName),businessVat:text(i.businessVat),vatRegistered:boolean(i.vatRegistered),currency:text(i.currency),taxRate:exactDecimal(i.taxRate),subtotal:exactDecimal(i.subtotal),taxAmount:exactDecimal(i.taxAmount),total:exactDecimal(i.total),updatedAt:utc(i.updatedAt)},financeSettings:f?{id:boolean(f.id),legalName:text(f.legalName),taxNumber:text(f.taxNumber),vatRegistered:f.vatRegistered===null?null:boolean(f.vatRegistered),currency:text(f.currency),taxRate:exactDecimal(f.taxRate),updatedAt:utc(f.updatedAt)}:null,lines,sellers,payments};
}
export type SourceEnvelope = ReturnType<typeof normalizeSourceEnvelope>;
function canonicalSources(envelope: SourceEnvelope): Sources {
 const invoiceId=envelope.invoice.id;
 // Include referenced targets in the envelope but never count a different invoice's payment.
 if(envelope.payments.some(p=>'invoiceId' in p && p.invoiceId!==invoiceId))throw new PersistenceError('CANONICAL_INVALID');
 return {invoice:envelope.invoice,lines:envelope.lines.map(l=>({...l,allowances:l.allowances.map(text),charges:l.charges.map(text)})),sellers:envelope.sellers,payments:envelope.payments.map(p=>({...p,sourceTable:p.sourceTable as Sources['payments'][number]['sourceTable'],paidAt:new Date(text(p.paidAt)).toISOString()}))};
}
function normalizeInput(input: PreparationInput): PreparationInput {
 const b=input.buyer;
 return {buyer:{buyerType:b.buyerType??'unknown',vatRegistrationStatus:b.vatRegistrationStatus,name:b.name,vatNumber:b.vatNumber,otherIdentifier:b.otherIdentifier?{scheme:b.otherIdentifier.scheme,value:b.otherIdentifier.value}:null,address:b.address?{...address({...b.address,additionalNumber:b.address.additionalNumber??null})}:null,identityConfirmed:b.identityConfirmed,transactionCountry:b.transactionCountry},supplyDate:input.supplyDate,documentKind:input.documentKind,flags:Object.fromEntries(Object.entries(input.flags).sort(([a],[b])=>asciiCompare(a,b))),...(input.paymentDecision?{paymentDecision:{context:input.paymentDecision.context,actorId:input.paymentDecision.actorId,decidedAt:input.paymentDecision.decidedAt,reason:input.paymentDecision.reason,recordIds:[...input.paymentDecision.recordIds].sort(asciiCompare)}}:{})};
}
export function sourceFingerprint(envelope: SourceEnvelope,input: PreparationInput): string {
 return createHash('sha256').update(stableSerialize({source:envelope,input:normalizeInput(input),rulesVersion:RULES_VERSION,calculationPolicy:CALCULATION_POLICY}),'utf8').digest('hex');
}
function mapDocument(row: JsonObject): Document {
 const version=text(row.preparation_version);
 if(!/^\d+$/.test(version) || BigInt(version)>BigInt(Number.MAX_SAFE_INTEGER))throw new PersistenceError('CANONICAL_INVALID');
 return {id:text(row.id),invoiceId:text(row.invoice_id),uuid:text(row.invoice_uuid),revisionNo:integer(row.revision_no),status:text(row.preparation_status) as Document['status'],snapshot:row.canonical_snapshot as Document['snapshot'],fingerprint:nullableText(row.source_fingerprint),issueAt:row.issue_at?new Date(text(row.issue_at)).toISOString():null,frozenAt:row.snapshot_frozen_at?new Date(text(row.snapshot_frozen_at)).toISOString():null,validatedAt:row.canonical_validated_at?new Date(text(row.canonical_validated_at)).toISOString():null,version:Number(version)};
}
const denied=(code: BlockerCode): Result<Document>=>({ok:false,blockers:[{code,severity:'ERROR'}]});

export class RpcPreparationAdapter {
 private constructor(private readonly client: RpcClient,private readonly actorId: string,private readonly clock:()=>string) {}
 static async create(session: SessionClient, privilegedClient: ()=>RpcClient,projectUrl: string,clock:()=>string=()=>new Date().toISOString()) {
  if(typeof window!=='undefined' || new URL(projectUrl).origin!==`https://${RUNTIME_PROJECT_REF}.supabase.co`)throw new PersistenceError('FORBIDDEN');
  const user=await session.auth.getUser();
  if(user.error || !user.data.user || user.data.user.is_anonymous)throw new PersistenceError('AUTH_REQUIRED');
  const profile=await session.from('profiles').select('role').eq('id',user.data.user.id).single();
  if(profile.error || !profile.data || !['admin_manager','super_admin'].includes(profile.data.role))throw new PersistenceError('FORBIDDEN');
  // Never instantiate privileged client until session and trusted role checks pass.
  return new RpcPreparationAdapter(privilegedClient(),user.data.user.id,clock);
 }
 private async call(name: string,args: JsonObject): Promise<JsonObject> {
  let result: Awaited<ReturnType<RpcClient['rpc']>>;
  try {result=await this.client.rpc(name,{...args,p_verified_actor_id:this.actorId});}
  catch {throw new PersistenceError('PERSISTENCE_UNAVAILABLE');}
  if(result.error)throw new PersistenceError(mapPersistenceFailure(result.error));
  return object(result.data);
 }
 async run(invoiceId: string,operation: Operation,input?: PreparationInput): Promise<Result<Document>> {
  try {
   if(!OPERATIONS.includes(operation))return denied('RPC_OPERATION_INVALID');
   const context=await this.call('zatca_read_preparation_context',{p_invoice_id:invoiceId,p_include_sources:operation==='prepare'||operation==='freeze'});
   const row=context.document===null?null:object(context.document);
   let document=row?mapDocument(row):null;
   if(!document && operation!=='prepare')return denied('DOCUMENT_NOT_CURRENT');
   let expectedSources: SourceEnvelope|null=null;
   let payload: JsonObject={};
   if(operation==='prepare') {
    if(!input)return denied('CANONICAL_INVALID');
    if(document && (document.frozenAt || !['draft','prepared'].includes(document.status)))return denied('REVISION_REQUIRED');
    expectedSources=normalizeSourceEnvelope(context.sources);
    const normalized=normalizeInput(input);
    if(normalized.paymentDecision) {
     normalized.paymentDecision.actorId=this.actorId;
     normalized.paymentDecision.decidedAt=this.clock();
    }
    document??={id:randomUUID(),uuid:randomUUID(),invoiceId,revisionNo:1,status:'draft',snapshot:null,fingerprint:null,issueAt:null,frozenAt:null,validatedAt:null,version:0};
    const prepared=build(canonicalSources(expectedSources),normalized,document,this.clock());
    if(!prepared.ok)return prepared;
    payload={input:normalized,snapshot:prepared.value,snapshotVersion:1,rulesVersion:RULES_VERSION,sourceFingerprint:sourceFingerprint(expectedSources,normalized)};
   } else if(operation==='freeze') {
    if(document!.status!=='prepared')return denied('PREPARATION_STATE_INVALID');
    expectedSources=normalizeSourceEnvelope(context.sources);
    const preparedSources=normalizeSourceEnvelope(row!.prepared_source_snapshot);
    const storedInput=normalizeInput(object(row!.preparation_input) as unknown as PreparationInput);
    if(stableSerialize(expectedSources)!==stableSerialize(preparedSources) || sourceFingerprint(expectedSources,storedInput)!==document!.fingerprint)return denied('SOURCE_CHANGED');
    const rebuilt=build(canonicalSources(expectedSources),storedInput,document!,document!.snapshot?.metadata.preparedAt??this.clock());
    if(!rebuilt.ok || stableSerialize(rebuilt.value)!==stableSerialize(document!.snapshot))return denied('CANONICAL_INVALID');
    payload={sourceFingerprint:document!.fingerprint};
   } else if(operation==='canonical_validate') {
    if(document!.status!=='frozen')return denied('PREPARATION_STATE_INVALID');
    const valid=validateFrozenSnapshot(document!);
    if(!valid.ok)return valid;
    payload={valid:true,snapshot:document!.snapshot,snapshotVersion:row!.snapshot_version,rulesVersion:row!.rules_version,sourceFingerprint:document!.fingerprint};
   } else if(!document!.frozenAt || !['frozen','canonical_validated'].includes(document!.status))return denied('REVISION_REQUIRED');
   const result=await this.call('zatca_apply_preparation_transition',{p_operation:operation,p_invoice_id:invoiceId,p_document_id:document!.id,p_expected_preparation_version:String(document!.version),p_expected_source_snapshot:expectedSources,p_payload:payload});
   return {ok:true,value:mapDocument(object(result.document))};
  } catch(error) {return denied(error instanceof PersistenceError?error.failureCode:'CANONICAL_INVALID');}
 }
}
