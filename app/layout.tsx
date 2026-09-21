import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import { getLocale, text, type Locale } from "@/lib/locale";
import { LocaleProvider, LanguageSwitcher } from "./components/LocaleContext";
import Link from "next/link";
import Script from "next/script";
import "./globals.css";
import "./admin/admin.css";
import HeaderAccountControl from "./components/HeaderAccountControl";
import AnalyticsBootstrap from "./components/AnalyticsBootstrap";
import MobileHeaderMenu from "./components/MobileHeaderMenu";
import { createClient } from "@/lib/supabase/server";

const tajawal = Tajawal({
  subsets: ["arabic"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
  variable: "--font-tajawal",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

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
        {gaMeasurementId ? <><Script src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`} strategy="afterInteractive" /><Script id="google-analytics" strategy="afterInteractive">{`window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} window.gtag = gtag; gtag('js', new Date()); gtag('config', '${gaMeasurementId}', { send_page_view: true });`}</Script></> : null}
        <AnalyticsBootstrap />
        <LocaleProvider locale={locale}>
          <SiteHeader logoText={locale === "en" ? theme.logo_text_en || theme.logo_text || "Mueen" : theme.logo_text || "معين"} logoImage={theme.logo_image_url || "/mueen-logo.png"} ctaText={locale === "en" ? theme.header_cta_text_en || "Sign in" : theme.header_cta_text || "تسجيل الدخول"} requestCtaText={locale === "en" ? theme.request_cta_text_en || "Request service" : theme.request_cta_text || "اطلب خدمة"} showRequestCta={theme.header_request_cta_visible !== "false"} locale={locale} />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
