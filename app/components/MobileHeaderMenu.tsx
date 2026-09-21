"use client";

import Link from "next/link";
import { useState } from "react";
import { LanguageSwitcher } from "./LocaleContext";
import type { Locale } from "@/lib/locale";

export default function MobileHeaderMenu({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const labels = locale === "ar"
    ? [["/", "الرئيسية"], ["/#services", "الخدمات"], ["/#how-it-works", "كيف نعمل"], ["/#faq", "الأسئلة الشائعة"], ["/#contact", "تواصل معنا"]]
    : [["/", "Home"], ["/#services", "Services"], ["/#how-it-works", "How it works"], ["/#faq", "FAQ"], ["/#contact", "Contact"]];
  return <div className="mobileHeaderMenu">
    <button type="button" className="mobileHeaderTrigger" aria-expanded={open} aria-controls="mobile-site-navigation" aria-label={locale === "ar" ? "فتح قائمة الموقع" : "Open site menu"} onClick={() => setOpen(value => !value)}>
      <span aria-hidden>{open ? "×" : "☰"}</span>
    </button>
    {open ? <div className="mobileHeaderPanel" id="mobile-site-navigation">
      <nav aria-label={locale === "ar" ? "قائمة الجوال" : "Mobile navigation"}>{labels.map(([href, label]) => <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>)}</nav>
      <div className="mobileLanguageRow"><span>{locale === "ar" ? "اللغة" : "Language"}</span><LanguageSwitcher /></div>
    </div> : null}
  </div>;
}
