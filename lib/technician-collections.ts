export const technicianCollectionActivationReady = false;
export type CollectionMethod = "cash" | "bank_transfer" | "card" | "other";
export type CollectionRecord = {id:string;method:CollectionMethod;amount:number;status:string;collected_at:string;created_at:string};
export type CollectionContext = {request_id:string;payment_domain_enabled:boolean;currency:string|null;authoritative_charge:number|null;remaining_contractual:number|null;payable_cap:number|null;payable_now:number|null;collection_allowed:boolean;collection_block_reason:string|null;collections:CollectionRecord[]};
export type PaymentOperation = CollectionRecord & {request_id:string;technician_id:string;technician_name:string;currency:string;posting_state:string;source:string;block_reason:string|null;review_required:boolean;reconciliation_required:boolean};
export type PaymentOperations = {payment_domain_enabled:boolean;operations:PaymentOperation[];limit:number;offset:number};
export const methodLabels:Record<CollectionMethod,string> = {cash:"نقد",bank_transfer:"تحويل بنكي",card:"بطاقة",other:"أخرى"};
export const statusLabels:Record<string,string> = {pending_settlement:"في عهدتك — بانتظار التسوية",pending_verification:"بانتظار تحقق الإدارة المالية",verified:"تم التحقق — لا يعد إيصالًا مؤكدًا حتى التسجيل المالي",settled:"تمت التسوية",rejected:"رفضت الإدارة المالية التحصيل",void_recorded:"تم إبطال سجل العهدة"};
export function collectionAmount(context:CollectionContext):number|null {
 const value=context.payable_now;
 return context.collection_allowed && context.payment_domain_enabled && value!==null && Number.isFinite(Number(value)) && Number(value)>0 ? Number(value):null;
}
