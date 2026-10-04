"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";

type ConsentPreferences = {
  analytics: boolean;
  advertising: boolean;
};

const storageKey = "mueen:cookie-consent:v2";
const legacyStorageKey = "mueen:analytics-consent:v1";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __mueenAnalyticsEnabled?: boolean;
    __mueenAdvertisingEnabled?: boolean;
    __mueenGoogleAdsDestination?: string;
  }
}

function clearMeasurementCookies() {
  const names = document.cookie.split(";").map((part) => part.split("=")[0]?.trim()).filter(Boolean);
  const hostname = window.location.hostname;

  for (const name of names) {
    if (!name.startsWith("_ga") && !name.startsWith("_gcl")) continue;
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; path=/; domain=${hostname}; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; path=/; domain=.${hostname}; SameSite=Lax`;
  }
}

function parseSavedPreferences(value: string | null): ConsentPreferences | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ConsentPreferences>;
    if (typeof parsed.analytics === "boolean" && typeof parsed.advertising === "boolean") {
      return { analytics: parsed.analytics, advertising: parsed.advertising };
    }
  } catch {
    return null;
  }
  return null;
}

export default function AnalyticsConsent({
  locale,
  gaMeasurementId,
  googleAdsDestination,
}: {
  locale: Locale;
  gaMeasurementId?: string;
  googleAdsDestination?: string;
}) {
  const [preferences, setPreferences] = useState<ConsentPreferences | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [advertisingEnabled, setAdvertisingEnabled] = useState(false);
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;

  useEffect(() => {
    const saved = parseSavedPreferences(window.localStorage.getItem(storageKey));

    if (saved) {
      setPreferences(saved);
      setAnalyticsEnabled(saved.analytics);
      setAdvertisingEnabled(saved.advertising);
      setOpen(false);
    } else {
      const legacy = window.localStorage.getItem(legacyStorageKey);
      setAnalyticsEnabled(legacy === "granted");
      setAdvertisingEnabled(false);
      setOpen(true);
    }

    setReady(true);
  }, []);

  function choose(next: ConsentPreferences) {
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    window.localStorage.removeItem(legacyStorageKey);
    setPreferences(next);
    setAnalyticsEnabled(next.analytics);
    setAdvertisingEnabled(next.advertising);
    setOpen(false);
    setCustomizing(false);

    window.__mueenAnalyticsEnabled = next.analytics;
    window.__mueenAdvertisingEnabled = next.advertising;

    window.gtag?.("consent", "update", {
      analytics_storage: next.analytics ? "granted" : "denied",
      ad_storage: next.advertising ? "granted" : "denied",
      ad_user_data: next.advertising ? "granted" : "denied",
      ad_personalization: next.advertising ? "granted" : "denied",
    });

    if (!next.analytics || !next.advertising) clearMeasurementCookies();
  }

  if (!ready) return null;

  const adsBaseId = googleAdsDestination?.split("/")[0];
  const shouldLoadGoogleTag = Boolean(
    (preferences?.analytics && gaMeasurementId) ||
    (preferences?.advertising && adsBaseId)
  );
  const loaderId =
    preferences?.analytics && gaMeasurementId
      ? gaMeasurementId
      : preferences?.advertising
        ? adsBaseId
        : undefined;

  return (
    <>
      {shouldLoadGoogleTag && loaderId ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${loaderId}`} strategy="afterInteractive" />
          <Script id="google-measurement-consented" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            window.__mueenAnalyticsEnabled = ${preferences?.analytics ? "true" : "false"};
            window.__mueenAdvertisingEnabled = ${preferences?.advertising ? "true" : "false"};
            window.__mueenGoogleAdsDestination = ${JSON.stringify(googleAdsDestination || "")};
            gtag("consent", "default", {
              analytics_storage: "${preferences?.analytics ? "granted" : "denied"}",
              ad_storage: "${preferences?.advertising ? "granted" : "denied"}",
              ad_user_data: "${preferences?.advertising ? "granted" : "denied"}",
              ad_personalization: "${preferences?.advertising ? "granted" : "denied"}"
            });
            gtag("js", new Date());
            ${preferences?.analytics && gaMeasurementId ? `gtag("config", "${gaMeasurementId}", { send_page_view: true });` : ""}
            ${preferences?.advertising && adsBaseId ? `gtag("config", "${adsBaseId}", { send_page_view: false });` : ""}
          `}</Script>
        </>
      ) : null}

      {open ? (
        <section className="cookieConsent" role="dialog" aria-modal="false" aria-labelledby="cookie-consent-title">
          <div className="cookieConsentMain">
            <div>
              <strong id="cookie-consent-title">{t("نستخدم ملفات تعريف الارتباط", "We use cookies")}</strong>
              <p>{t("نستخدم الملفات الضرورية لتشغيل الموقع. ويمكنك السماح بملفات التحليلات والإعلانات لقياس الأداء والتحويلات وتحسين الحملات. يمكنك تغيير اختيارك لاحقًا.", "We use necessary cookies to run the site. You can also allow analytics and advertising cookies to measure performance and conversions and improve campaigns. You can change your choice later.")}</p>
              <div className="cookieConsentLinks"><Link href="/privacy">{t("سياسة الخصوصية", "Privacy policy")}</Link></div>
            </div>
            <div className="cookieConsentActions">
              <button type="button" className="button primary" onClick={() => choose({ analytics: true, advertising: true })}>{t("قبول الكل", "Accept all")}</button>
              <button type="button" className="button secondary" onClick={() => choose({ analytics: false, advertising: false })}>{t("رفض غير الضروري", "Reject non-essential")}</button>
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
              <div className="cookiePreferenceRow">
                <div><strong>{t("ملفات الإعلانات", "Advertising cookies")}</strong><p>{t("تسمح بقياس التحويلات الإعلانية مثل إتمام طلب خدمة، دون إرسال الاسم أو الجوال أو البريد أو العنوان.", "Allow advertising conversion measurement, such as a completed service request, without sending name, phone, email, or address.")}</p></div>
                <label className="cookieToggle"><input type="checkbox" checked={advertisingEnabled} onChange={(e) => setAdvertisingEnabled(e.target.checked)} /><span>{advertisingEnabled ? t("مفعلة", "On") : t("متوقفة", "Off")}</span></label>
              </div>
              <div className="cookiePreferencesActions"><button type="button" className="button primary" onClick={() => choose({ analytics: analyticsEnabled, advertising: advertisingEnabled })}>{t("حفظ التفضيلات", "Save preferences")}</button></div>
            </div>
          ) : null}
        </section>
      ) : (
        <button type="button" className="cookieConsentManage" onClick={() => { setOpen(true); setCustomizing(true); }}>{t("إعدادات ملفات الارتباط", "Cookie settings")}</button>
      )}
    </>
  );
}
