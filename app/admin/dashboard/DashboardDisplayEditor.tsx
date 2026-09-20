"use client";

import { DragEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CUSTOMER_DASHBOARD_CARDS, DashboardCard, TECHNICIAN_DASHBOARD_CARDS, normalizeDashboardCards } from "@/lib/dashboard-display";

type Mode = "customer" | "technician";
const reorder = <T,>(items: T[], from: number, to: number) => { const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; };

export default function DashboardDisplayEditor({ initialCustomerCards, initialTechnicianCards }: { initialCustomerCards: unknown; initialTechnicianCards: unknown }) {
  const [mode, setMode] = useState<Mode>("customer");
  const [customerCards, setCustomerCards] = useState<DashboardCard[]>(() => normalizeDashboardCards(initialCustomerCards, CUSTOMER_DASHBOARD_CARDS));
  const [technicianCards, setTechnicianCards] = useState<DashboardCard[]>(() => normalizeDashboardCards(initialTechnicianCards, TECHNICIAN_DASHBOARD_CARDS));
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const cards = mode === "customer" ? customerCards : technicianCards;
  const definitions = mode === "customer" ? CUSTOMER_DASHBOARD_CARDS : TECHNICIAN_DASHBOARD_CARDS;
  const updateCards = (next: DashboardCard[]) => mode === "customer" ? setCustomerCards(next) : setTechnicianCards(next);
  const cardsWithLabels = useMemo(() => cards.map(card => { const definition = definitions.find(item => item.id === card.id); return { ...card, label: definition?.label ?? card.id, description: definition?.description ?? "" }; }), [cards, definitions]);
  const dragOver = (event: DragEvent) => event.preventDefault();
  function move(dragId: string, overId: string) { if (dragId === overId) return; const from = cards.findIndex(card => card.id === dragId); const to = cards.findIndex(card => card.id === overId); if (from >= 0 && to >= 0) updateCards(reorder(cards, from, to)); }
  async function save() {
    setBusy(true); setMessage("");
    const { error } = await createClient().from("dashboard_display_settings").upsert({ id: true, customer_cards: customerCards, technician_cards: technicianCards, updated_at: new Date().toISOString() });
    setBusy(false); setMessage(error ? "تعذر حفظ إعدادات العرض. تحقق من صلاحية الإدارة ثم حاول مجددًا." : "حُفظ ترتيب البطاقات وإظهارها. راجع لوحة العميل أو الفني لمعاينة النتيجة.");
  }
  return <section className="dashboardBuilder">
    <div className="dashboardBuilderHero"><div><p className="eyebrow">تجربة اللوحات</p><h1>محرر عرض لوحات المستخدمين</h1><p>رتّب البطاقات وأخفها أو أظهرها. لا يغير هذا المحرر صلاحيات المستخدمين أو مسار حالة الطلب.</p></div><button className="button primary" type="button" onClick={save} disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ إعدادات العرض"}</button></div>
    {message ? <p className="builderMessage" role="status">{message}</p> : null}
    <div className="dashboardAudienceTabs" role="tablist" aria-label="نوع اللوحة"><button className={mode === "customer" ? "active" : ""} type="button" role="tab" aria-selected={mode === "customer"} onClick={() => setMode("customer")}>لوحة العميل</button><button className={mode === "technician" ? "active" : ""} type="button" role="tab" aria-selected={mode === "technician"} onClick={() => setMode("technician")}>لوحة الفني</button></div>
    <div className="dashboardBuilderGrid"><section className="dashboardCardManager"><h2>{mode === "customer" ? "بطاقات العميل" : "بطاقات الفني"}</h2><p>اسحب البطاقة إلى موضعها الجديد، ثم استخدم المفتاح لإظهارها أو إخفائها.</p><div>{cardsWithLabels.map(card => <article className="dashboardEditableCard" key={card.id} draggable onDragStart={() => setDraggedId(card.id)} onDragOver={dragOver} onDrop={() => { if (draggedId) move(draggedId, card.id); setDraggedId(null); }}><span className="dragHandle" aria-hidden>⠿</span><div><strong>{card.label}</strong><p>{card.description}</p></div><label className="visibilitySwitch"><input type="checkbox" checked={card.visible} onChange={event => updateCards(cards.map(item => item.id === card.id ? { ...item, visible: event.target.checked } : item))}/><span>{card.visible ? "ظاهر" : "مخفي"}</span></label></article>)}</div></section>
    <aside className="dashboardPreviewPanel"><p className="eyebrow">معاينة البنية</p><h2>{mode === "customer" ? "حساب العميل" : "مساحة الفني"}</h2><div className="dashboardMiniPreview">{cardsWithLabels.map(card => <div className={card.visible ? "visible" : "hidden"} key={card.id}><strong>{card.label}</strong><span>{card.visible ? "سيظهر في اللوحة" : "لن يظهر في اللوحة"}</span></div>)}</div><p className="dashboardPreviewNote">التعديل يخص طريقة العرض فقط. الإشعارات والإجراءات وصلاحيات التنفيذ تبقى محمية كما هي.</p></aside></div>
  </section>;
}
