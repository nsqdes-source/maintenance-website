"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Item = { id:string; service_key:string; name:string; description:string; price_from:number|null; pricing_mode:"fixed"|"from"|"inspection"; is_visible:boolean; sort_order:number; parent_id:string|null };
type Part = { id:string; service_catalog_item_id:string; name:string; default_price:number; is_active:boolean; sort_order:number };

export default function CatalogManager({ initialItems, initialParts }: { initialItems:Item[]; initialParts:Part[] }) {
  const [items,setItems]=useState(initialItems);
  const [parts,setParts]=useState(initialParts);
  const [editing,setEditing]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [messageType,setMessageType]=useState<"success"|"error">("success");
  const [partFilter,setPartFilter]=useState("");
  const main=items.filter(item=>!item.parent_id);
  const filteredParts=partFilter?parts.filter(part=>part.service_catalog_item_id===partFilter):parts;

  const patchItem=(id:string,update:Partial<Item>)=>setItems(rows=>rows.map(row=>row.id===id?{...row,...update}:row));
  const patchPart=(id:string,update:Partial<Part>)=>setParts(rows=>rows.map(row=>row.id===id?{...row,...update}:row));

  async function save(){
    setBusy(true); setMessage("");
    const db=createClient();
    const failures:string[]=[];
    for(const item of items){
      const {error}=await db.from("service_catalog_items").update({name:item.name.trim(),description:item.description.trim(),price_from:item.price_from,pricing_mode:item.pricing_mode,is_visible:item.is_visible,sort_order:item.sort_order,parent_id:item.parent_id}).eq("id",item.id);
      if(error){console.error("Catalog service save failed",{id:item.id,error});failures.push(`الخدمة «${item.name||"بلا اسم"}»`)}
    }
    for(const part of parts){
      const {error}=await db.from("service_catalog_parts").update({service_catalog_item_id:part.service_catalog_item_id,name:part.name.trim(),default_price:part.default_price,is_active:part.is_active,sort_order:part.sort_order}).eq("id",part.id);
      if(error){console.error("Catalog part save failed",{id:part.id,error});failures.push(`القطعة «${part.name||"بلا اسم"}»`)}
    }
    setBusy(false); setEditing(null); setMessageType(failures.length?"error":"success");
    setMessage(failures.length?`لم تُحفظ العناصر التالية: ${failures.join("، ")}. لم تتأثر بقية العناصر.`:"تم حفظ جميع تغييرات الخدمات والقطع.");
  }

  async function addService(){
    setMessage("");
    const {data,error}=await createClient().from("service_catalog_items").insert({service_key:`service-${crypto.randomUUID()}`,name:"خدمة جديدة",description:"",pricing_mode:"inspection",sort_order:items.length}).select().single();
    if(error||!data){console.error("Catalog service insert failed",error);setMessageType("error");setMessage("تعذر إضافة الخدمة. تحقق من صلاحية الحساب ومن عدم تكرار بيانات الخدمة.");return}
    setItems(current=>[...current,data as Item]);setEditing(data.id);
  }

  async function addPart(){
    const service=main[0];
    if(!service){setMessageType("error");setMessage("أضف خدمة رئيسية أولًا.");return}
    setMessage("");
    const {data,error}=await createClient().from("service_catalog_parts").insert({service_catalog_item_id:service.id,name:"قطعة جديدة",default_price:0,sort_order:parts.length}).select().single();
    if(error||!data){console.error("Catalog part insert failed",error);setMessageType("error");setMessage("تعذر إضافة القطعة. تحقق من صلاحية الحساب ومن ارتباطها بخدمة رئيسية.");return}
    setParts(current=>[...current,data as Part]);setEditing(data.id);
  }

  async function remove(table:"service_catalog_items"|"service_catalog_parts",id:string){
    if(!confirm("هل تريد الحذف نهائيًا؟"))return;
    setBusy(true);setMessage("");
    const {error}=await createClient().from(table).delete().eq("id",id);
    setBusy(false);
    if(error){console.error("Catalog delete failed",{table,id,error});setMessageType("error");setMessage(table==="service_catalog_items"?"لا يمكن حذف خدمة مرتبطة بعناصر أخرى؛ أوقفها بدلًا من ذلك.":"تعذر حذف القطعة لأنها مستخدمة أو لعدم توفر الصلاحية.");return}
    if(table==="service_catalog_items")setItems(current=>current.filter(row=>row.id!==id));else setParts(current=>current.filter(row=>row.id!==id));
    setMessageType("success");setMessage("تم حذف العنصر.");
  }

  function serviceName(id:string){return items.find(item=>item.id===id)?.name||"—"}

  return <section className="catalogSplit">
    <section className="catalogPane"><div className="catalogPaneHeader"><div><p className="eyebrow">إدارة الخدمات</p><h2>الخدمات</h2></div><button className="button secondary compactButton" type="button" onClick={()=>void addService()} disabled={busy}>إضافة خدمة</button></div><div className="catalogTableWrap"><table className="adminTable"><thead><tr><th>الخدمة</th><th>التصنيف</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td>{editing===item.id?<input value={item.name} onChange={event=>patchItem(item.id,{name:event.target.value})}/>:<strong>{item.name}</strong>}</td><td>{editing===item.id?<select value={item.parent_id??""} onChange={event=>patchItem(item.id,{parent_id:event.target.value||null})}><option value="">رئيسية</option>{main.filter(row=>row.id!==item.id).map(row=><option key={row.id} value={row.id}>فرعية من {row.name}</option>)}</select>:item.parent_id?`فرعية من ${serviceName(item.parent_id)}`:"رئيسية"}</td><td><button className="catalogStatus" type="button" onClick={()=>patchItem(item.id,{is_visible:!item.is_visible})}>{item.is_visible?"مفعلة":"موقفة"}</button></td><td className="catalogActions"><button type="button" onClick={()=>setEditing(editing===item.id?null:item.id)}>تعديل</button><button type="button" className="danger" onClick={()=>void remove("service_catalog_items",item.id)}>حذف</button></td></tr>)}</tbody></table></div></section>
    <section className="catalogPane"><div className="catalogPaneHeader"><div><p className="eyebrow">أسعار افتراضية</p><h2>القطع والأسعار</h2></div><button className="button secondary compactButton" type="button" onClick={()=>void addPart()} disabled={busy}>إضافة قطعة</button></div><label>تصفية حسب الخدمة الرئيسية<select value={partFilter} onChange={event=>setPartFilter(event.target.value)}><option value="">كل الخدمات</option>{main.map(service=><option key={service.id} value={service.id}>{service.name}</option>)}</select></label><div className="catalogTableWrap"><table className="adminTable"><thead><tr><th>القطعة</th><th>الخدمة</th><th>السعر</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{filteredParts.map(part=><tr key={part.id}><td>{editing===part.id?<input value={part.name} onChange={event=>patchPart(part.id,{name:event.target.value})}/>:<strong>{part.name}</strong>}</td><td>{editing===part.id?<select value={part.service_catalog_item_id} onChange={event=>patchPart(part.id,{service_catalog_item_id:event.target.value})}>{main.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select>:serviceName(part.service_catalog_item_id)}</td><td>{editing===part.id?<input type="number" min="0" value={part.default_price} onChange={event=>patchPart(part.id,{default_price:Number(event.target.value)||0})}/>:`${part.default_price} ر.س`}</td><td><button className="catalogStatus" type="button" onClick={()=>patchPart(part.id,{is_active:!part.is_active})}>{part.is_active?"مفعلة":"موقفة"}</button></td><td className="catalogActions"><button type="button" onClick={()=>setEditing(editing===part.id?null:part.id)}>تعديل</button><button type="button" className="danger" onClick={()=>void remove("service_catalog_parts",part.id)}>حذف</button></td></tr>)}</tbody></table></div></section>
    <div className="catalogSave"><button className="button primary" type="button" disabled={busy} onClick={()=>void save()}>{busy?"جارٍ الحفظ...":"حفظ التغييرات"}</button>{message?<span className={messageType==="error"?"inlineError":"inlineSuccess"} role={messageType==="error"?"alert":"status"}>{message}</span>:null}</div>
  </section>;
}
