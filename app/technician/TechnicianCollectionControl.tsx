"use client";
import {useEffect,useState} from "react";
import {collectionAmount,methodLabels,statusLabels,technicianCollectionActivationReady,type CollectionContext,type CollectionMethod} from "@/lib/technician-collections";
import {getCollectionContext,recordTechnicianCollection} from "./collection-actions";
export default function TechnicianCollectionControl({requestId}:{requestId:string}) {
 const [context,setContext]=useState<CollectionContext|null>(null);const [method,setMethod]=useState<CollectionMethod>("cash");const [amount,setAmount]=useState("");const [message,setMessage]=useState("");const [pending,setPending]=useState(false);const [key,setKey]=useState("");
 useEffect(()=>{let live=true;getCollectionContext(requestId).then(result=>{if(live && result.ok)setContext(result.context);});return()=>{live=false;};},[requestId]);
 if(!context?.payment_domain_enabled)return null;
 const payable=collectionAmount(context);const disabled=!technicianCollectionActivationReady || payable===null || pending;
 async function save(){if(disabled)return;setPending(true);const token=key||crypto.randomUUID();setKey(token);const result=await recordTechnicianCollection(requestId,method,Number(amount),token);setMessage(result.message);if(result.ok){const refreshed=await getCollectionContext(requestId);if(refreshed.ok)setContext(refreshed.context);setAmount("");setKey("");}setPending(false);}
 return <section className="collectionOperations" aria-label="تحصيل الفني"><h3>تحصيل الطلب</h3><p>المبلغ المعتمد للتحصيل: {payable===null?"غير متاح":`${payable.toFixed(2)} ${context.currency??""}`}</p>{!technicianCollectionActivationReady?<p>التحصيل التشغيلي غير مفعّل حتى اكتمال ضوابط التفعيل.</p>:null}
 <label>نوع التحصيل<select value={method} disabled={disabled} onChange={e=>setMethod(e.target.value as CollectionMethod)}>{Object.entries(methodLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
 <label>المبلغ المحصل<input type="number" inputMode="decimal" min="0.01" step="0.01" max={payable??undefined} value={amount} disabled={disabled} onChange={e=>setAmount(e.target.value)}/></label>
 <p>{method==="cash"?"المبلغ المحصل نقدًا سيكون في عهدتك حتى تسويته من الإدارة المالية.":"التحصيل غير النقدي يحتاج تحقق الإدارة المالية. البطاقة تصنيف للسجل فقط."}</p>
 <button type="button" className="button" disabled={disabled} onClick={save}>{pending?"جارٍ التسجيل…":"تسجيل التحصيل"}</button><p role="status">{message}</p>
 {context.collections.map(row=><article key={row.id}><p>{methodLabels[row.method]} — {row.amount} {context.currency}</p><p>{statusLabels[row.status]??"حالة غير متاحة"}</p></article>)}</section>;
}
