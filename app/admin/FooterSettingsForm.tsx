"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ImageUploadField from "./site/ImageUploadField";

type FooterContent = {
  company_name: string;
  description: string;
  phone: string;
  email: string;
  address: string;
  copyright_text: string;
  business_center_label: string;
  business_center_url: string;
  business_center_logo_url: string;
  payment_methods: string[];
  payment_logo_urls: Record<string, string>;
};

const PAYMENT_OPTIONS = [
  { id: "mada", label: "مدى" },
  { id: "visa", label: "Visa" },
  { id: "mastercard", label: "Mastercard" },
  { id: "apple_pay", label: "Apple Pay" },
  { id: "bank_transfer", label: "تحويل بنكي" },
  { id: "cash", label: "نقدًا" },
];

export default function FooterSettingsForm({ initialContent }: { initialContent: FooterContent }) {
  const [form, setForm] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function update(field: Exclude<keyof FooterContent, "payment_methods" | "payment_logo_urls">, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updatePaymentLogo(id: string, url: string) {
    setForm((current) => ({ ...current, payment_logo_urls: { ...current.payment_logo_urls, [id]: url } }));
  }

  function togglePayment(id: string) {
    setForm((current) => ({ ...current, payment_methods: current.payment_methods.includes(id) ? current.payment_methods.filter((item) => item !== id) : [...current.payment_methods, id] }));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");

    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("site_footer_content")
      .upsert({ id: true, ...form }, { onConflict: "id" });

    if (saveError) {
      setError("تعذر حفظ بيانات التذييل. تأكد من صلاحيات حساب الإدارة.");
    } else {
      setMessage("تم حفظ بيانات التذييل بنجاح.");
    }
    setSaving(false);
  }

  return (
    <section className="card footerSettingsCard">
      <div className="sectionHeading">
        <div>
          <p className="eyebrow">محتوى الموقع</p>
          <h2>إعدادات التذييل</h2>
        </div>
        <p className="sectionIntro">حدّث البيانات التي تظهر للزوار في أسفل الموقع دون تعديل الكود.</p>
      </div>

      <div className="formGrid">
        <label>اسم المنشأة<input value={form.company_name} onChange={(e) => update("company_name", e.target.value)} /></label>
        <label>رقم التواصل<input dir="ltr" value={form.phone} onChange={(e) => update("phone", e.target.value)} /></label>
        <label>البريد الإلكتروني<input dir="ltr" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} /></label>
        <label>العنوان<input value={form.address} onChange={(e) => update("address", e.target.value)} /></label>
        <label className="fullField">الوصف<textarea rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} /></label>
        <label className="fullField">نص الحقوق<input value={form.copyright_text} onChange={(e) => update("copyright_text", e.target.value)} /></label>
      </div>

      <div className="footerExtras">
        <div><p className="eyebrow">مركز الأعمال</p><h3>رابط وشعار مركز الأعمال</h3><p>يظهر للزوار في التذييل، ويمكن ربطه ببوابة الشركاء أو الموظفين.</p></div>
        <div className="formGrid">
          <label>نص الرابط<input value={form.business_center_label} onChange={(e) => update("business_center_label", e.target.value)} /></label>
          <label>رابط مركز الأعمال<input dir="ltr" value={form.business_center_url} onChange={(e) => update("business_center_url", e.target.value)} /></label>
          <div className="fullField"><ImageUploadField label="شعار مركز الأعمال" value={form.business_center_logo_url || null} onChange={(url) => update("business_center_logo_url", url || "")} /></div>
        </div>
      </div>

      <div className="footerExtras">
        <div><p className="eyebrow">طرق السداد</p><h3>الأيقونات الظاهرة للزوار</h3><p>اختر فقط الوسائل التي تتوفر لديك فعليًا.</p></div>
        <div className="paymentOptionGrid">{PAYMENT_OPTIONS.map((option) => <div key={option.id} className="paymentOption"><label><input type="checkbox" checked={form.payment_methods.includes(option.id)} onChange={() => togglePayment(option.id)} /><span>{option.label}</span></label><input className="paymentLogoUrl" dir="ltr" type="url" placeholder="https://.../logo.png" value={form.payment_logo_urls[option.id] || ""} onChange={(event) => updatePaymentLogo(option.id, event.target.value)} aria-label={`رابط شعار ${option.label}`} /></div>)}</div>
      </div>

      <div className="formActions">
        <button className="button primary" type="button" onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}</button>
        {message ? <span className="form-success">{message}</span> : null}
        {error ? <span className="form-error">{error}</span> : null}
      </div>

      <style>{`.footerSettingsCard{margin-top:22px}.formGrid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.formGrid label{display:flex;flex-direction:column;gap:7px;color:#334155;font-weight:700;font-size:.9rem}.formGrid input,.formGrid textarea{width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:12px 13px;font:inherit;background:#fff;color:#0f172a}.fullField{grid-column:1/-1}.footerExtras{display:grid;grid-template-columns:minmax(180px,.65fr) minmax(0,1.35fr);gap:20px;margin-top:26px;padding-top:24px;border-top:1px solid #e2e8f0}.footerExtras h3{margin:4px 0 6px}.footerExtras p:not(.eyebrow){margin:0;color:#64748b;line-height:1.7}.paymentOptionGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.paymentOption{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:center;padding:10px 12px;border:1px solid #cbd5e1;border-radius:11px;background:#f8fafc}.paymentOption>label{display:inline-flex;flex-direction:row;align-items:center;gap:7px;white-space:nowrap}.paymentOption>label input{width:auto}.paymentLogoUrl{min-width:0!important;padding:9px 10px!important;font-size:.82rem!important}.formActions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:18px}.form-success{color:#166534;font-weight:700}.form-error{color:#b91c1c;font-weight:700}@media(max-width:620px){.formGrid,.footerExtras,.paymentOptionGrid{grid-template-columns:1fr}.fullField{grid-column:auto}.paymentOption{grid-template-columns:1fr}}`}</style>
    </section>
  );
}
