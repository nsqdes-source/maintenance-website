"use client";

import { useMemo, useState } from "react";
import styles from "../Marketing.module.css";

function clean(value: string) { return value.trim(); }

export default function UtmBuilder() {
  const [baseUrl, setBaseUrl] = useState("https://mueenfix.com/");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [term, setTerm] = useState("");
  const [copied, setCopied] = useState(false);

  const generatedUrl = useMemo(() => {
    try {
      const url = new URL(baseUrl);
      const values = [
        ["utm_source", source],
        ["utm_medium", medium],
        ["utm_campaign", campaign],
        ["utm_content", content],
        ["utm_term", term],
      ] as const;
      for (const [key, value] of values) {
        const normalized = clean(value);
        if (normalized) url.searchParams.set(key, normalized);
        else url.searchParams.delete(key);
      }
      return url.toString();
    } catch { return ""; }
  }, [baseUrl, source, medium, campaign, content, term]);

  async function copyUrl() {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className={styles.panel}>
      <h2>منشئ روابط UTM</h2>
      <p className={styles.muted}>أنشئ رابط حملة موحدًا لاستخدامه في Google Ads أو الشبكات الاجتماعية أو الرسائل. لا يتم حفظ هذه القيم في قاعدة البيانات من هذه الصفحة.</p>
      <div className={styles.builderGrid}>
        <div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="utm-base-url">الرابط الأساسي</label><input id="utm-base-url" dir="ltr" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></div>
        <div className={styles.field}><label htmlFor="utm-source">المصدر utm_source</label><input id="utm-source" dir="ltr" value={source} onChange={(e) => setSource(e.target.value)} placeholder="google" /></div>
        <div className={styles.field}><label htmlFor="utm-medium">الوسيط utm_medium</label><input id="utm-medium" dir="ltr" value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="cpc" /></div>
        <div className={styles.field}><label htmlFor="utm-campaign">الحملة utm_campaign</label><input id="utm-campaign" dir="ltr" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="ac_october" /></div>
        <div className={styles.field}><label htmlFor="utm-content">المحتوى utm_content</label><input id="utm-content" dir="ltr" value={content} onChange={(e) => setContent(e.target.value)} placeholder="ad_1" /></div>
        <div className={styles.field}><label htmlFor="utm-term">الكلمة utm_term</label><input id="utm-term" dir="ltr" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="ac repair" /></div>
      </div>
      <div className={styles.generated}>
        <strong>الرابط الناتج</strong>
        <code>{generatedUrl || "أدخل رابطًا أساسيًا صحيحًا."}</code>
        <div className={styles.actions}>
          <button className="button primary" type="button" disabled={!generatedUrl} onClick={() => void copyUrl()}>{copied ? "تم النسخ" : "نسخ الرابط"}</button>
          {generatedUrl ? <a className="button secondary" href={generatedUrl} target="_blank" rel="noreferrer">فتح الرابط</a> : null}
        </div>
      </div>
    </section>
  );
}
