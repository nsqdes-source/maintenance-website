"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Section = { id: string; slug: string; eyebrow: string | null; title: string; description: string | null; image_url: string | null; sort_order: number; is_visible: boolean };
type Item = { id: string; section_id: string; title: string; description: string | null; image_url: string | null; sort_order: number; is_visible: boolean };
const LABELS: Record<string, string> = { hero: "الواجهة الرئيسية", services: "الخدمات", "why-us": "لماذا نحن", works: "الأعمال", contact: "التواصل" };

export default function SiteEditor({ initialSettings, initialSections, initialItems }: { initialSettings: Record<string, string>; initialSections: Section[]; initialItems: Item[] }) {
  const [settings, setSettings] = useState<Record<string, string>>(initialSettings);
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const settingsResult = await supabase.from("site_settings").upsert(Object.entries(settings).map(([key, value]) => ({ key, value })));
    const sectionResults = await Promise.all(sections.map(section => supabase.from("site_sections").update({
      eyebrow: section.eyebrow, title: section.title, description: section.description,
      image_url: section.image_url, sort_order: section.sort_order, is_visible: section.is_visible,
    }).eq("id", section.id)));
    const itemResults = await Promise.all(items.map(item => supabase.from("site_section_items").update({
      title: item.title, description: item.description, image_url: item.image_url,
      sort_order: item.sort_order, is_visible: item.is_visible,
    }).eq("id", item.id)));
    setBusy(false);
    setMessage(settingsResult.error || sectionResults.some(result => result.error) || itemResults.some(result => result.error)
      ? "تعذر حفظ بعض التغييرات. راجع القيم وحاول مجددًا." : "حُفظت تغييرات الموقع.");
  }

  async function addItem(sectionId: string) {
    const { data, error } = await createClient().from("site_section_items")
      .insert({ section_id: sectionId, title: "عنصر جديد", description: "", sort_order: items.filter(item => item.section_id === sectionId).length })
      .select("id,section_id,title,description,image_url,sort_order,is_visible").single();
    if (error || !data) { setMessage("تعذر إضافة العنصر."); return; }
    setItems(current => [...current, data]);
  }
  async function removeItem(id: string) {
    const { error } = await createClient().from("site_section_items").delete().eq("id", id);
    if (error) { setMessage("تعذر حذف العنصر."); return; }
    setItems(current => current.filter(item => item.id !== id));
  }

  return <div className="requestList">
    <section className="card"><h2>الشعار والألوان وHeader</h2>
      <div className="detailFields">
        <label>نص الشعار<input value={settings.logo_text || ""} onChange={e => setSettings({ ...settings, logo_text: e.target.value })} /></label>
        <label>رابط صورة الشعار<input type="url" value={settings.logo_image_url || ""} onChange={e => setSettings({ ...settings, logo_image_url: e.target.value })} /></label>
        <label>اللون الأساسي<input type="color" value={settings.primary_color || "#0f172a"} onChange={e => setSettings({ ...settings, primary_color: e.target.value })} /></label>
        <label>اللون المساعد<input type="color" value={settings.accent_color || "#f59e0b"} onChange={e => setSettings({ ...settings, accent_color: e.target.value })} /></label>
        <label>نص زر Header<input value={settings.header_cta_text || ""} onChange={e => setSettings({ ...settings, header_cta_text: e.target.value })} /></label>
      </div>
    </section>
    {sections.map(section => <section className="card" key={section.id}>
      <h2>{LABELS[section.slug] || section.slug}</h2>
      <div className="detailFields">
        <label>العنوان الفرعي<input value={section.eyebrow || ""} onChange={e => setSections(current => current.map(row => row.id === section.id ? { ...row, eyebrow: e.target.value } : row))} /></label>
        <label>العنوان<input value={section.title} onChange={e => setSections(current => current.map(row => row.id === section.id ? { ...row, title: e.target.value } : row))} /></label>
        <label>الوصف<textarea value={section.description || ""} onChange={e => setSections(current => current.map(row => row.id === section.id ? { ...row, description: e.target.value } : row))} /></label>
        <label>رابط الصورة<input type="url" value={section.image_url || ""} onChange={e => setSections(current => current.map(row => row.id === section.id ? { ...row, image_url: e.target.value } : row))} /></label>
        <label>الترتيب<input type="number" value={section.sort_order} onChange={e => setSections(current => current.map(row => row.id === section.id ? { ...row, sort_order: Number(e.target.value) } : row))} /></label>
        <label><input type="checkbox" checked={section.is_visible} onChange={e => setSections(current => current.map(row => row.id === section.id ? { ...row, is_visible: e.target.checked } : row))} /> إظهار القسم</label>
      </div>
      {items.filter(item => item.section_id === section.id).sort((a,b) => a.sort_order - b.sort_order).map(item => <div key={item.id} className="assignmentHistoryItem">
        <div className="detailFields">
          <label>عنوان العنصر<input value={item.title} onChange={e => setItems(current => current.map(row => row.id === item.id ? { ...row, title: e.target.value } : row))} /></label>
          <label>الوصف<textarea value={item.description || ""} onChange={e => setItems(current => current.map(row => row.id === item.id ? { ...row, description: e.target.value } : row))} /></label>
          <label>رابط الصورة<input type="url" value={item.image_url || ""} onChange={e => setItems(current => current.map(row => row.id === item.id ? { ...row, image_url: e.target.value } : row))} /></label>
          <label>الترتيب<input type="number" value={item.sort_order} onChange={e => setItems(current => current.map(row => row.id === item.id ? { ...row, sort_order: Number(e.target.value) } : row))} /></label>
          <label><input type="checkbox" checked={item.is_visible} onChange={e => setItems(current => current.map(row => row.id === item.id ? { ...row, is_visible: e.target.checked } : row))} /> إظهار العنصر</label>
        </div>
        <button type="button" className="button secondary compactButton" onClick={() => removeItem(item.id)}>حذف العنصر</button>
      </div>)}
      {section.slug !== "hero" && section.slug !== "contact" ? <button type="button" className="button secondary compactButton" onClick={() => addItem(section.id)}>إضافة عنصر</button> : null}
    </section>)}
    <div><button type="button" className="button primary" disabled={busy} onClick={save}>{busy ? "جارٍ الحفظ..." : "حفظ تغييرات الموقع"}</button>{message ? <p role="status">{message}</p> : null}</div>
  </div>;
}
