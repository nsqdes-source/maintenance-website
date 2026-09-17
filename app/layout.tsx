import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import "./admin/admin.css";
import HeaderAccountControl from "./components/HeaderAccountControl";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "معين | خدمات الصيانة",
  description: "خدمات صيانة عامة موثوقة وسريعة.",
};

function SiteHeader({ logoText, logoImage, ctaText }: { logoText: string; logoImage: string; ctaText: string }) {
  return (
    <header className="header">
      <div className="container nav">
        <Link className="logo" href="/" aria-label="العودة إلى الرئيسية">
          {logoImage ? <img src={logoImage} alt="" style={{ width: 38, height: 38, objectFit: "contain" }} /> : <span className="logoMark">ص</span>}
          <span>{logoText}</span>
        </Link>
        <nav className="navLinks" aria-label="التنقل الرئيسي">
          <Link href="/">الرئيسية</Link>
          <Link href="/#services">الخدمات</Link>
          <Link href="/#why-us">لماذا نحن</Link>
          <Link href="/#works">الأعمال</Link>
          <Link href="/#contact">تواصل معنا</Link>
        </nav>
        <HeaderAccountControl ctaText={ctaText} />
      </div>
    </header>
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: settings } = await supabase.from("site_settings").select("key,value");
  const theme = Object.fromEntries((settings ?? []).map(item => [item.key, item.value]));
  return (
    <html lang="ar" dir="rtl">
      <body style={{ "--brand-primary": theme.primary_color || "#0f172a", "--brand-accent": theme.accent_color || "#f59e0b" } as React.CSSProperties}>
        <SiteHeader logoText={theme.logo_text || "خدمات الصيانة"} logoImage={theme.logo_image_url || ""} ctaText={theme.header_cta_text || "تسجيل الدخول"} />
        {children}
      </body>
    </html>
  );
}
