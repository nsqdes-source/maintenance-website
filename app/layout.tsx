import type { Metadata } from "next";
import "./globals.css";
import "./admin/admin.css";

export const metadata: Metadata = {
  title: "خدمات الصيانة العامة",
  description: "خدمات صيانة عامة موثوقة وسريعة.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
