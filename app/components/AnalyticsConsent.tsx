"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";

type Consent = "granted" | "denied" | null;
const storageKey = "mueen:analytics-consent:v1";

declare global {
  interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; }
}

function clearAnalyticsCookies() {
  const names = document.cookie.split(";").map((part) => part.split("=")[0]?.trim()).filter(Boolean);
  const hostname = window.location.hostname;
  for (const name of names) {
    if (!name.startsWith("_ga")) continue;
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; path=/; domain=${hostname}; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; path=/; domain=.${hostname}; SameSite=Lax`;
  }
}

export default function AnalyticsConsent({ locale, gaMeasurementId }: { locale: Locale; gaMeasurementId?: string }) {
  const [consent, setConsent] = useState<Consent>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    const next: Consent = saved === "granted" || saved === "denied" ? saved : null;
    setConsent(next);
    setAnalyticsEnabled(next === "granted");
    setOpen(next === null);
    setReady(true);
  }, []);

  function choose(next: Exclude<Consent, null>) {
    window.localStorage.setItem(storageKey, next);
    setConsent(next);
    setAnalyticsEnabled(next === "granted");
    setOpen(false);
    setCustomizing(false);
    if (next === "denied") {
      window.gtag?.("consent", "update", { analytics_storage: "denied" });
      clearAnalyticsCookies();
    }
  }

  if (!ready) return null;

  return (
    <>
      {gaMeasurementId && consent === "granted" ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`} strategy="afterInteractive" />
          <Script id="google-analytics-consented" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag("consent", "default", { analytics_storage: "granted" });
            gtag("js", new Date());
            gtag("config", "${gaMeasurementId}", { send_page_view: true });
          `}</Script>
        </>
      ) : null}

      {open ? (
        <section className="cookieConsent" role="dialog" aria-modal="false" aria-labelledby="cookie-consent-title">
          <div className="cookieConsentMain">
            <div>
              <strong id="cookie-consent-title">{t("نستخدم ملفات تعريف الارتباط", "We use cookies")}</strong>
              <p>{t("نستخدم ملفات تعريف الارتباط الضرورية لتشغيل الموقع، ويمكنك السماح بملفات التحليلات لمساعدتنا على فهم استخدام الموقع وتحسينه. يمكنك تغيير اختيارك لاحقًا.", "We use necessary cookies to run the site. You can also allow analytics cookies to help us understand and improve usage. You can change your choice later.")}</p>
              <div className="cookieConsentLinks"><Link href="/privacy">{t("سياسة الخصوصية", "Privacy policy")}</Link></div>
            </div>
            <div className="cookieConsentActions">
              <button type="button" className="button primary" onClick={() => choose("granted")}>{t("قبول الكل", "Accept all")}</button>
              <button type="button" className="button secondary" onClick={() => choose("denied")}>{t("رفض غير الضروري", "Reject non-essential")}</button>
              <button type="button" className="cookieCustomizeButton" onClick={() => setCustomizing((value) => !value)}>{t("تخصيص", "Customize")}</button>
            </div>
          </div>

          {customizing ? (
            <div className="cookiePreferences">
              <div className="cookiePreferenceRow">
                <div><strong>{t("ملفات ضرورية", "Necessary cookies")}</strong><p>{t("مطلوبة لتشغيل الموقع ولا يمكن تعطيلها.", "Required for the site to function and cannot be disabled.")}</p></div>
                <span className="cookieAlwaysOn">{t("دائمًا مفعلة", "Always on")}</span>
              </div>
              <div className="cookiePreferenceRow">
                <div><strong>{t("ملفات التحليلات", "Analytics cookies")}</strong><p>{t("تساعدنا على قياس أداء الموقع دون إرسال بياناتك الشخصية ضمن أحداث القياس.", "Help us measure site performance without sending your personal data in analytics events.")}</p></div>
                <label className="cookieToggle"><input type="checkbox" checked={analyticsEnabled} onChange={(e) => setAnalyticsEnabled(e.target.checked)} /><span>{analyticsEnabled ? t("مفعلة", "On") : t("متوقفة", "Off")}</span></label>
              </div>
              <div className="cookiePreferencesActions"><button type="button" className="button primary" onClick={() => choose(analyticsEnabled ? "granted" : "denied")}>{t("حفظ التفضيلات", "Save preferences")}</button></div>
            </div>
          ) : null}
        </section>
      ) : (
        <button type="button" className="cookieConsentManage" onClick={() => { setOpen(true); setCustomizing(true); }}>{t("إعدادات ملفات الارتباط", "Cookie settings")}</button>
      )}
    </>
  );
}
