import type { Metadata } from "next";
import Script from "next/script";
import { Tajawal } from "next/font/google";
import { getLocale, text, type Locale } from "@/lib/locale";
import { LocaleProvider, LanguageSwitcher } from "./components/LocaleContext";
import Link from "next/link";
import "./globals.css";
import "./admin/admin.css";
import HeaderAccountControl from "./components/HeaderAccountControl";
import AnalyticsBootstrap from "./components/AnalyticsBootstrap";
import AnalyticsConsent from "./components/AnalyticsConsent";
import MobileHeaderMenu from "./components/MobileHeaderMenu";
import { createClient } from "@/lib/supabase/server";

const tajawal = Tajawal({
  subsets: ["arabic"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
  variable: "--font-tajawal",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl || "http://localhost:3000"),
  title: "معين لخدمات الصيانة في مكة | تكييف وسباكة وكهرباء ونجارة",
  description: "معين.. الصيانة أسهل. صيانة موثوقة، موعد واضح، وسعر عادل.",
  openGraph: { type: "website", locale: "ar_SA", title: "معين لخدمات الصيانة في مكة", description: "صيانة موثوقة، موعد واضح، وسعر عادل.", url: "/", siteName: "معين" },
  twitter: { card: "summary", title: "معين لخدمات الصيانة في مكة", description: "صيانة موثوقة، موعد واضح، وسعر عادل." },
};

function SiteHeader({ logoText, logoImage, ctaText, requestCtaText, showRequestCta, locale }: { logoText: string; logoImage: string; ctaText: string; requestCtaText: string; showRequestCta: boolean; locale: Locale }) {
  return (
    <header className="header">
      <div className="container nav">
        <Link className="logo" href="/" aria-label="العودة إلى الرئيسية">
          {logoImage ? <img src={logoImage} alt="" style={{ width: 38, height: 38, objectFit: "contain" }} /> : <span className="logoMark">ص</span>}
          <span>{logoText}</span>
        </Link>
        <nav className="navLinks" aria-label="التنقل الرئيسي">
          <Link href="/">{text(locale, "الرئيسية", "Home")}</Link>
          <Link href="/#services">{text(locale, "الخدمات", "Services")}</Link>
          <Link href="/#how-it-works">{text(locale, "كيف نعمل", "How it works")}</Link>
          <Link href="/#faq">{text(locale, "الأسئلة الشائعة", "FAQ")}</Link>
          <Link href="/#contact">{text(locale, "تواصل معنا", "Contact")}</Link>
        </nav>
        <div className="desktopLanguage"><LanguageSwitcher /></div>
        <div className="headerActions">{showRequestCta ? <Link className="button primary navCta requestHeaderCta" href="/request">{requestCtaText}</Link> : null}<HeaderAccountControl ctaText={ctaText} /></div>
        <MobileHeaderMenu locale={locale} />
      </div>
    </header>
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const supabase = await createClient();
  const { data: settings } = await supabase.from("site_settings").select("key,value");
  const theme = Object.fromEntries((settings ?? []).map(item => [item.key, item.value]));
  const gaMeasurementId = theme.marketing_ga_measurement_id || undefined;
  const googleAdsDestination = theme.marketing_google_ads_id || undefined;
  const googleAdsBaseId = googleAdsDestination?.split("/")[0];
  const googleTagLoaderId = gaMeasurementId || googleAdsBaseId;
  const rawGtmId = theme.marketing_gtm_id || "";
  const gtmId = /^GTM-[A-Z0-9]+$/i.test(rawGtmId) ? rawGtmId : undefined;
  const hasGoogleIntegration = Boolean(googleTagLoaderId || gtmId);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "معين لخدمات الصيانة",
    description: "صيانة موثوقة، موعد واضح، وسعر عادل.",
    url: siteUrl || undefined,
    areaServed: { "@type": "City", name: "مكة المكرمة" },
    availableLanguage: ["ar", "en"],
    knowsAbout: ["صيانة التكييف", "السباكة", "الكهرباء", "النجارة"],
  };
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <body className={tajawal.variable} style={{ "--brand-primary": theme.primary_color || "#0f172a", "--brand-accent": theme.accent_color || "#f59e0b", "--site-background": theme.background_color || "#f8fafc" } as React.CSSProperties}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        {hasGoogleIntegration ? (
          <Script id="google-consent-default" strategy="beforeInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            window.__mueenAnalyticsEnabled = false;
            window.__mueenAdvertisingEnabled = false;
            window.__mueenGoogleAdsDestination = ${JSON.stringify(googleAdsDestination || "")};
            gtag("consent", "default", {
              analytics_storage: "denied",
              ad_storage: "denied",
              ad_user_data: "denied",
              ad_personalization: "denied",
              wait_for_update: 500
            });
            gtag("js", new Date());
            ${gaMeasurementId ? `gtag("config", "${gaMeasurementId}", { send_page_view: true });` : ""}
            ${googleAdsBaseId ? `gtag("config", "${googleAdsBaseId}", { send_page_view: false });` : ""}
          `}</Script>
        ) : null}
        {googleTagLoaderId ? <Script src={`https://www.googletagmanager.com/gtag/js?id=${googleTagLoaderId}`} strategy="afterInteractive" /> : null}
        {gtmId ? (
          <>
            <Script id="google-tag-manager" strategy="afterInteractive">{`
              window.dataLayer = window.dataLayer || [];
              window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
            `}</Script>
            <Script src={`https://www.googletagmanager.com/gtm.js?id=${gtmId}`} strategy="afterInteractive" />
            <noscript><iframe src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`} height="0" width="0" style={{ display: "none", visibility: "hidden" }} /></noscript>
          </>
        ) : null}
        <AnalyticsBootstrap />
        <AnalyticsConsent locale={locale} googleAdsDestination={googleAdsDestination} />
        <LocaleProvider locale={locale}>
          <SiteHeader logoText={locale === "en" ? theme.logo_text_en || theme.logo_text || "Mueen" : theme.logo_text || "معين"} logoImage={theme.logo_image_url || "/mueen-logo.png"} ctaText={locale === "en" ? theme.header_cta_text_en || "Sign in" : theme.header_cta_text || "تسجيل الدخول"} requestCtaText={locale === "en" ? theme.request_cta_text_en || "Request service" : theme.request_cta_text || "اطلب خدمة"} showRequestCta={theme.header_request_cta_visible !== "false"} locale={locale} />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
