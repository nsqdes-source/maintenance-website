"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type FooterContent = {
  company_name: string;
  description: string;
  phone: string;
  email: string;
  address: string;
  copyright_text: string;
};

export default function FooterSettingsForm({ initialContent }: { initialContent: FooterContent }) {
  const [form, setForm] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function update(field: keyof FooterContent, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
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

      <div className="formActions">
        <button className="button primary" type="button" onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}</button>
        {message ? <span className="form-success">{message}</span> : null}
        {error ? <span className="form-error">{error}</span> : null}
      </div>

      <style>{`.footerSettingsCard{margin-top:22px}.formGrid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.formGrid label{display:flex;flex-direction:column;gap:7px;color:#334155;font-weight:700;font-size:.9rem}.formGrid input,.formGrid textarea{width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:12px 13px;font:inherit;background:#fff;color:#0f172a}.fullField{grid-column:1/-1}.formActions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:18px}.form-success{color:#166534;font-weight:700}.form-error{color:#b91c1c;font-weight:700}@media(max-width:620px){.formGrid{grid-template-columns:1fr}.fullField{grid-column:auto}}`}</style>
    </section>
  );
}
