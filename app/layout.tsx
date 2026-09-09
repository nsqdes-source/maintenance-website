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
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }}>
          <a
            href="/"
            aria-label="العودة إلى الصفحة الرئيسية"
            title="العودة إلى الرئيسية"
            style={{
              width: 44,
              height: 44,
              display: "grid",
              placeItems: "center",
              padding: 0,
              border: "1px solid #cbd5e1",
              borderRadius: "50%",
              background: "#fff",
              color: "#0f172a",
              textDecoration: "none",
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 21, height: 21, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }}>
              <path d="M3.5 10.5 12 3.8l8.5 6.7" />
              <path d="M5.5 9.5V20h13V9.5" />
              <path d="M9.5 20v-6h5v6" />
            </svg>
          </a>
          <HeaderAccountControl />
        </div>
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
