import type { Metadata } from "next";
import "./globals.css";
import "./admin/admin.css";
import HeaderAccountControl from "./components/HeaderAccountControl";

export const metadata: Metadata = {
  title: "خدمات الصيانة العامة",
  description: "خدمات صيانة عامة موثوقة وسريعة.",
};

function SiteHeader() {
  return (
    <header className="header">
      <div className="container nav">
        <a className="logo" href="/" aria-label="العودة إلى الرئيسية">
          <span className="logoMark">ص</span>
          <span>خدمات الصيانة</span>
        </a>
        <nav className="navLinks" aria-label="التنقل الرئيسي">
          <a href="/">الرئيسية</a>
          <a href="/#services">الخدمات</a>
          <a href="/#why-us">لماذا نحن</a>
          <a href="/#works">الأعمال</a>
          <a href="/#contact">تواصل معنا</a>
        </nav>
        <HeaderAccountControl />
      </div>
    </header>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
