"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "../Marketing.module.css";

type Values = Record<string, string>;

const integrations = [
  { key: "marketing_ga_measurement_id", name: "Google Analytics 4", category: "التحليلات", placeholder: "G-XXXXXXXXXX", pattern: /^G-[A-Z0-9]+$/i, active: true, note: "يعمل بعد موافقة المستخدم على ملفات التحليلات." },
  { key: "marketing_gtm_id", name: "Google Tag Manager", category: "إدارة الوسوم", placeholder: "GTM-XXXXXXX", pattern: /^GTM-[A-Z0-9]+$/i, active: false, note: "يُحفظ المعرّف فقط. حقن GTM غير مفعّل بعد." },
  { key: "marketing_google_ads_id", name: "Google Ads", category: "الإعلانات والتحويلات", placeholder: "AW-XXXXXXXXX", pattern: /^AW-[0-9]+$/i, active: false, note: "يُحفظ المعرّف فقط. ربط generate_lead سيأتي في المرحلة التالية." },
  { key: "marketing_meta_pixel_id", name: "Meta Pixel", category: "الإعلانات", placeholder: "رقم Pixel", pattern: /^[0-9]+$/, active: false, note: "لن يتم تشغيله قبل ربطه بطبقة الموافقة." },
  { key: "marketing_tiktok_pixel_id", name: "TikTok Pixel", category: "الإعلانات", placeholder: "Pixel ID", pattern: /^[A-Z0-9_-]+$/i, active: false, note: "معرّف عام فقط؛ لا يقبل JavaScript." },
  { key: "marketing_snap_pixel_id", name: "Snap Pixel", category: "الإعلانات", placeholder: "Pixel ID", pattern: /^[A-Z0-9_-]+$/i, active: false, note: "معرّف عام فقط؛ لا يقبل JavaScript." },
  { key: "marketing_x_pixel_id", name: "X Pixel", category: "الإعلانات", placeholder: "Pixel ID", pattern: /^[A-Z0-9_-]+$/i, active: false, note: "معرّف عام فقط؛ لا يقبل JavaScript." },
] as const;

export default function IntegrationsManager({ initialValues, canEdit }: { initialValues: Values; canEdit: boolean }) {
  const [values, setValues] = useState<Values>(initialValues);
  const [savedValues, setSavedValues] = useState<Values>(initialValues);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const configuredCount = useMemo(() => integrations.filter((item) => Boolean(savedValues[item.key]?.trim())).length, [savedValues]);
  const activeCount = useMemo(() => integrations.filter((item) => item.active && Boolean(savedValues[item.key]?.trim())).length, [savedValues]);

  async function save(item: typeof integrations[number]) {
    if (!canEdit) return;
    const value = (values[item.key] || "").trim();

    if (value && !item.pattern.test(value)) {
      setMessage(`صيغة ${item.name} غير صحيحة. راجع المعرّف ثم حاول مرة أخرى.`);
      return;
    }

    setBusyKey(item.key);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.from("site_settings").upsert({ key: item.key, value }, { onConflict: "key" });
    setBusyKey(null);

    if (error) {
      setMessage("تعذر حفظ الإعداد. لم يتم تغيير أي تكامل.");
      return;
    }

    setSavedValues((current) => ({ ...current, [item.key]: value }));
    setValues((current) => ({ ...current, [item.key]: value }));
    setMessage(value ? `تم حفظ ${item.name}.` : `تم مسح إعداد ${item.name}.`);
  }

  return (
    <main className="adminPage">
      <div className="container adminContainer">
        <div className="adminTopbar"><div><p className="eyebrow">التسويق</p><h1>التكاملات</h1></div></div>

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}><span>التكاملات المعرفة</span><strong>{integrations.length}</strong></div>
          <div className={styles.summaryCard}><span>معرّفات محفوظة</span><strong>{configuredCount}</strong></div>
          <div className={styles.summaryCard}><span>مفعلة فعليًا في الموقع</span><strong>{activeCount}</strong></div>
          <div className={styles.summaryCard}><span>JavaScript خام</span><strong className={styles.statusText}>محظور</strong></div>
        </div>

        <section className={styles.panel}>
          <h2>مدير تكاملات التسويق</h2>
          <p className={styles.muted}>أدخل المعرّفات العامة فقط. لا تقبل هذه الصفحة أكواد JavaScript أو مفاتيح سرية. Google Analytics يعمل بعد موافقة المستخدم، أما بقية المنصات فتظل محفوظة فقط حتى يتم ربطها برمجيًا بشكل آمن.</p>
          {!canEdit ? <div className={styles.readOnlyNotice}>يمكنك مراجعة الحالة، لكن تعديل معرّفات التكاملات متاح للمدير الأعلى فقط.</div> : null}
          {message ? <p className={styles.integrationMessage} role="status">{message}</p> : null}

          <div className={styles.integrationGrid}>
            {integrations.map((item) => {
              const configured = Boolean(savedValues[item.key]?.trim());
              const active = item.active && configured;
              return (
                <article className={styles.integrationCard} key={item.key}>
                  <div className={styles.integrationHeader}>
                    <div><span>{item.category}</span><h3>{item.name}</h3></div>
                    <span className={active ? styles.readyBadge : configured ? styles.pendingBadge : styles.offBadge}>
                      {active ? "مفعّل" : configured ? "محفوظ" : "غير مهيأ"}
                    </span>
                  </div>
                  <p>{item.note}</p>
                  <label className={styles.integrationField}>
                    <span>المعرّف العام</span>
                    <input
                      dir="ltr"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={item.placeholder}
                      value={values[item.key] || ""}
                      disabled={!canEdit || busyKey === item.key}
                      onChange={(event) => setValues((current) => ({ ...current, [item.key]: event.target.value }))}
                    />
                  </label>
                  {canEdit ? (
                    <div className={styles.integrationActions}>
                      <button className="button primary" type="button" disabled={busyKey === item.key || values[item.key] === savedValues[item.key]} onClick={() => save(item)}>
                        {busyKey === item.key ? "جارٍ الحفظ..." : "حفظ"}
                      </button>
                      {savedValues[item.key] ? <button className="button secondary" type="button" disabled={busyKey === item.key} onClick={() => setValues((current) => ({ ...current, [item.key]: "" }))}>مسح</button> : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.panel}>
          <h2>سياسة الأمان</h2>
          <p className={styles.muted}>تُخزن هنا معرّفات عامة محددة فقط. أي API secret أو OAuth secret أو مفتاح خاص يبقى خارج قاعدة البيانات وفي بيئة خادم آمنة. لا يسمح بتخزين أو تنفيذ JavaScript عشوائي.</p>
        </section>
      </div>
    </main>
  );
}
